import axios from "axios";

/**
 * 网盘二维码登录（夸克 / UC / 百度）
 *
 * 纯函数模块，不依赖 h3，可被 vitest 直接测试。
 * 三个平台都是「生成二维码 → 轮询扫码状态 → 拿 service ticket / bduss 换完整 cookie」的同一套流程，
 * 差异只在接口地址、参数和换 cookie 的细节，这里用一份策略表统一收敛。
 *
 * 注意：这些是非官方逆向接口，随时可能失效；失效时轮询会返回 status=expired，由上层提示重新生成。
 */

/** 支持扫码登录的网盘类型 */
export type QrLoginType = "quark" | "uc" | "baidu";

/** 一次扫码会话需要持久化的上下文（换取 cookie 时要用） */
export interface QrSessionContext {
  type: QrLoginType;
  /** 夸克/UC：登录 token；百度：sign（channel_id） */
  token?: string;
  /** 请求去重标识 */
  requestId?: string;
  /** 生成二维码时服务端下发的 cookie，换完整 cookie 时要带回 */
  cookies: string[];
  /** 平台特有额外字段（如百度的 channelId/t1/t3/gid） */
  extra?: Record<string, string>;
}

/** 扫码状态 */
export type QrLoginStatus =
  | "pending" // 未扫码，继续等待
  | "scanned" // 已扫码待确认（仅百度有这个中间态）
  | "confirmed" // 扫码确认成功，cookie 已就绪
  | "expired" // 二维码过期
  | "error"; // 接口异常

export interface QrLoginResult {
  status: QrLoginStatus;
  /** confirmed 时返回的完整 cookie */
  cookie?: string;
  /** 附带说明（用于错误提示） */
  message?: string;
}

// ---------------------------------------------------------------------------
// 策略表
// ---------------------------------------------------------------------------

interface QrStrategy {
  /** 获取登录 token 的接口 */
  tokenUrl: string;
  /** tokenUrl 的 query 参数（getToken） */
  tokenParams: (requestId: string) => Record<string, string>;
  /** 轮询扫码状态的接口 */
  pollUrl: string;
  /** pollUrl 的 query 参数（getServiceTicket） */
  pollParams: (
    ctx: QrSessionContext,
  ) => Record<string, string>;
  /** 二维码内容（供前端生成二维码图） */
  qrContent: (token: string) => string;
  /** 是否返回图片直链（true 时前端直接 <img> 加载，无需本地渲染） */
  isImageUrl?: boolean;
  /** 从 poll 响应中解析状态。返回 { ok, cookie? } */
  parsePoll: (body: any, ctx: QrSessionContext) => Promise<{
    status: QrLoginStatus;
    cookie?: string;
  }>;
  ua: string;
  referer?: string;
}

