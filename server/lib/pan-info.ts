import { getClientByAccount, createTempClient } from "#server/lib/pan-instance";
import { getAdapterByClient } from "#server/lib/pan/adapters";
import type { PanClient } from "#server/lib/pan/adapters/types";
import type { PanAccount } from "#server/lib/accountCache";

/**
 * 通过已创建的 client 获取账号昵称
 */
export async function getAccountNameByClient(
  client: PanClient,
): Promise<string> {
  const adapter = getAdapterByClient(client);
  if (!adapter) {
    throw new Error("不支持的网盘类型");
  }
  return adapter.getAccountName(client);
}

/**
 * 通过已有账号获取昵称（编辑账号时使用）
 */
export async function getAccountNameByAccount(
  account: PanAccount,
): Promise<string> {
  const client = await getClientByAccount(account);
  return await getAccountNameByClient(client);
}

/**
 * 通过临时凭证获取昵称（添加账号时使用）
 * 不写入 token，不缓存 client
 */
export async function getAccountNameByCredentials(params: {
  type: string;
  cookie?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: Date;
}): Promise<string> {
  const client = await createTempClient(params);
  return await getAccountNameByClient(client);
}
