import superagent, { Agent } from "superagent";
import { HttpsAgent } from "agentkeepalive";
import crypto from "crypto";
import zlib from "zlib";

import {
  C139_SHARE_AES_KEY,
  C139_SHARE_X_DEVICEINFO,
  C139_SHARE_X_HUAWEI_CHANNELSRC,
  C139_SHARE_X_MM_SOURCE,
  C139_SHARE_MOBILE_UA,
  C139_PC_UA,
  C139_X_DEVICEINFO,
  C139_X_CLIENT_INFO,
  C139_YUN_CHANNEL_SOURCE,
  C139_MCLOUD_VERSION,
  C139_MCLOUD_CLIENT,
  C139_MCLOUD_CHANNEL,
  C139_YUN_MODULE_TYPE,
  C139_M4C_SRC,
  C139_M4C_CALLER,
} from "./const";
import { throwError, AuthError } from "./errors";
import { C139ShareApi } from "./share_api";
import { C139FSApi } from "./fs_api";

export interface IC139ClientConfig {
  /** 139 网盘登录 Cookie（须含 authorization 或 Os_SSo_Sid + RMKEY） */
  cookie: string;
  /** Cookie 更新回调（服务端 Set-Cookie 时触发） */
  cookieUpdate?: (cookie: string) => void;
}

/** 从 authorization 头解析账号（Basic base64 解码后取第二段） */
export const accountFromAuthorization = (
  authorization: string | null | undefined,
): string | null => {
  if (!authorization) return null;
  try {
    const b64 = authorization.replace(/^Basic\s*/i, "").trim();
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length > 1 && parts[1]) return parts[1];
    return null;
  } catch {
    return null;
  }
};

