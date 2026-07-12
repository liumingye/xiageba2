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
 * 设置单个配置值
 */
export const setConfigValue = async (key: string, value: string) => {
  const safeValue = String(value ?? "");

  // 1. 先写数据库
  await prisma.config.upsert({
    where: { key },
    update: { value: safeValue },
    create: { key, value: safeValue },
  });

  // 2. 🔒 修复脏数据 Bug：如果缓存还没建立，直接顺手帮它初始化，而不是漏掉
  if (!memoryCache || memoryCache.expireAt <= Date.now()) {
    const map = new Map<string, string>();
    map.set(key, safeValue);
    memoryCache = {
      value: map,
      expireAt: Date.now() + CACHE_TTL,
    };
  } else {
    // 缓存存在则直接追加修改
    memoryCache.value.set(key, safeValue);
  }

  return { success: true };
};

/**
 * 设置多个配置值
 */
export const setConfigValues = async (
  configs: { key: string; value: string }[],
) => {
  const upserts = [];
  for (const config of configs) {
    if (config.value !== undefined) {
      const safeValue = String(config.value ?? "");
      upserts.push(
        prisma.config.upsert({
          where: { key: config.key },
          update: { value: safeValue },
          create: { key: config.key, value: safeValue },
        }),
      );
    }
  }

  if (upserts.length > 0) {
    await Promise.all(upserts);

    // 🔒 修复批量写入时的缓存遗漏 Bug
    if (!memoryCache || memoryCache.expireAt <= Date.now()) {
      const map = new Map<string, string>();
      for (const c of configs) {
        map.set(c.key, String(c.value ?? ""));
      }
      memoryCache = {
        value: map,
        expireAt: Date.now() + CACHE_TTL,
      };
    } else {
      for (const c of configs) {
        memoryCache.value.set(c.key, String(c.value ?? ""));
      }
    }
  }
  return { success: true };
};