/** 生成一个简单的请求去重 id（不依赖 crypto.randomUUID，避免多环境差异） */
function genRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 把 Set-Cookie 头数组解析成「key=value」数组（去 path/expires 等属性） */
function parseSetCookie(setCookie: string | string[] | undefined): string[] {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list
    .filter(Boolean)
    .map((v) => v.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
}

/** 合并 cookie 数组为字符串，同名后写覆盖前写 */
function joinCookies(base: string[], extra: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...base, ...extra]) {
    const idx = c.indexOf("=");
    if (idx <= 0) continue;
    map.set(c.slice(0, idx).trim(), c.slice(idx + 1).trim());
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`);
}

function cookieArrayToString(cookies: string[]): string {
  return cookies.join("; ");
}

// ---------------------------------------------------------------------------
// 夸克 / UC
//
// 两者共用同一套 CAS 流程，差异在域名、clientId、二维码参数和补全 __puus 的步骤。
// 换 cookie 参考 2026-02 的 quarkdownloaderpro 实测实现：
//   1. GET pan.quark.cn/account/info?st={service_ticket}&lw=scan  → 种登录 cookie
//   2. 依次访问若干网盘页面补全 __puus（关键，缺它后续接口会失效）
// ---------------------------------------------------------------------------

/** 夸克与 UC 共用同一套 CAS 流程，仅地址/clientId/二维码模板不同 */
function makeQuarkUCStrategy(
  type: "quark" | "uc",
  conf: {
    tokenUrl: string;
    pollUrl: string;
    clientId: string;
    accountInfoUrl: string;
    /** 换完 ticket 后依次访问以补全 __puus 的 URL 列表 */
    puusSteps: string[];
    qrContent: (token: string) => string;
    ua: string;
    referer: string;
  },
): QrStrategy {
  return {
    tokenUrl: conf.tokenUrl,
    tokenParams: (requestId) => ({
      client_id: conf.clientId,
      v: "1.2",
      request_id: requestId,
    }),
    pollUrl: conf.pollUrl,
    pollParams: (ctx) => ({
      __t: Date.now().toString(),
      token: ctx.token ?? "",
      client_id: conf.clientId,
      v: "1.2",
      request_id: ctx.requestId ?? "",
    }),
    qrContent: conf.qrContent,
    ua: conf.ua,
    referer: conf.referer,
    parsePoll: async (body, ctx) => {
      const status = body?.status;
      if (status === 2000000) {
        const ticket = body?.data?.members?.service_ticket;
        if (!ticket) {
          return { status: "error" };
        }
        const cookie = await fetchQuarkUCCookie(conf, ticket, ctx);
        return { status: "confirmed", cookie };
      }
      if (status === 50004002 || status === 2000001) {
        // 2000001 = 已过期 / 被取消，一并归为过期
        return { status: "expired" };
      }
      // 其余状态（未扫码/已扫码待确认）继续轮询
      return { status: "pending" };
    },
  };
}

async function fetchQuarkUCCookie(
  conf: {
    accountInfoUrl: string;
    puusSteps: string[];
    ua: string;
    referer: string;
  },
  ticket: string,
  ctx: QrSessionContext,
): Promise<string> {
  let cookies = [...ctx.cookies];

  // 第一步：拿 service ticket 访问账号信息接口，种下登录 cookie
  // 注意参数是 st + lw=scan（不是 fr=pc），否则夸克 APP 会判定登录请求已过期
  const accountRes = await axios.get(conf.accountInfoUrl, {
    params: { st: ticket, lw: "scan" },
    headers: {
      "User-Agent": conf.ua,
      Referer: conf.referer,
      Cookie: cookieArrayToString(cookies),
    },
    maxRedirects: 5,
    timeout: 15000,
  });
  cookies = joinCookies(cookies, parseSetCookie(accountRes.headers["set-cookie"]));

  // 第二步起：依次访问网盘页面补全 __puus（拿到即止）
  const cookieStr = () => cookieArrayToString(cookies);
  const hasPuus = () => cookieStr().includes("__puus=");

  for (const url of conf.puusSteps) {
    if (hasPuus()) break;
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent": conf.ua,
          Referer: conf.referer,
          Cookie: cookieStr(),
        },
        maxRedirects: 5,
        timeout: 15000,
      });
      const extra = parseSetCookie(res.headers["set-cookie"]);
      if (extra.length) {
        cookies = joinCookies(cookies, extra);
      }
    } catch {
      // 单步失败不阻断，继续下一步
    }
  }

  return cookieArrayToString(cookies);
}

// ---------------------------------------------------------------------------
// 百度（passport.baidu.com 新版流程）
//
// 旧接口 pan.baidu.com/api/qrcode/create 已下线（实测 404），改用 passport 新流程：
//   1. GET passport.baidu.com/v2/api/getqrcode  → imgurl + sign(channel_id)
//   2. GET passport.baidu.com/channel/unicast   → 扫码成功后返回 channel_v(内含 BDUSS)
//   3. GET passport.baidu.com/v3/login/main/qrbdusslogin → 用 BDUSS 换完整 cookie
// 二维码本身是图片直链（imgurl），由前端直接 <img> 加载，无需本地渲染。
// ---------------------------------------------------------------------------

const BAIDU_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.61 Safari/537.36";
const BAIDU_TTL = "netdisk";

function extractValue(text: string, regex: RegExp): string {
  const m = text.match(regex);
  return m?.[1] ?? "";
}

async function baiduFetchFullCookie(
  bduss: string,
  t1: string,
  t3: string,
): Promise<string> {
  const params: Record<string, string> = {
    v: t3,
    bduss,
    u: "https://pan.baidu.com/disk/main#/index?category=all",
    loginVersion: "v5",
    qrcode: "1",
    tpl: BAIDU_TTL,
    maskId: "",
    fileId: "",
    apiver: "v3",
    tt: t3,
    traceid: "",
    time: t1,
    alg: "v3",
    elapsed: "1",
  };

  const resp = await axios.get(
    "https://passport.baidu.com/v3/login/main/qrbdusslogin",
    {
      params,
      headers: {
        "User-Agent": BAIDU_UA,
        Referer: "https://pan.baidu.com/",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      timeout: 30000,
    },
  );

  const data = resp.data;
  if (!data) throw new Error("获取百度 cookie 失败");

  const cookieData = data?.data || data;
  const text =
    typeof cookieData === "string" ? cookieData : JSON.stringify(cookieData || "");

  const extractedBduss = extractValue(text, /"bduss":\s*"(.*?)"/i) || bduss;
  const stoken = extractValue(text, /"stoken":\s*"(.*?)"/i);
  const ptoken = extractValue(text, /"ptoken":\s*"(.*?)"/i);
  const ubiRaw = extractValue(text, /"ubi":\s*"(.*?)"/i);
  const ubi = ubiRaw ? encodeURIComponent(ubiRaw) : "";

  const cookieObj: Record<string, string> = {
    newlogin: "1",
    BDUSS: extractedBduss,
    BDUSS_BFESS: extractedBduss,
    UBI: ubi,
    STOKEN: stoken,
    PTOKEN: ptoken,
    STOKEN_BFESS: stoken,
    PTOKEN_BFESS: ptoken,
    UBI_BFESS: ubi,
  };

  const cookieStr = Object.entries(cookieObj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  // 第二步：访问 auth 接口走一遍重定向，让服务端 Set-Cookie 补全 STOKEN 等
  try {
    const authResp = await axios.get(
      "https://passport.baidu.com/v3/login/api/auth/",
      {
        params: {
          return_type: "5",
          tpl: BAIDU_TTL,
          u: "https://pan.baidu.com/disk/home",
        },
        headers: {
          "User-Agent": BAIDU_UA,
          Referer: "https://pan.baidu.com/",
          Cookie: cookieStr,
          Accept: "*/*",
        },
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
        timeout: 30000,
      },
    );

    const setCookies = authResp.headers["set-cookie"];
    const list = Array.isArray(setCookies)
      ? setCookies
      : setCookies
        ? [setCookies]
        : [];
    const stokenCookie = list.find((c) =>
      typeof c === "string" && /STOKEN(_BFESS)?=/i.test(c),
    );
    if (stokenCookie) {
      // 若拿到服务端 STOKEN，优先用它
      return `BDUSS=${extractedBduss}; ${stokenCookie.split(";")[0]};`;
    }
  } catch {
    // auth 步骤失败不阻断，用 qrbdusslogin 拼出的 cookie 兜底
  }

  return cookieStr;
}

const baiduStrategy: QrStrategy = {
  tokenUrl: "https://passport.baidu.com/v2/api/getqrcode",
  tokenParams: (requestId) => {
    const t3 = Date.now().toString();
    const t1 = Math.floor(Date.now() / 1000).toString();
    return {
      lp: "pc",
      qrloginfrom: "pc",
      gid: requestId,
      apiver: "v3",
      tt: t3,
      tpl: BAIDU_TTL,
      logPage: `traceId%3Apc_loginv5_${t1}%2ClogPage%3Aloginv5`,
      _: t3,
    };
  },
  pollUrl: "https://passport.baidu.com/channel/unicast",
  pollParams: (ctx) => {
    const extra = ctx.extra;
    const t3 = Date.now().toString();
    return {
      channel_id: extra?.channelId ?? "",
      gid: extra?.gid ?? "",
      tpl: BAIDU_TTL,
      _sdkFrom: "1",
      apiver: "v3",
      tt: t3,
      _: t3,
    };
  },
  qrContent: (token) => token,
  isImageUrl: true,
  ua: BAIDU_UA,
  referer: "https://pan.baidu.com/",
  parsePoll: async (body, ctx) => {
    const extra = ctx.extra;
    const resData = body?.data || body;

    if (!resData) {
      // 未扫码：返回空
      return { status: "pending" };
    }

    if (resData.channel_v) {
      let bdData: any = null;
      try {
        bdData = JSON.parse(resData.channel_v);
      } catch {
        return { status: "pending" };
      }
      if (bdData?.v) {
        // 拿到 BDUSS，换完整 cookie
        const cookie = await baiduFetchFullCookie(
          bdData.v,
          extra?.t1 ?? Math.floor(Date.now() / 1000).toString(),
          extra?.t3 ?? Date.now().toString(),
        );
        return { status: "confirmed", cookie };
      }
      // channel_v 存在但无 v：已扫码待确认
      return { status: "scanned" };
    }

    if (resData.errno || resData.data) {
      // 过期或异常
      return { status: "expired" };
    }

    return { status: "pending" };
  },
};

// ---------------------------------------------------------------------------
// 策略注册
// ---------------------------------------------------------------------------

const STRATEGIES: Record<QrLoginType, QrStrategy> = {
  quark: makeQuarkUCStrategy("quark", {
    tokenUrl: "https://uop.quark.cn/cas/ajax/getTokenForQrcodeLogin",
    pollUrl: "https://uop.quark.cn/cas/ajax/getServiceTicketByQrcodeToken",
    clientId: "532",
    accountInfoUrl: "https://pan.quark.cn/account/info",
    puusSteps: [
      "https://pan.quark.cn/list",
      "https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid=0&_page=1&_size=50&_fetch_total=1&_sort=file_type:asc,updated_at:desc",
      "https://drive.quark.cn/1/clouddrive/member?pr=ucpro&fr=pc&uc_param_str=&fetch_subscribe=true",
    ],
    // 二维码 URL 必须带 uc_param_str 和 uc_biz_str，否则夸克 APP 判定「登录请求已过期」
    qrContent: (token) =>
      `https://su.quark.cn/4_eMHBJ?token=${encodeURIComponent(token)}&client_id=532&ssb=weblogin&uc_param_str=&uc_biz_str=${encodeURIComponent("S:custom|OPT:SAREA@0|OPT:IMMERSIVE@1|OPT:BACK_BTN_STYLE@0")}`,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
    referer: "https://pan.quark.cn",
  }),
  uc: makeQuarkUCStrategy("uc", {
    tokenUrl: "https://api.open.uc.cn/cas/ajax/getTokenForQrcodeLogin",
    pollUrl: "https://api.open.uc.cn/cas/ajax/getServiceTicketByQrcodeToken",
    clientId: "381",
    accountInfoUrl: "https://drive.uc.cn/account/info",
    puusSteps: [
      "https://drive.uc.cn/",
      "https://pc-api.uc.cn/1/clouddrive/file/sort?pr=UCBrowser&fr=pc&uc_param_str=&pdir_fid=0&_page=1&_size=50&_fetch_total=1",
    ],
    // UC 二维码 URL 同样需要 uc_param_str / uc_biz_str 参数
    qrContent: (token) =>
      `https://su.uc.cn/1_n0ZCv?uc_param_str=dsdnfrpfbivesscpgimibtbmnijblauputogpintnwktprchmt&token=${encodeURIComponent(token)}&client_id=381&uc_biz_str=${encodeURIComponent("S:custom|C:titlebar_fix")}`,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
    referer: "https://drive.uc.cn",
  }),
  baidu: baiduStrategy,
};

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/** 判断是否支持扫码登录 */
export function isQrLoginSupported(type: string): boolean {
  return type in STRATEGIES;
}

