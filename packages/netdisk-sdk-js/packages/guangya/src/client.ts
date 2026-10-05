import superagent, { Agent } from "superagent";
import { HttpsAgent } from "agentkeepalive";
import crypto from "crypto";

import {
  GUANGYA_ACCOUNT_API,
  GUANGYA_CLIENT_ID,
  GUANGYA_UA,
  GUANGYA_WEB_ORIGIN,
  GUANGYA_DT,
} from "./const";
import { throwError, AuthError } from "./errors";
import { IGuangyaCredential, IGuangyaTokenData } from "./types";
import { GuangyaShareApi } from "./share_api";
import { GuangyaFSApi } from "./fs_api";

export interface IGuangyaRefreshTokenInfo extends IGuangyaCredential {
  /** 过期时间戳（ms） */
  expiresAt?: number;
}

export interface IGuangyaClientConfig {
  /** Refresh Token（必填，用于自动刷新 access_token） */
  refreshToken: string;
  /** 可选：已有的 access_token（配合 expiresAt 使用） */
  accessToken?: string;
  /** 可选：设备标识，缺省自动生成 */
  deviceId?: string;
  /** 可选：access_token 过期时间戳（ms） */
  expiresAt?: number;
  onRefreshToken?: (info: IGuangyaRefreshTokenInfo) => void;
}

/**
 * 解析凭据串：完整 kv / 裸 access_token / 缺 device_id 自动生成 / 全空报错
 */
export const parseGuangyaCredential = (input: string): IGuangyaCredential => {
  const text = input.trim();
  if (text === "") {
    throw new Error("guangya credential is empty");
  }
  const cred: IGuangyaCredential = { accessToken: "", deviceId: "" };
  if (!text.includes("=")) {
    // 裸 access_token
    cred.accessToken = text;
  } else {
    for (const chunk of text.split(";")) {
      const trimmed = chunk.trim();
      if (trimmed === "") continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      switch (k) {
        case "access_token":
        case "accessToken":
          cred.accessToken = v;
          break;
        case "refresh_token":
        case "refreshToken":
          cred.refreshToken = v;
          break;
        case "device_id":
        case "deviceId":
          cred.deviceId = v;
          break;
      }
    }
  }
  if (cred.accessToken === "" && !cred.refreshToken) {
    throw new Error("guangya credential missing access_token or refresh_token");
  }
  if (cred.deviceId === "") {
    cred.deviceId = generateGuangyaDid();
  }
  return cred;
};

/**
 * 序列化凭据为规范化 kv 串（落库/回写格式）
 */
export const serializeGuangyaCredential = (
  cred: IGuangyaCredential,
): string => {
  const parts = [`access_token=${cred.accessToken}`];
  if (cred.refreshToken) parts.push(`refresh_token=${cred.refreshToken}`);
  parts.push(`device_id=${cred.deviceId}`);
  return parts.join(";");
};

/** 生成设备标识：md5(随机16字节hex) */
export const generateGuangyaDid = (): string => {
  return crypto.createHash("md5").update(randHex(16)).digest("hex");
};

/** 生成 n 字节随机数的 hex 串（长度 2n） */
const randHex = (n: number): string => {
  return crypto.randomBytes(n).toString("hex");
};

/** 生成 W3C traceparent 头（每请求随机） */
export const generateGuangyaTraceparent = (): string => {
  return `00-${randHex(16)}-${randHex(8)}-01`;
};

