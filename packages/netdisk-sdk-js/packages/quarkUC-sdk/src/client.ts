import superagent, { type Agent, Request, Response } from "superagent";
import {
  ArrayUtil,
  Check,
  CookieUtil,
  KEEP_ALIVE_OPTIONS,
  REQUEST_TIMEOUT,
  idempotentRetry,
} from "@netdisk-sdk/utils";
import { HttpsAgent } from "agentkeepalive";

import { CreateQuarkClientParam, CreateUCClientParam } from "./const";
import { QuarkUCShareApi } from "./share_api";
import { QuarkUCFSApi } from "./fs_api";
import { throwError } from "./errors";

function prefix(prefix: string) {
  return function (request: Request) {
    if (request.url[0] === "/") {
      request.url = prefix + request.url;
    }
    return request;
  };
}

export interface ICreateClientConfig {
  pr: string;
  api: string;
  referer: string;
  ua: string;
  cookie: string;
  cookieUpdate?: (cookie: string) => void;
}

export interface ICreateClientByType {
  type: "quark" | "uc";
  cookie: string;
  cookieUpdate?: (cookie: string) => void;
}

export class QuarkUCClient {
  agent: Agent;
  agentApi: Agent;

  config: ICreateClientConfig;

  shareApi: QuarkUCShareApi;
  fsApi: QuarkUCFSApi;

  constructor(config: ICreateClientConfig, agent?: Agent);
  constructor(config: ICreateClientByType, agent?: Agent);

  constructor(config: any, agent?: Agent) {
    if (Check.isString(config.type)) {
      const { type } = config;
      if (type == "quark") {
        this.config = {
          ...config,
          ...CreateQuarkClientParam,
        };
      } else if (type == "uc") {
        this.config = {
          ...config,
          ...CreateUCClientParam,
        };
      } else {
        throw new Error(`not support type ${config}`);
      }
    } else {
      this.config = config;
    }

    const httpsAgent = new HttpsAgent(KEEP_ALIVE_OPTIONS);

    // OSS 直传专用：不注入 quark 登录态，避免 cookie/referer 外发 aliyuncs.com。
    // 响应不是 quark JSON，放行后由调用处按 status 判定，保留 OSS 错误详情。
    // 上传耗时远高于普通接口，不能用 15s 整体 deadline。
    this.agent = superagent
      .agent(new HttpsAgent(KEEP_ALIVE_OPTIONS) as any)
      .timeout({ response: 60000, deadline: 600000 })
      .ok(() => true)
      .use(idempotentRetry());

    this.agentApi = (agent ?? superagent.agent(httpsAgent as any))
      .timeout(REQUEST_TIMEOUT)
      .use((request: Request) => {
        // 监听cookie更新
        request.on("response", (resp: Response) => {
          const setCookie = ArrayUtil.toArray(resp.header["set-cookie"])
            .filter(Boolean)
            .map((v) => v?.split(";")[0] ?? "");
          const puus = setCookie.find((c) => c.startsWith("__puus"));
          if (puus != null) this.updateCookie(setCookie.join(";"));
        });
      })
      .use(prefix(this.config.api))
      .use((request: Request) => {
        // 自动注入
        const { cookie, referer, pr, ua } = this.config;
        const end = request.end;
        request.end = function () {
          this.set({
            cookie,
            referer,
            pr,
            "user-agent": ua,
            Accept: "application/json, text/plain, */*",
          }).query({ pr, fr: "pc" });
          // @ts-ignore
          return end.apply(this, arguments);
        };
      })
      .ok(throwError)
      .use(idempotentRetry());

    this.fsApi = new QuarkUCFSApi(this);
    this.shareApi = new QuarkUCShareApi(this);
  }

  updateCookie(cookie: string) {
    this.config.cookie = CookieUtil.mergeCookie(
      this.config.cookie || "",
      cookie,
    );
    this.config.cookieUpdate?.(this.config.cookie);
  }

  /**
   * 每次请求会刷新 __puus ，不需要太频繁
   */
  async keepAlive() {
    const { body } = await this.agentApi.get("/auth/pc/flush");
    return body;
  }
}
