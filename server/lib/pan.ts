import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { getConfigValues } from "./configCache";
import { updateXunleiRefreshToken } from "#server/utils/source";

let baiduClient: BaiduClient | null = null;
let xunleiClient: XunleiClient | null = null;
let quarkClient: QuarkUCClient | null = null;
let ucClient: QuarkUCClient | null = null;

export function cleanClients() {
  baiduClient = null;
  xunleiClient = null;
  quarkClient = null;
  ucClient = null;
}

export async function getQuarkClient(force?: boolean) {
  if (!force && quarkClient) {
    return quarkClient;
  }
  const type = "quark";
  const config = await getConfigValues([`${type}_cookie`, `${type}_temp_dir`]);
  const cookie = config[`${type}_cookie`];

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: `未配置夸克网盘 Cookie，请先在账号管理中配置`,
    });
  }

  quarkClient = new QuarkUCClient({ type, cookie });
  return quarkClient;
}

export async function getUCClient(force?: boolean) {
  if (!force && ucClient) {
    return ucClient;
  }
  const type = "uc";
  const config = await getConfigValues([`${type}_cookie`, `${type}_temp_dir`]);
  const cookie = config[`${type}_cookie`];

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: `未配置UC网盘 Cookie，请先在账号管理中配置`,
    });
  }

  quarkClient = new QuarkUCClient({ type, cookie });
  return quarkClient;
}

export async function getBaiduClient(force?: boolean) {
  if (!force && baiduClient) {
    return baiduClient;
  }
  const config = await getConfigValues(["baidu_cookie"]);
  const cookie = config.baidu_cookie;

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: "未配置百度网盘 Cookie，请先在账号管理中配置",
    });
  }

  try {
    baiduClient = new BaiduClient(cookie);
    await baiduClient.init();
    return baiduClient;
  } catch (err) {
    throw createError({ statusCode: 500, message: "初始化百度网盘客户端失败" });
  }
}

export async function getXunleiClient(force?: boolean) {
  if (!force && xunleiClient) {
    return xunleiClient;
  }
  const config = await getConfigValues([
    "xunlei_refresh_token",
    "xunlei_temp_dir",
  ]);
  const refreshToken = config.xunlei_refresh_token;

  if (!refreshToken) {
    throw createError({
      statusCode: 500,
      message: "未配置迅雷网盘 Cookie（refresh_token），请先在账号管理中配置",
    });
  }

  try {
    xunleiClient = new XunleiClient({
      refreshToken,
      onRefreshToken: updateXunleiRefreshToken,
    });
    return xunleiClient;
  } catch (err) {
    throw createError({ statusCode: 500, message: "初始化迅雷网盘客户端失败" });
  }
}
