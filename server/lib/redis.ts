import { Redis } from "ioredis";
import { getConfigValues } from "#server/lib/configCache";

let redis: Redis | null = null;
let redisConfigSig = "";

const REDIS_CONFIG_KEYS = [
  "redis_host",
  "redis_port",
  "redis_db",
  "redis_password",
];

const buildConfigSig = (cfg: Record<string, string>) => {
  return `${cfg.redis_host}:${cfg.redis_port}:${cfg.redis_db}:${cfg.redis_password}`;
};

/**
 * 获取 Redis 客户端（根据 Config 表配置延迟初始化，未配置时返回 null）
 */
export const getRedis = async (): Promise<Redis | null> => {
  const cfg = await getConfigValues(REDIS_CONFIG_KEYS);

  if (!cfg.redis_host) {
    if (redis) {
      redis.disconnect();
      redis = null;
      redisConfigSig = "";
    }
    return null;
  }

  const port = parseInt(cfg.redis_port || "6379", 10) || 6379;
  const db = parseInt(cfg.redis_db || "0", 10) || 0;
  const password = cfg.redis_password || undefined;
  const sig = buildConfigSig(cfg);

  if (redis && sig === redisConfigSig) {
    return redis;
  }

  if (redis) {
    redis.disconnect();
  }

  const client = new Redis({
    host: cfg.redis_host,
    port,
    db,
    password,
    lazyConnect: true,
    retryStrategy: () => null,
  });

  try {
    await client.connect();
  } catch (err: any) {
    console.error("Redis 连接失败:", err.message || err);
    client.disconnect();
    return null;
  }

  redis = client;
  redisConfigSig = sig;
  return redis;
};

/**
 * 从 Redis 读取缓存
 */
export const getRedisCache = async <T>(key: string): Promise<T | null> => {
  const client = await getRedis();
  if (!client) return null;

  try {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (err: any) {
    console.error("Redis 读取失败:", err.message || err);
    return null;
  }
};

/**
 * 写入 Redis 缓存（默认 30 分钟）
 */
export const setRedisCache = async (
  key: string,
  value: unknown,
  ttlSeconds = 30 * 60,
): Promise<void> => {
  const client = await getRedis();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err: any) {
    console.error("Redis 写入失败:", err.message || err);
  }
};
