import { Redis } from "ioredis";
import { getConfigValues } from "#server/lib/configCache";

let redis: Redis | null = null;
let redisConfigSig = "";

// 🔒 核心并发防线：存放正在运行的初始化 Promise
let initPromise: Promise<Redis | null> | null = null;
// ⏳ 性能防线：记录上一次从数据库读取配置的时间戳
let lastConfigCheckTime = 0;
const CONFIG_CHECK_INTERVAL = 5000; // 5秒内不重复读取数据库配置，极高并发下直接走内存直通车
// ⏳ 建连失败后的冷却截止时间，避免 Redis 不可达时每个请求都卡在建连超时上
let nextConnectAttemptAt = 0;

const REDIS_CONFIG_KEYS = [
  "redis_host",
  "redis_port",
  "redis_db",
  "redis_password",
];

/** 建连 / 单命令超时，毫秒 */
const CONNECT_TIMEOUT_MS = 5_000;
/** 建连失败后的冷却期，毫秒：冷却期内直接快速失败，不再尝试建连 */
const RETRY_COOLDOWN_MS = 10_000;
/**
 * ioredis 中「已彻底停止、不会再自愈」的状态。
 * - end：retryStrategy 返回 null 或主动 quit，连接永久停止
 * - close：socket 已关闭且不再重连
 * 处于这两个状态的客户端必须丢弃重建，否则会被永久复用。
 */
const DEAD_STATUSES = new Set(["end", "close"]);
/** 同类 error 日志的最小间隔，避免重连风暴打满日志 */
const ERROR_LOG_INTERVAL_MS = 60_000;

const isDead = (client: Redis) => DEAD_STATUSES.has(client.status);

const buildConfigSig = (cfg: Record<string, string>) => {
  return `${cfg.redis_host}:${cfg.redis_port}:${cfg.redis_db}:${cfg.redis_password}`;
};

let lastErrorLogAt = 0;

/** 给 connect() 套一个硬超时：ioredis 在重试期间 connect promise 不会 settle */
function connectWithTimeout(client: Redis): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    client.connect(),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`连接超时（${CONNECT_TIMEOUT_MS}ms）`)),
        CONNECT_TIMEOUT_MS,
      );
      // 不阻止进程退出
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * 获取 Redis 客户端（完美防御并发冲突与高频配置查询）
 */
export const getRedis = async (): Promise<Redis | null> => {
  const now = Date.now();

  // ⚡ 性能优化点：如果连接已经健康存在，且离上次检查配置不到 5 秒，直接绿色通道返回，不碰数据库
  // 🔒 必须排除已彻底停止的连接，否则死客户端会被永久复用
  if (
    redis &&
    !isDead(redis) &&
    now - lastConfigCheckTime < CONFIG_CHECK_INTERVAL
  ) {
    return redis;
  }

  // 🔒 互斥锁控制：如果当前已经有其他请求在触发连接或检查，直接排队搭便车，防止并发多次初始化
  if (initPromise) {
    return initPromise;
  }

  // 开启原子初始化锁
  initPromise = (async () => {
    // 提到外层，确保失败路径也能关闭客户端（否则 socket 与定时器泄漏）
    let client: Redis | null = null;

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
        if (isDead(redis)) {
          // 🔒 自愈点：连接已彻底停止（重试策略放弃 / 被手动关闭），
          // 原实现只比配置签名不比 status，死客户端会被永久复用，
          // 导致 Redis 功能在进程生命周期内静默失效，只能重启恢复。
          console.warn(
            `[Redis] 连接已失效（status=${redis.status}），正在重建...`,
          );
          redis.disconnect();
          redis = null;
          redisConfigSig = "";
        } else {
          return redis;
        }
      }

      // 情况C：配置变了，干净利落地断开旧连接
      if (redis) {
        console.log("[Redis] 检测到配置变更，正在重启连接...");
        redis.disconnect();
        redis = null;
      }

      // ⏳ 冷却期：上一次建连失败后短时间内不再重试。
      // 没有这个，Redis 不可达时每个请求都要白白等一个 5 秒的连接超时。
      if (Date.now() < nextConnectAttemptAt) {
        return null;
      }

      // 情况D：创建新连接
      client = new Redis({
        host: cfg.redis_host,
        port,
        db,
        password,
        lazyConnect: true,
        // 建连超时（connect() 在重试期间不会 settle，上层另有硬超时兜底）
        connectTimeout: CONNECT_TIMEOUT_MS,
        // 单命令超时：断连期间命令会在离线队列里堆积，必须设上限
        commandTimeout: CONNECT_TIMEOUT_MS,
        // 单命令最多重试 2 次后抛错，避免无限等待
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => {
          // 🔒 永不放弃重连。
          // 原实现在 times > 3 时返回 null，ioredis 会停止重连并把 status 置为 "end"，
          // 此后即便 Redis 恢复也永远不会重连。退避上限 10s，避免重连风暴。
          return Math.min(times * 200, 10_000);
        },
      });

      // 🔒 接管 error 事件：ioredis 5 用 silentEmit 派发，无 listener 时
      // 只会打一行没有上下文的 console.error，监控上完全看不到。
      // 这里显式记录并做节流，防止重连风暴打满日志。
      client.on("error", (err: Error) => {
        const now2 = Date.now();
        if (now2 - lastErrorLogAt > ERROR_LOG_INTERVAL_MS) {
          lastErrorLogAt = now2;
          console.error(
            `[Redis] 连接错误（${ERROR_LOG_INTERVAL_MS / 1000}s 内同类日志已合并）:`,
            err?.message || err,
          );
        }
      });

      await connectWithTimeout(client);

      // 成功后写入内存全局变量
      redis = client;
      redisConfigSig = sig;
      return redis;
    } catch (err: any) {
      console.error("[Redis] 初始化连接失败:", err.message || err);
      // 失败的客户端必须显式关闭，否则 socket 与重试定时器泄漏
      try {
        client?.disconnect();
      } catch {}
      redis = null;
      redisConfigSig = "";
      // 进入冷却期，冷却期内 getRedis 直接返回 null，不再阻塞请求
      nextConnectAttemptAt = Date.now() + RETRY_COOLDOWN_MS;
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
