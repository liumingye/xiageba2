import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { getClientByAccount, createTempClient } from "#server/lib/pan-instance";
import type { PanAccount } from "#server/lib/accountCache";

type PanClient = QuarkUCClient | BaiduClient | XunleiClient;

/**
 * 夸克/UC：账号信息接口
 * 夸克: https://pan.quark.cn/account/info → data.nickname
 * UC:   https://drive.uc.cn/account/info   → data.nickname
 */
async function getQuarkUCName(client: QuarkUCClient): Promise<string> {
  const { pr } = client.config;
  client.config.ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";
  const baseUrl =
    pr === "ucpro" ? "https://pan.quark.cn" : "https://drive.uc.cn";

  const res = await client.agentApi.get(`${baseUrl}/account/info`);

  const nickname = res.body?.data?.nickname;
  if (typeof nickname !== "string" || !nickname.trim()) {
    throw new Error("未获取到昵称");
  }
  return nickname.trim();
}

/**
 * 百度：用户信息接口
 * https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo → netdisk_name | baidu_name
 */
async function getBaiduName(client: BaiduClient): Promise<string> {
  const res = await client.agentApi
    .get("https://pan.baidu.com/rest/2.0/xpan/nas")
    .query({ method: "uinfo" });

  const body = res.body;
  if (!body) throw new Error("未获取到账号信息");

  const name = body.netdisk_name || body.baidu_name || "";
  if (!name) throw new Error("未获取到昵称");
  return String(name);
}

/**
 * 迅雷：用户信息接口
 * https://xluser-ssl.xunlei.com/v1/user/me → nickname | username | email
 */
async function getXunleiName(client: XunleiClient): Promise<string> {
  const accessToken = await client.getAccessToken();
  const res = await client.agent
    .get("https://xluser-ssl.xunlei.com/v1/user/me")
    .set({
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json, text/plain, */*",
    });

  const body = res.body;
  if (!body) throw new Error("未获取到账号信息");

  const name = body.name || body.email || "";
  if (!name) throw new Error("未获取到昵称");
  return String(name);
}

/**
 * 通过已创建的 client 获取账号昵称
 */
export async function getAccountNameByClient(
  client: PanClient,
): Promise<string> {
  if (client instanceof QuarkUCClient) {
    return await getQuarkUCName(client);
  }
  if (client instanceof BaiduClient) {
    return await getBaiduName(client);
  }
  if (client instanceof XunleiClient) {
    return await getXunleiName(client);
  }
  throw new Error("不支持的网盘类型");
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
