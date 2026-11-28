/**
 * 依赖服务（PostgreSQL / Redis）健康快照，仅后台可用，挂在 /api/admin/system/services
 *
 * 始终返回 200，故障体现在各项的 status 字段里：
 *   postgres: up | down
 *   redis:    up | down | unconfigured（Config 表 redis_host 为空）| unknown（读不到配置）
 *
 * PG 走 prisma.$queryRaw，底层 pg 连接池没有连接超时，网络黑洞时会久挂，
 * 所以这里自带 3 秒硬超时；失败后进入 10 秒冷却，避免每次刷新都往池里堆一个挂起的连接。
 * Redis 复用 getRedis()：不可达时它最多阻塞 5 秒，之后 10 秒冷却期内直接返回 null。
 */
import { prisma } from "#server/lib/prisma";
import { getRedis } from "#server/lib/redis";
import { getConfigValues } from "#server/lib/configCache";

const PG_TIMEOUT_MS = 3000;
const FAILURE_COOLDOWN_MS = 10_000;

type ServiceStatus = "up" | "down" | "unconfigured" | "unknown";

interface ServiceResult {
  status: ServiceStatus;
  version: string | null;
  latencyMs: number | null;
  message: string | null;
}

interface PostgresResult extends ServiceResult {
  fullVersion: string | null;
}

let pgCooldownUntil = 0;
let pgLastErrorMessage = "";

const firstLine = (e: any, fallback: string) =>
  String(e?.message || fallback).split("\n")[0] ?? "";

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`探测超时（${ms / 1000} 秒）`)),
      ms,
    );
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });

const parsePgVersion = (full: string) =>
  /^PostgreSQL\s+(\d+(?:\.\d+)*)/.exec(full)?.[1] ?? null;

const parseRedisVersion = (info: string) =>
  /^redis_version:(.+)$/m.exec(info)?.[1]?.trim() ?? null;

const probePostgres = async (): Promise<PostgresResult> => {
  if (Date.now() < pgCooldownUntil) {
    return {
      status: "down",
      version: null,
      fullVersion: null,
      latencyMs: null,
      message: `${pgLastErrorMessage}（${FAILURE_COOLDOWN_MS / 1000} 秒内不再重试）`,
    };
  }

  const start = Date.now();
  try {
    // 一次往返同时拿到版本与延迟
    const rows = await withTimeout(
      prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`,
      PG_TIMEOUT_MS,
    );
    const fullVersion = rows[0]?.version || "";
    const short = parsePgVersion(fullVersion);
    return {
      status: "up",
      version: short ? `PostgreSQL ${short}` : null,
      fullVersion: fullVersion || null,
      latencyMs: Date.now() - start,
      message: null,
    };
  } catch (e: any) {
    pgLastErrorMessage = firstLine(e, "连接失败");
    pgCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
    return {
      status: "down",
      version: null,
      fullVersion: null,
      latencyMs: null,
      message: pgLastErrorMessage,
    };
  }
};

const probeRedis = async (): Promise<ServiceResult> => {
  let host: string;
  try {
    const cfg = await getConfigValues(["redis_host"]);
    host = cfg.redis_host ?? "";
  } catch (e: any) {
    return {
      status: "unknown",
      version: null,
      latencyMs: null,
      message: `无法读取 Redis 配置：${firstLine(e, "未知错误")}`,
    };
  }

  if (!host) {
    return {
      status: "unconfigured",
      version: null,
      latencyMs: null,
      message: "未配置 Redis",
    };
  }

  const client = await getRedis();
  if (!client) {
    return {
      status: "down",
      version: null,
      latencyMs: null,
      message: "连接失败",
    };
  }

  const start = Date.now();
  try {
    const [, info] = await Promise.all([client.ping(), client.info("server")]);
    return {
      status: "up",
      version: parseRedisVersion(info),
      latencyMs: Date.now() - start,
      message: null,
    };
  } catch (e: any) {
    return {
      status: "down",
      version: null,
      latencyMs: null,
      message: firstLine(e, "连接失败"),
    };
  }
};

export default defineEventHandler(async () => {
  const [postgres, redis] = await Promise.all([probePostgres(), probeRedis()]);
  return { checkedAt: new Date().toISOString(), postgres, redis };
});
