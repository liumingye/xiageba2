import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { updateRefreshTokenByAccountId } from "#server/utils/source";
import { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } from "#server/lib/const";
import type { PanAccount } from "#server/lib/accountCache";

// 客户端过期时间，单位：小时
const CLIENT_EXPIRE_HOURS = 0.5;
const CLIENT_EXPIRE_MS = CLIENT_EXPIRE_HOURS * 60 * 60 * 1000;

export type PanClient = QuarkUCClient | BaiduClient | XunleiClient;

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

// 每1分钟保持一次夸克/UC连接
setInterval(() => {
  for (const cached of clientMap.values()) {
    if (cached.client instanceof QuarkUCClient) {
      cached.client.keepAlive();
    }
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

  let client: PanClient;

  switch (account.type) {
    case "quark":
    case "uc": {
      if (!account.cookie) {
        throw createError({
          statusCode: 500,
          message: `账号 ${account.id} 未配置 Cookie，请先在账号管理中配置`,
        });
      }
      client = new QuarkUCClient({
        type: account.type,
        cookie: account.cookie,
      });
      break;
    }

    case "baidu": {
      if (!account.cookie) {
        throw createError({
          statusCode: 500,
          message: `账号 ${account.id} 未配置 Cookie，请先在账号管理中配置`,
        });
      }
      try {
        const baiduClient = new BaiduClient({
          source: account.cookie,
          clientId: BAIDU_CLIENT_ID,
          clientSecret: BAIDU_CLIENT_SECRET,
          accessToken: account.accessToken || undefined,
          refreshToken: account.refreshToken || undefined,
          expiresAt: account.expiresAt
            ? account.expiresAt.getTime()
            : undefined,
          onRefreshToken: (tokenInfo) =>
            updateRefreshTokenByAccountId(account.id, tokenInfo),
        });
        await baiduClient.init();
        client = baiduClient;
      } catch {
        throw createError({
          statusCode: 500,
          message: `账号 ${account.id} 初始化百度网盘客户端失败`,
        });
      }
      break;
    }

    case "xunlei": {
      if (!account.refreshToken) {
        throw createError({
          statusCode: 500,
          message: `账号 ${account.id} 未配置 Refresh Token，请先在账号管理中配置`,
        });
      }
      client = new XunleiClient({
        refreshToken: account.refreshToken,
        accessToken: account.accessToken || undefined,
        expiresAt: account.expiresAt ? account.expiresAt.getTime() : undefined,
        onRefreshToken: (tokenInfo) =>
          updateRefreshTokenByAccountId(account.id, tokenInfo),
      });
      break;
    }

    default:
      throw createError({
        statusCode: 500,
        message: `不支持的网盘类型: ${account.type}`,
      });
  }

  clientMap.set(account.id, { client, createdAt: Date.now() });
  return client;
}

/**
 * 创建一次性临时客户端（不缓存、不写入 token，用于添加账号时预览/获取昵称）
 */
export async function createTempClient(params: {
  type: string;
  cookie?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: Date;
}): Promise<PanClient> {
  const { type, cookie, refreshToken, accessToken, expiresAt } = params;

  switch (type) {
    case "quark":
    case "uc": {
      if (!cookie) {
        throw createError({
          statusCode: 400,
          message: "请先填写 Cookie",
        });
      }
      return new QuarkUCClient({
        type,
        cookie,
      });
    }

    case "baidu": {
      if (!cookie) {
        throw createError({
          statusCode: 400,
          message: "请先填写 Cookie",
        });
      }
      try {
        const baiduClient = new BaiduClient({
          source: cookie,
          clientId: BAIDU_CLIENT_ID,
          clientSecret: BAIDU_CLIENT_SECRET,
          accessToken: accessToken || undefined,
          refreshToken: refreshToken || undefined,
          expiresAt: expiresAt ? expiresAt.getTime() : undefined,
        });
        await baiduClient.init();
        return baiduClient;
      } catch {
        throw createError({
          statusCode: 500,
          message: "初始化百度网盘客户端失败",
        });
      }
    }

    case "xunlei": {
      if (!refreshToken) {
        throw createError({
          statusCode: 400,
          message: "请先填写 Refresh Token",
        });
      }
      return new XunleiClient({
        refreshToken,
        accessToken: accessToken || undefined,
        expiresAt: expiresAt ? expiresAt.getTime() : undefined,
      });
    }

    default:
      throw createError({
        statusCode: 400,
        message: `不支持的网盘类型: ${type}`,
      });
  }
}
