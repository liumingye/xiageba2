import fs from "node:fs";
import path from "node:path";
import superagent, { Agent } from "superagent";

import {
  XUNLEI_USER_BASE_URL,
  XUNLEI_PAN_BASE_URL,
  DEFAULT_XUNLEI_CONFIG,
} from "./const";
import { throwError, AuthError } from "./errors";
import { XunleiShareApi } from "./share_api";
import { XunleiFSApi } from "./fs_api";
import { IXunleiTokenData, IXunleiCaptchaData, IXunleiMethod } from "./types";

export interface IXunleiClientConfig {
  refreshToken: string;
  clientId?: string;
  deviceId?: string;
  userAgent?: string;
  tokenCachePath?: string;
  onRefreshToken?: (refreshToken: string) => void;
}

interface ICachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ICachedCaptcha {
  action: string;
  token: string;
  expiresAt: number;
}

export class XunleiClient {
  agent: Agent;
  agentApi: Agent;
  config: Required<Omit<IXunleiClientConfig, "onRefreshToken">> &
    Pick<IXunleiClientConfig, "onRefreshToken">;

  shareApi: XunleiShareApi;
  fsApi: XunleiFSApi;

  private token?: ICachedToken;
  private captchas = new Map<string, ICachedCaptcha>();

  constructor(config: IXunleiClientConfig) {
    this.config = {
      refreshToken: config.refreshToken,
      clientId: config.clientId || DEFAULT_XUNLEI_CONFIG.clientId,
      deviceId: config.deviceId || DEFAULT_XUNLEI_CONFIG.deviceId,
      userAgent: config.userAgent || DEFAULT_XUNLEI_CONFIG.userAgent,
      tokenCachePath:
        config.tokenCachePath ||
        path.resolve(process.cwd(), ".xunlei-token-cache.json"),
      onRefreshToken: config.onRefreshToken,
    };

    this.loadTokenFromFile();

    this.agent = superagent
      .agent()
      .set({
        "user-agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        Origin: "https://pan.xunlei.com",
        Pragma: "no-cache",
        Referer: "https://pan.xunlei.com/",
        "x-client-id": this.config.clientId,
        "x-device-id": this.config.deviceId,
      })
      .ok(throwError)
      .retry(3);

    this.agentApi = this.agent;

    this.shareApi = new XunleiShareApi(this);
    this.fsApi = new XunleiFSApi(this);
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now) {
      return this.token.accessToken;
    }

    const { body } = await this.agent
      .post(`${XUNLEI_USER_BASE_URL}/v1/auth/token`)
      .send({
        client_id: this.config.clientId,
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
      });

    const data = body as IXunleiTokenData;
    if (!data?.access_token || !data?.refresh_token || !data?.expires_in) {
      throw AuthError.create("xunlei token response missing access_token");
    }

    this.config.refreshToken = data.refresh_token;
    this.token = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now + (data.expires_in - 60) * 1000,
    };
    this.saveTokenToFile();
    this.config.onRefreshToken?.(data.refresh_token);
    return data.access_token;
  }

  async getCaptchaToken(action: string, renew = false): Promise<string> {
    const now = Date.now();
    const cached = this.captchas.get(action);
    if (!renew && cached && cached.expiresAt > now) {
      return cached.token;
    }

    const { body } = await this.agent
      .post(`${XUNLEI_USER_BASE_URL}/v1/shield/captcha/init`)
      .send({
        client_id: this.config.clientId,
        action,
        device_id: this.config.deviceId,
        captcha_token: cached?.token ?? "",
        meta: {
          username: "",
          phone_number: "",
          email: "",
          package_name: "pan.xunlei.com",
          client_version: "1.45.0",
          captcha_sign: "1.fe2108ad808a74c9ac0243309242726c",
          timestamp: "1645241033384",
          user_id: "0",
        },
      });

    const data = body as IXunleiCaptchaData;
    if (!data?.captcha_token || !data?.expires_in) {
      if (data?.url) {
        throw AuthError.create(
          "xunlei captcha requires browser verification: {url}",
          data as unknown as Record<string, unknown>,
        );
      }
      throw AuthError.create("xunlei captcha response missing captcha_token");
    }

    this.captchas.set(action, {
      action,
      token: data.captcha_token,
      expiresAt: now + (data.expires_in - 10) * 1000,
    });
    return data.captcha_token;
  }

  private async loadTokenFromFile(): Promise<void> {
    try {
      const raw = fs.readFileSync(this.config.tokenCachePath, "utf8");
      const data = JSON.parse(raw) as ICachedToken;
      if (
        data?.accessToken &&
        data?.refreshToken &&
        typeof data?.expiresAt === "number" &&
        data.expiresAt > Date.now()
      ) {
        this.token = data;
        this.config.refreshToken = data.refreshToken;
      }
    } catch {
      // 缓存文件不存在或解析失败时忽略，使用传入的 refreshToken 重新获取
    }
  }

  private saveTokenToFile(): void {
    if (!this.token) return;
    try {
      const dir = path.dirname(this.config.tokenCachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.config.tokenCachePath,
        JSON.stringify(this.token, null, 2),
        "utf8",
      );
    } catch {
      // 写入失败时静默处理，不影响主流程
    }
  }

  async request<T = any>(
    method: IXunleiMethod,
    pathname: string,
    options: { body?: any; query?: Record<string, any> } = {},
  ): Promise<T> {
    const accessToken = await this.getAccessToken();
    const action = `${method}:${pathname}`;
    const captchaToken = await this.getCaptchaToken(action);

    const url = `${XUNLEI_PAN_BASE_URL}${pathname}`;
    const req = (this.agentApi as any)
      [method.toLowerCase()](url)
      .set({
        Authorization: `Bearer ${accessToken}`,
        "x-captcha-token": captchaToken,
      })
      .query(options.query ?? {});

    if (method !== "GET" && options.body !== undefined) {
      req.send(options.body);
    }

    const { body } = await req;
    return body as T;
  }
}
