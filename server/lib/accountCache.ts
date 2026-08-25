import { prisma } from "#server/lib/prisma";

type PanAccount = {
  id: number;
  type: string;
  cookie: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: Date | null;
  tempDir: string;
  status: number;
  createdAt: Date;
  updatedAt: Date | null;
};

interface CacheItem {
  value: Map<number, PanAccount>;
  expireAt: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 1天

let memoryCache: CacheItem | null = null;

// 🔒 互斥锁：防止并发击穿
let activeFetchPromise: Promise<Map<number, PanAccount>> | null = null;

/**
 * 获取缓存的账号数据（同步检查）
 */
export const getAccountCache = ():
  | Map<number, PanAccount>
  | null => {
  if (memoryCache && memoryCache.expireAt > Date.now()) {
    return memoryCache.value;
  }
  memoryCache = null;
  return null;
};

/**
 * 清空账号缓存
 */
export const clearAccountCache = () => {
  memoryCache = null;
  activeFetchPromise = null;
};

/**
 * 🔒 核心防御函数：安全、互斥地获取全量 Map
 */
async function ensureAndGetFullMap(): Promise<Map<number, PanAccount>> {
  const cached = getAccountCache();
  if (cached) return cached;

  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    try {
      const accounts = await prisma.panAccount.findMany();
      const map = new Map<number, PanAccount>();
      for (const a of accounts) {
        map.set(a.id, a);
      }

      memoryCache = {
        value: map,
        expireAt: Date.now() + CACHE_TTL,
      };

      return map;
    } finally {
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
}

/**
 * 按 ID 获取单个账号
 */
export const getAccountById = async (
  id: number,
): Promise<PanAccount | null> => {
  const map = await ensureAndGetFullMap();
  return map.get(id) || null;
};

/**
 * 按网盘类型获取所有启用的账号
 */
export const getEnabledAccountsByType = async (
  type: string,
): Promise<PanAccount[]> => {
  const map = await ensureAndGetFullMap();
  const result: PanAccount[] = [];
  for (const account of map.values()) {
    if (account.type === type && account.status === 1) {
      result.push(account);
    }
  }
  return result;
};

/**
 * 随机选取一个指定类型的启用账号（用于转存资源）
 */
export const getRandomAccountByType = async (
  type: string,
): Promise<PanAccount | null> => {
  const accounts = await getEnabledAccountsByType(type);
  if (accounts.length === 0) return null;
  const idx = Math.floor(Math.random() * accounts.length);
  return accounts[idx]!;
};

/**
 * 获取所有启用的账号
 */
export const getAllEnabledAccounts = async (): Promise<PanAccount[]> => {
  const map = await ensureAndGetFullMap();
  const result: PanAccount[] = [];
  for (const account of map.values()) {
    if (account.status === 1) {
      result.push(account);
    }
  }
  return result;
};

/**
 * 获取所有账号（含停用）
 */
export const getAllAccounts = async (): Promise<PanAccount[]> => {
  const map = await ensureAndGetFullMap();
  return Array.from(map.values());
};

export type { PanAccount };
