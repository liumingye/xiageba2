import { Redis } from "ioredis";
import { getConfigValues } from "#server/lib/configCache";

let redis: Redis | null = null;
let redisConfigSig = "";

// 🔒 核心并发防线：存放正在运行的初始化 Promise
let initPromise: Promise<Redis | null> | null = null;
// ⏳ 性能防线：记录上一次从数据库读取配置的时间戳
let lastConfigCheckTime = 0;
const CONFIG_CHECK_INTERVAL = 5000; // 5秒内不重复读取数据库配置，极高并发下直接走内存直通车

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
 * 获取 Redis 客户端（完美防御并发冲突与高频配置查询）
 */
export const getRedis = async (): Promise<Redis | null> => {
  const now = Date.now();

  // ⚡ 性能优化点：如果连接已经健康存在，且离上次检查配置不到 5 秒，直接绿色通道返回，不碰数据库
  if (redis && now - lastConfigCheckTime < CONFIG_CHECK_INTERVAL) {
    return redis;
  }

  // 🔒 互斥锁控制：如果当前已经有其他请求在触发连接或检查，直接排队搭便车，防止并发多次初始化
  if (initPromise) {
    return initPromise;
  }

  // 开启原子初始化锁
  initPromise = (async () => {
    try {
      const cfg = await getConfigValues(REDIS_CONFIG_KEYS);
      lastConfigCheckTime = Date.now(); // 更新检查时间

      // 情况A：未配置 Host，关闭并清理旧连接
      if (!cfg.redis_host) {
        if (redis) {
          console.warn("[Redis] 配置中的 host 已被清空，正在断开旧连接...");
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

      // 情况B：连接存在且配置没变，直接复用
      if (redis && sig === redisConfigSig) {
        return redis;
      }

      // 情况C：配置变了，干净利落地断开旧连接
      if (redis) {
        console.log("[Redis] 检测到配置变更，正在重启连接...");
        redis.disconnect();
        redis = null;
      }

      // 情况D：创建新连接
      const client = new Redis({
        host: cfg.redis_host,
        port,
        db,
        password,
        lazyConnect: true,
        retryStrategy: (times) => {
          // 限制重试策略，防止无限失败重连打满日志
          if (times > 3) return null;
          return Math.min(times * 100, 2000);
        },
      });

      await client.connect();

      // 成功后写入内存全局变量
      redis = client;
      redisConfigSig = sig;
      return redis;
    } catch (err: any) {
      console.error("[Redis] 初始化连接失败:", err.message || err);
      redis = null;
      redisConfigSig = "";
      return null;
    }
  })();

  try {
    return await initPromise;
  } finally {
    // 🔓 无论初始化成功还是失败，执行完毕后必须释放 Promise 锁，允许下一次需要时的正常调用
    initPromise = null;
  }
};

/**
 * 从 Redis 读取缓存
 */
export const getRedisCache = async <T>(key: string): Promise<T | null> => {
  try {
    const client = await getRedis();
    if (!client) return null;

    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (err: any) {
    console.error(`[Redis] 读取 Key [${key}] 失败:`, err.message || err);
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
  try {
    const client = await getRedis();
    if (!client) return;

    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err: any) {
    console.error(`[Redis] 写入 Key [${key}] 失败:`, err.message || err);
  }
};

/**
 * 从 Redis 删除缓存
 */
export const delRedisCache = async (key: string): Promise<void> => {
  try {
    const client = await getRedis();
    if (!client) return;

    await client.del(key);
  } catch (err: any) {
    console.error(`[Redis] 删除 Key [${key}] 失败:`, err.message || err);
  }
};