/** 全局限流：保证相邻请求间隔 50-100ms 随机值 */
let lastReqAt = 0;
const guangyaThrottle = async (): Promise<void> => {
  const interval = 50 + Math.floor(Math.random() * 50);
  const now = Date.now();
  if (lastReqAt > 0) {
    const wait = interval - (now - lastReqAt);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  lastReqAt = Date.now();
};

export class GuangyaClient {
  agent: Agent;
  agentApi: Agent;

  config: IGuangyaClientConfig;
  private cred: IGuangyaCredential;
  private expiresAt?: number;
  private refreshPromise?: Promise<void>;

  shareApi: GuangyaShareApi;
  fsApi: GuangyaFSApi;

  constructor(config: IGuangyaClientConfig) {
    this.config = config;
    this.cred = {
      accessToken: config.accessToken || "",
      refreshToken: config.refreshToken,
      deviceId: config.deviceId || generateGuangyaDid(),
    };
    // 仅当 access_token 与 expiresAt 同时提供且未过期时复用
    if (config.accessToken && config.expiresAt && config.expiresAt > Date.now()) {
      this.expiresAt = config.expiresAt;
    }

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

    this.shareApi = new GuangyaShareApi(this);
    this.fsApi = new GuangyaFSApi(this);
  }

  /** 获取当前凭据 */
  getCredential(): IGuangyaCredential {
    return { ...this.cred };
  }

  /** 获取规范化凭据串 */
  getSerializedCredential(): string {
    return serializeGuangyaCredential(this.cred);
  }

  /**
   * 获取有效的 accessToken（临期或缺失时自动刷新）
   * 与迅雷逻辑一致：无有效令牌时刷新，刷新失败则抛出
   */
  async ensureAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cred.accessToken && this.expiresAt && this.expiresAt > now) {
      return this.cred.accessToken;
    }
    // 未设置 expiresAt、已过期或 accessToken 为空，尝试刷新
    if (this.cred.refreshToken) {
      await this.refreshAccessToken();
      return this.cred.accessToken;
    }
    // 无 refreshToken 且无有效 accessToken，无法刷新
    if (!this.cred.accessToken) {
      throw AuthError.create(
        "guangya no available access_token and refresh_token",
      );
    }
    return this.cred.accessToken;
  }

  /**
   * 刷新 access_token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.cred.refreshToken) {
      throw new Error("no available refresh_token");
    }
    // 防止并发刷新
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const deviceId = this.cred.deviceId;
      const { body } = await this.agent
        .post(`${GUANGYA_ACCOUNT_API}/auth/token`)
        .set({
          accept: "*/*",
          "content-type": "application/json",
          origin: GUANGYA_WEB_ORIGIN,
          referer: `${GUANGYA_WEB_ORIGIN}/`,
          "user-agent": GUANGYA_UA,
          "x-client-id": GUANGYA_CLIENT_ID,
          "x-client-version": "0.0.1",
          "x-device-id": deviceId,
          "x-device-model": "chrome%2F147.0.0.0",
          "x-device-name": "PC-Chrome",
          "x-device-sign": `wdi10.${deviceId}${randHex(16)}`,
          "x-net-work-type": "NONE",
          "x-os-version": "MacIntel",
          "x-platform-version": "1",
          "x-protocol-version": "301",
          "x-provider-name": "NONE",
          "x-sdk-version": "9.0.2",
          "x-action": "401",
        })
        .send({
          client_id: GUANGYA_CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: this.cred.refreshToken,
        });

      const data = body as IGuangyaTokenData;
      const accessToken = data.access_token;
      if (!accessToken) {
        throw AuthError.create("guangya refresh response missing access_token");
      }
      const newCred: IGuangyaCredential = {
        accessToken,
        refreshToken: data.refresh_token || this.cred.refreshToken,
        deviceId,
      };
      this.cred = newCred;
      let expiresAtNum: number | undefined;
      if (data.expires_in && data.expires_in > 0) {
        // 提前 60s 过期，避免边界情况下使用已过期令牌
        this.expiresAt = Date.now() + (data.expires_in - 60) * 1000;
        expiresAtNum = this.expiresAt;
      } else {
        this.expiresAt = undefined;
      }
      this.config.onRefreshToken?.({ ...newCred, expiresAt: expiresAtNum });
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  /**
   * 发送登录态 JSON POST 请求（自动注入 Bearer token，401 自动刷新重试一次）
   */
  async postJSON<T = any>(
    endpoint: string,
    payload: Record<string, any> = {},
  ): Promise<T> {
    const token = await this.ensureAccessToken();
    try {
      return await this.doPostJSON<T>(endpoint, payload, token);
    } catch (err: any) {
      // 401 刷新后重试一次
      if (err?.type === "AuthError" || err?.status === 401) {
        await this.refreshAccessToken();
        return await this.doPostJSON<T>(
          endpoint,
          payload,
          this.cred.accessToken,
        );
      }
      throw err;
    }
  }

  private async doPostJSON<T>(
    endpoint: string,
    payload: Record<string, any>,
    token: string,
  ): Promise<T> {
    await guangyaThrottle();
    const { body } = await this.agentApi
      .post(endpoint)
      .set(this.getCommonHeaders(token))
      .send(payload);
    return body as T;
  }

  /**
   * 发送登录态 GET 请求（自动注入 Bearer token，401 自动刷新重试一次）
   */
  async getJSON<T = any>(
    endpoint: string,
    query?: Record<string, any>,
  ): Promise<T> {
    const token = await this.ensureAccessToken();
    try {
      return await this.doGetJSON<T>(endpoint, query, token);
    } catch (err: any) {
      if (err?.type === "AuthError" || err?.status === 401) {
        await this.refreshAccessToken();
        return await this.doGetJSON<T>(endpoint, query, this.cred.accessToken);
      }
      throw err;
    }
  }

  private async doGetJSON<T>(
    endpoint: string,
    query: Record<string, any> | undefined,
    token: string,
  ): Promise<T> {
    await guangyaThrottle();
    let req = this.agentApi.get(endpoint).set(this.getCommonHeaders(token));
    if (query) {
      req = req.query(query);
    }
    const { body } = await req;
    return body as T;
  }

  /**
   * 发送匿名 JSON POST 请求（随机 did，无 Bearer token）
   */
  async postJSONAnonymous<T = any>(
    endpoint: string,
    payload: Record<string, any> = {},
  ): Promise<T> {
    await guangyaThrottle();
    const { body } = await this.agentApi
      .post(endpoint)
      .set(this.getCommonHeaders("", generateGuangyaDid()))
      .send(payload);
    return body as T;
  }

  /**
   * 公共请求头
   */
  private getCommonHeaders(
    token: string,
    deviceId?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      did: deviceId || this.cred.deviceId,
      dt: GUANGYA_DT,
      origin: GUANGYA_WEB_ORIGIN,
      referer: `${GUANGYA_WEB_ORIGIN}/`,
      "user-agent": GUANGYA_UA,
      traceparent: generateGuangyaTraceparent(),
    };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }
}
