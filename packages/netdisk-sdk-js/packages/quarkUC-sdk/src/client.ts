import superagent, { Agent, Request, Response } from "superagent";
import prefix from "superagent-prefix";

import { ArrayUtil, Check, CookieUtil } from "@netdisk-sdk/utils";

import { CreateQuarkClientParam, CreateUCClientParam } from "./const";
import { QuarkUCShareApi } from "./share_api";
import { QuarkUCFSApi } from "./fs_api";
import { throwError } from "./errors";

export interface ICreateClientConfig {
    pr: string
    api: string
    referer: string
    ua: string
    cookie: string
    cookieUpdate?: (cookie: string) => void
}

export interface ICreateClientByType {
    type: 'quark' | 'uc',
    cookie: string
    cookieUpdate?: (cookie: string) => void
}

export class QuarkUCClient {
    agent: Agent
    agentApi: Agent

    config: ICreateClientConfig

    shareApi: QuarkUCShareApi
    fsApi: QuarkUCFSApi

    constructor(config: ICreateClientConfig, agent?: Agent);
    constructor(config: ICreateClientByType, agent?: Agent);

    constructor(config: any, agent?: Agent) {
        if (Check.isString(config.type)) {
            const { type, cookie } = config
            if (type == 'quark') {
                this.config = {
                    ...config,
                    ...CreateQuarkClientParam,
                }
            } else if (type == 'uc') {
                this.config = {
                    ...config,
                    ...CreateUCClientParam,
                }
            } else { throw new Error(`not support type ${config}`) }
        } else {
            this.config = config
        }

        this.agent = (agent ?? superagent.agent())
            .use((request: Request) => {
                // 监听cookie更新
                request.on('response', (resp: Response) => {
                    const setCookie = ArrayUtil.toArray(resp.header['set-cookie'])
                        .filter(Boolean).map(v => v.split(';')[0])
                    const puus = setCookie.find(c => c.startsWith('__puus'))
                    if (puus != null) this.updateCookie(setCookie.join(';'))
                })
            })
        this.agentApi = this.agent
            .use(prefix(this.config.api))
            .use((request: Request) => {
                // 自动注入
                const { cookie, referer, pr, ua } = this.config
                const end = request.end
                request.end = function () {
                    this.set({
                        cookie, referer, pr,
                        "user-agent": ua,
                        Accept: 'application/json, text/plain, */*',
                    }).query({ pr, fr: "pc" })
                    // @ts-ignore
                    return end.apply(this, arguments)
                }
            })
            .ok(throwError)
            .retry(3)

        this.fsApi = new QuarkUCFSApi(this)
        this.shareApi = new QuarkUCShareApi(this)
    }

    updateCookie(cookie: string) {
        this.config.cookie = CookieUtil.mergeCookie(this.config.cookie || '', cookie)
        this.config.cookieUpdate?.(this.config.cookie)
    }

    /** 
     * 每次请求会刷新 __puus ，不需要太频繁
     */
    async keepAlive() {
        const { body } = await this.agentApi.get('/auth/pc/flush')
        return body
    }
}