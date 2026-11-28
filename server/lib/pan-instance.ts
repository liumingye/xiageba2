import { getAdapterByType, getAdapterByClient } from "#server/lib/pan/adapters";
import type {
  PanClient,
  TempCredentials,
} from "#server/lib/pan/adapters/types";
import type { PanAccount } from "#server/lib/accountCache";

// 客户端过期时间，单位：小时
const CLIENT_EXPIRE_HOURS = 0.5;
const CLIENT_EXPIRE_MS = CLIENT_EXPIRE_HOURS * 60 * 60 * 1000;

interface CachedClient {
  client: PanClient;
  createdAt: number;
}

// 按 accountId 存储的客户端实例 Map
const clientMap = new Map<number, CachedClient>();

function isClientExpired(createdAt: number): boolean {
  return Date.now() - createdAt > CLIENT_EXPIRE_MS;
}

/**
 * 清空所有缓存的客户端实例
 */
export function cleanClients() {
  clientMap.clear();
}

/**
 * 清除指定 accountId 的客户端缓存
 */
export function cleanClient(accountId: number) {
  clientMap.delete(accountId);
}

// 每1分钟对声明了保活钩子的网盘（夸克/UC）保持一次连接
setInterval(() => {
  for (const cached of clientMap.values()) {
    getAdapterByClient(cached.client)?.keepAlive?.(cached.client);
  }
}, 1000 * 60);

/**
 * 根据账号记录获取（或创建）对应的网盘客户端实例
 * 客户端按 accountId 缓存，过期后自动重建
 */
export async function getClientByAccount(
  account: PanAccount,
): Promise<PanClient> {
  const cached = clientMap.get(account.id);
  if (cached && !isClientExpired(cached.createdAt)) {
    return cached.client;
  }

  const adapter = getAdapterByType(account.type);
  if (!adapter) {
    throw createError({
      statusCode: 500,
      message: `不支持的网盘类型: ${account.type}`,
    });
  }

  const client = await adapter.createClient(account);
  clientMap.set(account.id, { client, createdAt: Date.now() });
  return client;
}

/**
 * 创建一次性临时客户端（不缓存、不写入 token，用于添加账号时预览/获取昵称）
 */
export async function createTempClient(
  params: TempCredentials,
): Promise<PanClient> {
  const adapter = getAdapterByType(params.type);
  if (!adapter) {
    throw createError({
      statusCode: 400,
      message: `不支持的网盘类型: ${params.type}`,
    });
  }
  return adapter.createTempClient(params);
}