export interface QrCreateResult {
  /** 会话标识（前端轮询时带回） */
  sessionId: string;
  /** 二维码内容：百度是图片直链，夸克/UC 是需要本地渲染的内容字符串 */
  qrContent: string;
  /** true 表示 qrContent 是图片 URL（前端直接 <img> 加载） */
  isImageUrl: boolean;
}

/**
 * 创建一次扫码会话：请求登录 token，返回二维码内容 + 会话上下文。
 * 会话上下文由调用方（API 层）持有，这里只返回 token 等必要字段。
 */
export async function createQrSession(
  type: QrLoginType,
): Promise<{ ctx: QrSessionContext; qrContent: string; isImageUrl: boolean }> {
  const strategy = STRATEGIES[type];
  const requestId = genRequestId();

  const resp = await axios.get(strategy.tokenUrl, {
    params: strategy.tokenParams(requestId),
    headers: {
      "User-Agent": strategy.ua,
      ...(strategy.referer ? { Referer: strategy.referer } : {}),
    },
    timeout: 15000,
  });

  let token = "";
  let extra: Record<string, string> | undefined;
  let isImageUrl = false;

  if (type === "baidu") {
    // 百度返回 { errno:0, imgurl:"passport.baidu.com/v2/api/qrcode?sign=...", sign:"..." }
    const sign = resp.data?.sign;
    const imgurl = resp.data?.imgurl;
    if (!sign || !imgurl) {
      throw new Error("百度获取登录二维码失败");
    }
    token = sign;
    isImageUrl = true;
    const t3 = Date.now().toString();
    const t1 = Math.floor(Date.now() / 1000).toString();
    extra = {
      channelId: sign,
      gid: requestId,
      t1,
      t3,
    };
  } else {
    token = resp.data?.data?.members?.token;
    if (!token) {
      throw new Error("获取登录 token 失败");
    }
  }

  const ctx: QrSessionContext = {
    type,
    token,
    requestId,
    cookies: parseSetCookie(resp.headers["set-cookie"]),
    extra,
  };

  const qrContent = isImageUrl
    ? `https://${resp.data.imgurl}`
    : strategy.qrContent(token);

  return { ctx, qrContent, isImageUrl };
}

/**
 * 轮询扫码状态；确认成功时返回完整 cookie。
 */
export async function pollQrSession(
  ctx: QrSessionContext,
): Promise<QrLoginResult> {
  const strategy = STRATEGIES[ctx.type];
  try {
    const resp = await axios.get(strategy.pollUrl, {
      params: strategy.pollParams(ctx),
      headers: {
        "User-Agent": strategy.ua,
        ...(strategy.referer ? { Referer: strategy.referer } : {}),
      },
      timeout: 15000,
    });
    const parsed = await strategy.parsePoll(resp.data, ctx);
    return parsed;
  } catch (e: any) {
    // 网络/接口异常时不要中断轮询，返回 pending 让前端继续；但明确标记为可重试
    return { status: "pending", message: e?.message || "轮询异常" };
  }
}
