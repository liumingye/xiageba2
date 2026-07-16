import { QuarkUCClient } from "@netdisk-sdk/quarkuc-sdk";
import { BaiduClient } from "@netdisk-sdk/baidu-sdk";
import { XunleiClient } from "@netdisk-sdk/xunlei-sdk";
import { getConfigValues } from "./configCache";
import {
  updateXunleiRefreshToken,
  updateBaiduRefreshToken,
} from "#server/utils/source";
import { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } from "~~/server/api/const";

// 客户端过期时间，单位：小时
const CLIENT_EXPIRE_HOURS = 0.5;
const CLIENT_EXPIRE_MS = CLIENT_EXPIRE_HOURS * 60 * 60 * 1000;

let baiduClient: BaiduClient | null = null;
let baiduClientCreatedAt: number | null = null;
let xunleiClient: XunleiClient | null = null;
let xunleiClientCreatedAt: number | null = null;
let quarkClient: QuarkUCClient | null = null;
let quarkClientCreatedAt: number | null = null;
let ucClient: QuarkUCClient | null = null;
let ucClientCreatedAt: number | null = null;

function isClientExpired(createdAt: number | null): boolean {
  if (!createdAt) return true;
  return Date.now() - createdAt > CLIENT_EXPIRE_MS;
}

export function cleanClients() {
  baiduClient = null;
  baiduClientCreatedAt = null;
  xunleiClient = null;
  xunleiClientCreatedAt = null;
  quarkClient = null;
  quarkClientCreatedAt = null;
  ucClient = null;
  ucClientCreatedAt = null;
}

// 每1分钟保持一次连接
setInterval(() => {
  ucClient?.keepAlive();
  quarkClient?.keepAlive();
}, 1000 * 60);

export async function getQuarkClient(force?: boolean) {
  if (!force && quarkClient && !isClientExpired(quarkClientCreatedAt)) {
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
  quarkClientCreatedAt = Date.now();
  return quarkClient;
}

export async function getUCClient(force?: boolean) {
  if (!force && ucClient && !isClientExpired(ucClientCreatedAt)) {
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

  ucClient = new QuarkUCClient({ type, cookie });
  ucClientCreatedAt = Date.now();
  return ucClient;
}

export async function getBaiduClient(force?: boolean) {
  if (!force && baiduClient && !isClientExpired(baiduClientCreatedAt)) {
    return baiduClient;
  }
  const config = await getConfigValues([
    "baidu_cookie",
    "baidu_access_token",
    "baidu_refresh_token",
    "baidu_expires_at",
  ]);
  const cookie = config.baidu_cookie;

  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: "未配置百度网盘 Cookie，请先在账号管理中配置",
    });
  }

  try {
    baiduClient = new BaiduClient({
      source: cookie,
      clientId: BAIDU_CLIENT_ID,
      clientSecret: BAIDU_CLIENT_SECRET,
      accessToken: config.baidu_access_token || undefined,
      refreshToken: config.baidu_refresh_token || undefined,
      expiresAt: config.baidu_expires_at
        ? parseInt(config.baidu_expires_at)
        : undefined,
      onRefreshToken: updateBaiduRefreshToken,
    });
    await baiduClient.init();
    baiduClientCreatedAt = Date.now();
    return baiduClient;
  } catch (err) {
    throw createError({ statusCode: 500, message: "初始化百度网盘客户端失败" });
  }
}

export async function getXunleiClient(force?: boolean) {
  if (!force && xunleiClient && !isClientExpired(xunleiClientCreatedAt)) {
    return xunleiClient;
  }
  const config = await getConfigValues([
    "xunlei_refresh_token",
    "xunlei_access_token",
    "xunlei_expires_at",
    "xunlei_temp_dir",
  ]);
  const refreshToken = config.xunlei_refresh_token;

  if (!refreshToken) {
    throw createError({
      statusCode: 500,
      message: "未配置迅雷网盘 Cookie（refresh_token），请先在账号管理中配置",
    });
  }

  const accessToken = config.xunlei_access_token || undefined;
  const expiresAt = config.xunlei_expires_at
    ? parseInt(config.xunlei_expires_at)
    : undefined;

  try {
    xunleiClient = new XunleiClient({
      refreshToken,
      accessToken,
      expiresAt,
      onRefreshToken: updateXunleiRefreshToken,
    });
    xunleiClientCreatedAt = Date.now();
    return xunleiClient;
  } catch (err) {
    throw createError({ statusCode: 500, message: "初始化迅雷网盘客户端失败" });
  }
}
