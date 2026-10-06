import { prisma } from "#server/lib/prisma";

interface CacheItem {
  value: Map<string, string>;
  expireAt: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 1天

let memoryCache: CacheItem | null = null;

// 🔒 互斥锁：用于暂存正在执行的全量数据库查询 Promise，防止并发击穿
let activeFetchPromise: Promise<Map<string, string>> | null = null;

/**
 * 获取缓存的配置数据（同步检查）
 */
export const getConfigCache = (): Map<string, string> | null => {
  if (memoryCache && memoryCache.expireAt > Date.now()) {
    return memoryCache.value;
  }
  memoryCache = null;
  return null;
};

/**
 * 清空配置缓存
 */
export const clearConfigCache = () => {
  memoryCache = null;
  activeFetchPromise = null;
};

/**
 * 🔒 核心防御函数：安全、互斥地获取全量 Map
 * 确保高并发下，全网仅有一个数据库 findMany 请求在跑
 */
async function ensureAndGetFullMap(): Promise<Map<string, string>> {
  // 1. 内存有有效的，直接返回
  const cached = getConfigCache();
  if (cached) return cached;

  // 2. 内存没有，但别的请求已经在查数据库了，直接加入排队，共享同一个 Promise 结果
  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  // 3. 确实没人查，由当前请求发起数据库查询
  activeFetchPromise = (async () => {
    try {
      const configs = await prisma.config.findMany();
      const map = new Map<string, string>();
      for (const c of configs) {
        map.set(c.key, c.value);
      }

      // 写入内存缓存
      memoryCache = {
        value: map,
        expireAt: Date.now() + CACHE_TTL,
      };

      return map;
    } finally {
      // 无论成功还是失败，查完后必须释放挡箭牌，允许下一次过期时重新查询
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
}

/**
 * 获取单个配置值
 */
export const getConfigValue = async (key: string): Promise<string> => {
  const map = await ensureAndGetFullMap();
  return map.get(key) || "";
};

/**
 * 获取多个配置值
 */
export const getConfigValues = async (
  keys: string[],
): Promise<Record<string, string>> => {
  const map = await ensureAndGetFullMap();
  const result: Record<string, string> = {};
  for (const k of keys) {
    result[k] = map.get(k) || "";
  }
  return result;
};

/**
 * 写缓存的统一入口。
 *
 * 🔒 硬约束：缓存不存在 / 已过期时**绝不能用局部数据重建 Map**。
 * 若把「只含本次写入的 key」的 Map 当成全量缓存并锁 24h，
 * 后续 getConfigValue(其他 key) 会全部读到空串 ——
 * redis_host / aes_key / pancheck_servers 等配置会"凭空消失"，
 * 最长影响 24 小时且只能靠重启恢复。
 * 正确做法是置空，让读路径用一次全量 findMany 重建。
 */
function applyToCache(entries: { key: string; value: string }[]) {
  // getConfigCache() 会在过期时顺带把 memoryCache 置 null
  const cached = getConfigCache();
  if (!cached) {
    memoryCache = null;
    return;
  }
  for (const { key, value } of entries) {
    cached.set(key, value);
  }
}

/**
 * 设置单个配置值
 */
export const setConfigValue = async (key: string, value: string) => {
  const safeValue = String(value ?? "");

  // 1. 先写数据库（失败直接抛出，绝不污染缓存）
  await prisma.config.upsert({
    where: { key },
    update: { value: safeValue },
    create: { key, value: safeValue },
  });

  // 2. 落库成功后才更新缓存
  applyToCache([{ key, value: safeValue }]);

  return { success: true };
};

/**
 * 设置多个配置值
 */
export const setConfigValues = async (
  // value 为 undefined 表示「不修改该 key」
  configs: { key: string; value?: string }[],
) => {
  // value 为 undefined 表示「不修改」：DB 跳过，缓存也必须跳过，
  // 否则会把空串写进缓存而 DB 保留原值，造成长期不一致
  const entries = configs
    .filter((c) => c.value !== undefined)
    .map((c) => ({ key: c.key, value: String(c.value ?? "") }));

  if (entries.length === 0) return { success: true };

  // 🔒 原子性：整批成功或整批回滚。
  // 原实现用 Promise.all 并发 upsert，任一条失败时其余已落库且无法回滚，
  // 留下「部分配置已改、部分未改」的中间态。
  await prisma.$transaction(
    entries.map((c) =>
      prisma.config.upsert({
        where: { key: c.key },
        update: { value: c.value },
        create: { key: c.key, value: c.value },
      }),
    ),
  );

  // 只有事务提交成功后才更新缓存
  applyToCache(entries);

  return { success: true };
};
