import { prisma } from "#server/lib/prisma";

/**
 * Config 缓存模块
 * 缓存 Config 表所有数据到内存，减少数据库查询次数
 */

interface CacheItem {
  value: Map<string, string>;
  expireAt: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 1天

let memoryCache: CacheItem | null = null;

/**
 * 获取缓存的配置数据
 */
export const getConfigCache = (): Map<string, string> | null => {
  if (memoryCache && memoryCache.expireAt > Date.now()) {
    return memoryCache.value;
  }

  memoryCache = null;
  return null;
};

/**
 * 设置配置缓存
 */
export const setConfigCache = (configs: { key: string; value: string }[]) => {
  const map = new Map<string, string>();
  for (const c of configs) {
    map.set(c.key, c.value);
  }
  memoryCache = {
    value: map,
    expireAt: Date.now() + CACHE_TTL,
  };
};

/**
 * 清空配置缓存（更新数据时调用）
 */
export const clearConfigCache = () => {
  memoryCache = null;
};

/**
 * 获取单个配置值（优先从缓存读取）
 * 如果缓存不存在，会查询数据库并更新缓存
 */
export const getConfigValue = async (key: string): Promise<string> => {
  const cached = getConfigCache();
  if (cached) {
    return cached.get(key) || "";
  }

  // 缓存不存在，查询全部配置并缓存
  const configs = await prisma.config.findMany();
  setConfigCache(configs);

  // 再次从缓存获取
  const newCached = getConfigCache();
  return newCached?.get(key) || "";
};

/**
 * 获取多个配置值（优先从缓存读取）
 */
export const getConfigValues = async (
  keys: string[],
): Promise<Record<string, string>> => {
  const cached = getConfigCache();
  if (cached) {
    const result: Record<string, string> = {};
    for (const k of keys) {
      result[k] = cached.get(k) || "";
    }
    return result;
  }

  // 缓存不存在，查询全部配置并缓存
  const configs = await prisma.config.findMany();
  setConfigCache(configs);

  // 再次从缓存获取
  const newCached = getConfigCache();
  const result: Record<string, string> = {};
  for (const k of keys) {
    result[k] = newCached?.get(k) || "";
  }
  return result;
};
