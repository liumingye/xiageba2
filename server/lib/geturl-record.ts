import { getRequestHeader, type H3Event } from "h3";
import { getRedis } from "#server/lib/redis";

/** 单个 IP 每天允许的 geturl 转存次数上限 */
export const GETURL_DAILY_LIMIT = 10;

/** Redis key 前缀 */
const RECORD_KEY_PREFIX = "geturl:count:";

/**
 * 获取客户端真实 IP：X-Forwarded-For → X-Real-IP → socket.remoteAddress
 * （与 nuxt-api-shield 限流识别的顺序保持一致）
 */
export function getClientIp(event: H3Event): string {
  const xff = getRequestHeader(event, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const xRealIp = getRequestHeader(event, "x-real-ip");
  if (xRealIp) {
    const trimmed = xRealIp.trim();
    if (trimmed) return trimmed;
  }

  return event.node.req.socket.remoteAddress || "";
}

/** 本地时区的今日日期字符串（YYYY-MM-DD） */
function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 距次日 0 点（本地时区）的秒数再减去 30 分钟，用于给 key 设置过期时间。
 * 保证至少保留 1 秒，防止过期时间非法。
 */
function secondsUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const seconds = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
  return Math.max(1, seconds - 30 * 60);
}

/** 某网盘类型 + IP 今日的计数 key */
function recordKey(netdiskType: string, ip: string): string {
  return `${RECORD_KEY_PREFIX}${todayKey()}:${netdiskType}:${ip}`;
}

/**
 * 查询某 IP 今日某网盘类型的 geturl 次数。
 * Redis 未配置或查询失败时返回 0（放行），不阻塞转存主流程。
 */
export async function getTodayGeturlCount(
  ip: string,
  netdiskType: string,
): Promise<number> {
  if (!ip || !netdiskType) return 0;
  try {
    const client = await getRedis();
    if (!client) return 0;

    const value = await client.get(recordKey(netdiskType, ip));
    if (!value) return 0;

    const count = parseInt(value, 10);
    return Number.isNaN(count) ? 0 : count;
  } catch (err) {
    console.error("查询今日 geturl 次数失败", err);
    return 0;
  }
}

/**
 * 记录某 IP 今日某网盘类型 geturl 次数 +1（原子 INCR，首次写入时设置过期时间）。
 * 返回更新后的计数；Redis 不可用时返回 null。
 * 内部已捕获异常，调用方可直接 fire-and-forget。
 */
export async function incrementTodayGeturlCount(
  ip: string,
  netdiskType: string,
): Promise<number | null> {
  if (!ip || !netdiskType) return null;
  try {
    const client = await getRedis();
    if (!client) return null;

    const key = recordKey(netdiskType, ip);
    const count = await client.incr(key);
    // 首次写入（计数值从 0 → 1）时设置过期时间，避免 key 永久残留
    if (count === 1) {
      await client.expire(key, secondsUntilTomorrow());
    }
    return count;
  } catch (err) {
    console.error("记录 geturl 次数失败", err);
    return null;
  }
}