/** 从 cookie 中提取指定 key 的值 */
const getCookieValue = (cookie: string, key: string): string | null => {
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${key}=`)) {
      const v = trimmed.slice(key.length + 1);
      return v || null;
    }
  }
  return null;
};

/** 判断 cookie 是否有效（含 authorization 或 Os_SSo_Sid + RMKEY） */
export const isValidC139Cookie = (
  cookie: string | null | undefined,
): boolean => {
  if (!cookie) return false;
  const auth = getCookieValue(cookie, "authorization");
  if (auth) return true;
  const sid = getCookieValue(cookie, "Os_SSo_Sid");
  const rmkey = getCookieValue(cookie, "RMKEY");
  return Boolean(sid && rmkey);
};

/** 从 cookie 提取 Authorization 头值 */
export const extractAuthorization = (
  cookie: string | null | undefined,
): string | null => {
  return getCookieValue(cookie || "", "authorization");
};

/** 从 cookie 提取账号（从 authorization base64 解码，格式 pc:手机号:...） */
export const extractAccount = (
  cookie: string | null | undefined,
): string | null => {
  if (!cookie) return null;
  const auth = extractAuthorization(cookie);
  if (auth) {
    const account = accountFromAuthorization(auth);
    if (account) return account;
  }
  // 回退到其他 cookie 字段
  const simplify = getCookieValue(cookie, "ORCHES-I-ACCOUNT-SIMPLIFY");
  if (simplify) return simplify;
  return getCookieValue(cookie, "Login_UserNumber");
};

/** md5 hex */
const md5Hex = (s: string): string =>
  crypto.createHash("md5").update(s, "utf-8").digest("hex");

/** 等价于 JS encodeURIComponent（safe="!()*'"，+ 替换为 %20） */
const encodeURIComponentCompat = (s: string): string =>
  encodeURIComponent(s)
    .replace(
      /[!()*']/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/\+/g, "%20");

/** 生成随机字符串 */
const randomString = (len: number): string => {
  const pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += pool[Math.floor(Math.random() * pool.length)];
  }
  return result;
};

/** 格式化时间戳为 YYYY-MM-DD HH:mm:ss */
const formatDateTime = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** AES-CBC 加密：base64(IV(16B) ‖ ciphertext) */
const aesEncrypt = (key: Buffer, plaintext: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, ct]).toString("base64");
};

/** AES-CBC 解密：支持 gzip 压缩响应 */
const aesDecrypt = (key: Buffer, b64: string): string => {
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 16);
  const ct = raw.subarray(16);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let d = Buffer.concat([decipher.update(ct), decipher.final()]);
  // 去掉 PKCS7 padding
  if (d.length > 0) {
    const padLen = d[d.length - 1];
    if (padLen >= 1 && padLen <= 16) {
      d = d.subarray(0, d.length - padLen);
    }
  }
  // gzip 解压（0x1F 0x8B）
  if (d.length > 2 && d[0] === 0x1f && d[1] === 0x8b) {
    d = zlib.gunzipSync(d);
  }
  return d.toString("utf-8");
};

/** 计算 mcloud-sign：md5(md5(base64(sorted_chars(encodeURIComponent(body)))) + md5(ts:rand)).toUpperCase() */
export const calSign = (bodyJson: string, ts: string, rand: string): string => {
  const encoded = encodeURIComponentCompat(bodyJson);
  const sortedChars = encoded.split("").sort().join("");
  const b64 = Buffer.from(sortedChars, "utf-8").toString("base64");
  const res = md5Hex(b64) + md5Hex(`${ts}:${rand}`);
  return md5Hex(res).toUpperCase();
};

/** 生成 mcloud-sign 头值：ts,rand,sign */
const signHeader = (bodyJson: string): string => {
  const ts = formatDateTime(new Date());
  const rand = randomString(16);
  return `${ts},${rand},${calSign(bodyJson, ts, rand)}`;
};

export class C139Client {
  agent: Agent;
  agentApi: Agent;

  config: IC139ClientConfig;
  private authorization: string | null;
  private account: string | null;
  private readonly aesKey: Buffer;
  aesDecrypt: typeof aesDecrypt;

  shareApi: C139ShareApi;
  fsApi: C139FSApi;

  constructor(config: IC139ClientConfig) {
    this.config = config;
    this.aesKey = Buffer.from(C139_SHARE_AES_KEY, "utf-8");
    this.authorization = extractAuthorization(config.cookie);
    this.account = extractAccount(config.cookie);

    const httpsAgent = new HttpsAgent({
      maxSockets: 100,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000,
    });

    this.agent = superagent
      .agent(httpsAgent as any)
      .timeout(15000)
      .ok(throwError)
      .retry(3);

    this.agentApi = this.agent;

    this.shareApi = new C139ShareApi(this);
    this.fsApi = new C139FSApi(this);
    this.aesDecrypt = aesDecrypt;
  }

  /** 获取当前 authorization */
  getAuthorization(): string | null {
    return this.authorization;
  }

  /** 获取当前账号 */
  getAccount(): string | null {
    return this.account;
  }

  /** 更新 cookie 并重新解析 authorization/account */
  updateCookie(cookie: string): void {
    this.config.cookie = cookie;
    this.authorization = extractAuthorization(cookie);
    this.account = extractAccount(cookie);
    this.config.cookieUpdate?.(cookie);
  }

  /**
   * 分享接口 POST（请求/响应均 AES-CBC 加密）
   * @param url 接口地址
   * @param plainBody 明文字符串（JSON）
   * @param sign 是否计算 mcloud-sign
   */
  async sharePost(
    url: string,
    plainBody: string,
    sign = false,
  ): Promise<Record<string, any>> {
    const encrypted = aesEncrypt(this.aesKey, plainBody);
    const headers: Record<string, string> = {
      // "hcy-cool-flag": "1",
      // "x-huawei-channelsrc": C139_SHARE_X_HUAWEI_CHANNELSRC,
      // "x-mm-source": C139_SHARE_X_MM_SOURCE,
      "Content-Type": "application/json;charset=UTF-8",
      "User-Agent": C139_SHARE_MOBILE_UA,
      Origin: "https://yun.139.com",
      Referer: "https://yun.139.com/",
      Accept: "application/json, text/plain, */*",

      "hcy-cool-flag": "1",
      "x-deviceinfo": C139_SHARE_X_DEVICEINFO,
      "x-yun-api-version": "v1",
      "x-yun-app-channel": "10213406",
      "x-yun-channel-source": "10213406",
      "x-yun-client-info": C139_X_CLIENT_INFO,
      "x-yun-module-type": C139_YUN_MODULE_TYPE,
      "x-yun-svc-type": "1",
    };
    if (sign) {
      headers["mcloud-sign"] = signHeader(plainBody);
    }
    if (this.authorization) {
      headers["Authorization"] = this.authorization;
    }

    const { body } = await this.agent
      .post(url)
      .set(headers)
      .send(encrypted)
      .parse((res: any, cb: (err: Error | null, data: string) => void) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString("utf-8");
        });
        res.on("end", () => cb(null, data));
      });
    try {
      return JSON.parse(aesDecrypt(this.aesKey, body));
    } catch {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    }
  }

  /**
   * 个人网盘接口 POST（明文 JSON + Authorization + mcloud-sign + 渠道头）
   */
  async cloudPost(
    url: string,
    payload: Record<string, any>,
  ): Promise<Record<string, any>> {
    const bodyJson = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json;charset=UTF-8",
      "User-Agent": C139_PC_UA,
      Accept: "application/json, text/plain, */*",
      // "mcloud-channel": C139_MCLOUD_CHANNEL,
      // "mcloud-client": C139_MCLOUD_CLIENT,
      // "mcloud-sign": signHeader(bodyJson),
      // "mcloud-version": C139_MCLOUD_VERSION,
      // "x-deviceinfo": C139_X_DEVICEINFO,
      // "x-m4c-src": C139_M4C_SRC,
      // "x-m4c-caller": C139_M4C_CALLER,
      "x-svctype": "1",
      "x-yun-api-version": "v1",
      "x-yun-app-channel": C139_YUN_CHANNEL_SOURCE,
      "x-yun-channel-source": C139_YUN_CHANNEL_SOURCE,
      "x-yun-client-info": C139_X_CLIENT_INFO,
      "x-yun-module-type": C139_YUN_MODULE_TYPE,
      "x-yun-svc-type": "1",
    };
    if (this.authorization) {
      headers["Authorization"] = this.authorization;
    }

    const { body } = await this.agent.post(url).set(headers).send(payload);

    return body as Record<string, any>;
  }

  /** 检查是否有有效登录态 */
  ensureAuth(): void {
    if (!this.authorization && !isValidC139Cookie(this.config.cookie)) {
      throw AuthError.create(
        "c139 invalid cookie: missing authorization or Os_SSo_Sid/RMKEY",
      );
    }
  }
}
