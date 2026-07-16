import superagent, { Agent, Request } from "superagent";
import { HttpsAgent } from "agentkeepalive";
import { throwError } from "./errors";
import { BaiduFSOpenApi } from "./fs_openapi";
import { BaiduFSApi } from "./fs_api";
import { BaiduShareFSApi } from "./fs_share_api";

export interface IBaiduRefreshTokenInfo {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

export class BaiduClient {
  agentApi: Agent;
  source: string;

  public accessToken: string | null = null;
  public refreshToken: string | null = null;
  public expiresAt: number | null = null;
  public clientId: string | null = null;
  public clientSecret: string | null = null;
  public onRefreshToken?: (tokenInfo: IBaiduRefreshTokenInfo) => void;

  fsApi: BaiduFSApi;
  fsShareApi: BaiduShareFSApi;
  fsOpenApi: BaiduFSOpenApi;
  fsYouthApi: Omit<BaiduFSApi, "listall">;

  // 用于存储用户信息
  public bduss: string | null = null;
  public uid: string | null = null;
  public androidChannel: {
    sk: string | null;
  } = { sk: null };

  constructor(config: {
    source: string;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    onRefreshToken?: (tokenInfo: IBaiduRefreshTokenInfo) => void;
    agent?: Agent;
  }) {
    const {
      source,
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      expiresAt,
      onRefreshToken,
      agent,
    } = config;

    const getAccessToken = () => {
      return this.accessToken;
    };

    const authPlugin = (request: Request) => {
      const end = request.end;
      request.end = async function () {
        this.set("Cookie", source);
        // openapi 需要 accessToken
        const accessToken = getAccessToken();
        if (accessToken) {
          this.query({ access_token: accessToken });
        }
        // @ts-ignore
        return end.apply(this, arguments);
      };
    };

    this.source = source;
    this.clientId = clientId ?? null;
    this.clientSecret = clientSecret ?? null;
    this.onRefreshToken = onRefreshToken;
    this.accessToken = accessToken ?? null;
    this.refreshToken = refreshToken ?? null;
    this.expiresAt = expiresAt ?? null;

    const httpsAgent = new HttpsAgent({
      maxSockets: 100,
      maxFreeSockets: 10,
      timeout: 60000, // active socket keepalive for 60 seconds
      freeSocketTimeout: 30000, // free socket keepalive for 30 seconds
    });

    this.agentApi = (agent ?? superagent.agent(httpsAgent as any))
      // 增加授权信息
      .timeout(15000)
      .use(authPlugin)
      .set({ "user-agent": "pan.baidu.com" })
      .ok(throwError)
      .retry(3);

    this.fsApi = new BaiduFSApi(this, "https://pan.baidu.com");
    this.fsShareApi = new BaiduShareFSApi(this);
    this.fsYouthApi = new BaiduFSApi(this, "https://pan.baidu.com/youth");
    this.fsOpenApi = new BaiduFSOpenApi(this);
  }

  _onRefreshToken(tokenInfo: IBaiduRefreshTokenInfo) {
    this.accessToken = tokenInfo.accessToken;
    this.refreshToken = tokenInfo.refreshToken;
    this.expiresAt = tokenInfo.expiresAt;
    this.onRefreshToken?.(tokenInfo);
  }

  public async init() {
    // 如果使用 cookie，则初始化用户信息
    if (typeof this.source === "string") {
      await this._initializeUserDetails(this.source);
    }
  }

  private async _initializeUserDetails(cookie: string) {
    const bdussMatch = cookie.match(/BDUSS=([^;]+)/);
    if (bdussMatch) {
      this.bduss = bdussMatch[1];
      this.uid = await this._getUidFromSyncApi();
      if (this.uid) {
        this.androidChannel.sk = await this._getSkFromAndroidChannelApi(
          this.uid,
        );
      }
    }
  }

  private async _getUidFromSyncApi(): Promise<string | null> {
    try {
      const response = await superagent
        .get("https://tieba.baidu.com/mo/q/sync")
        .set("Cookie", `BDUSS=${this.bduss}`);
      const result = response.body;
      if (result.no === 0 && result.data && result.data.user_id) {
        return result.data.user_id.toString();
      }
    } catch (error) {
      console.error("Failed to get UID from sync API:", error);
    }
    return null;
  }

  private async _getSkFromAndroidChannelApi(
    uid: string,
  ): Promise<string | null> {
    try {
      const params = {
        action: "ANDROID_ACTIVE_BACKGROUND_UPLOAD_AND_DOWNLOAD",
        clienttype: "1",
        needrookie: "1",
        timestamp: Date.now().toString(),
        bind_uid: uid,
        channel: "android",
      };
      const response = await this.agentApi
        .get("https://pan.baidu.com/api/report/user")
        .query(params);

      if (response.body.errno === 0 && response.body.uinfo) {
        return response.body.uinfo;
      }
    } catch (error) {
      console.error("Failed to get SK from API:", error);
    }
    return null;
  }

  setDevuid(devuid: string) {
    this.agentApi.query({ devuid });
    return this;
  }

  async redirectDlink(
    dlink: string | { dlink: string },
    ua = "netdisk",
  ): Promise<string | null> {
    const link = typeof dlink == "string" ? dlink : dlink.dlink;
    if (typeof fetch != "undefined") {
      const url = new URL(link);
      const headers: Record<string, string> = { "user-agent": ua };
      if (typeof this.source === "string") {
        headers["cookie"] = this.source;
      } else {
        const { accessToken } =
          (await this.source?.getToken()) || this.accessToken || {};
        const search = url.searchParams;
        search.set("access_token", accessToken);
        url.search = search.toString();
      }

      const resp = await fetch(url, {
        method: "HEAD",
        headers,
        redirect: "manual",
      });
      return resp.headers.get("location");
    }
    const resp = await this.agentApi.head(link).set({ "user-agent": ua });
    return resp.headers["location"] || resp.xhr?.requestURL;
  }
}
