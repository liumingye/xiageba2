import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { getRedis } from "#server/lib/redis";

/**
 * 分布式锁（基于 Redis SET NX PX）
 *
 * 背景：Nitro 的 `scheduledTasks` 会在**每个实例**上各自触发。多副本部署时，
 * 同一个 cron 任务会被执行 N 次——轻则重复推送通知，重则并发操作网盘文件。
 *
 * 为什么不能用「先 GET 判断、再 SET」的写法：
 *   两步之间存在竞态窗口，多个实例会同时通过检查。SET NX 是单条命令、原子完成。
 *
 * 为什么释放要带 token：
 *   持有者 A 若因耗时过长导致锁过期，B 会抢到锁；此时 A 结束直接 DEL，
 *   删掉的其实是 B 的锁。释放前必须比对 token（这步用 Lua 保证原子）。
 */

/** 释放锁：仅当 token 仍是自己时删除 */
export const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/** 续期：同样校验 token，避免给别人的锁续命 */
export const RENEW_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

export interface AcquireLockOptions {
  /** 锁的初始存活时间（秒）。持有者崩溃时兜底自动释放，避免永久死锁 */
  ttlSeconds?: number;
  /**
   * 持有期间是否自动续期（间隔 TTL/3）。默认开启：
   * 任务实际耗时超过 TTL 时不会被他人抢占。
   */
  renew?: boolean;
}

export interface LockHandle {
  key: string;
  token: string;
  /** 释放锁，幂等 */
  release: () => Promise<void>;
}

export type AcquireLockResult =
  | { acquired: true; lock: LockHandle }
  /** locked：已被其他实例持有；unavailable：Redis 不可达，无法协调 */
  | { acquired: false; reason: "locked" | "unavailable" };

/** 生成唯一 token：区分「自己持有」与「他人持有」的前提 */
const buildToken = () =>
  `${process.env.HOSTNAME || "nuxt"}-${process.pid}-${randomUUID()}`;

export const acquireLock = async (
  key: string,
  options: AcquireLockOptions = {},
): Promise<AcquireLockResult> => {
  const { ttlSeconds = 300, renew = true } = options;

  let client: Redis | null = null;
  try {
    client = await getRedis();
  } catch (err: any) {
    console.error(`[Lock] 获取 Redis 连接失败 [${key}]:`, err?.message || err);
  }

  if (!client) {
    return { acquired: false, reason: "unavailable" };
  }

  const token = buildToken();
  const ttlMs = Math.max(1_000, Math.round(ttlSeconds * 1000));

  try {
    const ok = await client.set(key, token, "PX", ttlMs, "NX");
    if (ok !== "OK") {
      return { acquired: false, reason: "locked" };
    }
  } catch (err: any) {
    console.error(`[Lock] 抢占锁失败 [${key}]:`, err?.message || err);
    return { acquired: false, reason: "unavailable" };
  }

  let renewTimer: ReturnType<typeof setInterval> | undefined;
  if (renew) {
    const intervalMs = Math.max(1_000, Math.floor(ttlMs / 3));
    renewTimer = setInterval(() => {
      client
        ?.eval(RENEW_LOCK_LUA, 1, key, token, String(ttlMs))
        .catch((err: any) => {
          console.error(`[Lock] 续期失败 [${key}]:`, err?.message || err);
        });
    }, intervalMs);
    renewTimer.unref?.(); // 不阻止进程退出
  }

  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    if (renewTimer) clearInterval(renewTimer);
    try {
      await client?.eval(RELEASE_LOCK_LUA, 1, key, token);
    } catch (err: any) {
      // 释放失败不必 panic：锁有 TTL，最终会自行过期
      console.error(`[Lock] 释放锁失败 [${key}]:`, err?.message || err);
    }
  };

  return { acquired: true, lock: { key, token, release } };
};

/**
 * 带分布式锁执行任务，自动释放。
 *
 * @param onNoRedis Redis 不可达时的策略：
 *   - `"skip"`（默认）：跳过，保证绝不重复执行
 *   - `"run"`：照常执行，退化为「每个实例各跑一次」——
 *     适合漏执行的代价高于重复执行的任务（如账号失效告警）
 */
export const withLock = async <T>(
  key: string,
  fn: () => Promise<T>,
  options: AcquireLockOptions & { onNoRedis?: "skip" | "run" } = {},
): Promise<{ executed: boolean; skipped: boolean; result?: T }> => {
  const { onNoRedis = "skip", ...lockOptions } = options;

  const res = await acquireLock(key, lockOptions);

  if (!res.acquired) {
    if (res.reason === "unavailable" && onNoRedis === "run") {
      console.warn(
        `[Lock] Redis 不可用，${key} 按 onNoRedis=run 降级执行（多实例下会重复）`,
      );
      const result = await fn();
      return { executed: true, skipped: false, result };
    }
    return { executed: false, skipped: true };
  }

  try {
    const result = await fn();
    return { executed: true, skipped: false, result };
  } finally {
    await res.lock.release();
  }
};
