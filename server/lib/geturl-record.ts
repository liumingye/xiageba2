import { type H3Event, getRequestIP } from "h3";
import { getRedis } from "#server/lib/redis";

/** 单个 IP 每天允许的 geturl 转存次数上限 */
export const GETURL_DAILY_LIMIT = 20;

/** Redis key 前缀 */
const RECORD_KEY_PREFIX = "geturl:count:";

/**
 * 高性能 Lua 脚本：原子递增并在首次创建时设置 TTL (1次 RTT)
 * KEYS[1]: record key
 * ARGV[1]: ttl (seconds)
 */
const INCR_EXPIRE_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if tonumber(current) == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

/**
 * 获取客户端真实 IP
 */
export function getClientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) || "";
}

/**
 * 格式化当前日期为 YYYY-MM-DD (基于系统/TZ时区)
 */
function getTodayString(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * 计算距离次日零点的剩余秒数，加上 300s (5分钟) 冗余缓冲，避免临界点 Key 提前丢弃
 */
function getSecondsUntilTomorrow(now: Date): number {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
  );
  const diffSeconds = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
  return Math.max(60, diffSeconds + 300);
}

/** 某网盘类型 + IP 今日的计数 key */
function recordKey(netdiskType: string, ip: string, todayStr: string): string {
  return `${RECORD_KEY_PREFIX}${todayStr}:${netdiskType}:${ip}`;
}

/**
 * 查询某 IP 今日某网盘类型的 geturl 次数。
 */
export async function getTodayGeturlCount(
  ip: string,
  netdiskType: string,
): Promise<number> {
  if (!ip || !netdiskType) return 0;

  const now = new Date();
  // 每天 23:30 之后不再限流，直接放行（分钟级快速判断，无需复杂计算）
  if (now.getHours() === 23 && now.getMinutes() > 30) {
    return 0;
  }

  try {
    const client = await getRedis();
    if (!client) return 0;

    const key = recordKey(netdiskType, ip, getTodayString(now));
    const value = await client.get(key);
    if (!value) return 0;

    const count = parseInt(value, 10);
    return Number.isNaN(count) ? 0 : count;
  } catch (err) {
    console.error("查询今日 geturl 次数失败", err);
    return 0;
  }
}

/**
 * 记录某 IP 今日某网盘类型 geturl 次数 +1（使用 Lua 脚本保证极致性能与原子性）
 */
export async function incrementTodayGeturlCount(
  ip: string,
  netdiskType: string,
): Promise<number | null> {
  if (!ip || !netdiskType) return null;

  const now = new Date();
  if (now.getHours() === 23 && now.getMinutes() > 30) {
    return null;
  }

  try {
    const client = await getRedis();
    if (!client) return null;

    const todayStr = getTodayString(now);
    const key = recordKey(netdiskType, ip, todayStr);
    const ttlSeconds = getSecondsUntilTomorrow(now);

    // ⚡ 核心性能优化：通过 eval/evalsha 在 Redis 端一次性完成 INCR + EXPIRE
    const count = (await client.eval(
      INCR_EXPIRE_LUA,
      1,
      key,
      ttlSeconds.toString(),
    )) as number;

    return count;
  } catch (err) {
    console.error("记录 geturl 次数失败", err);
    return null;
  }
}
