import * as cheerio from "cheerio";

const USER_AGENT_UC =
  "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Mobile Safari/537.36";
const USER_AGENT_BAIDU =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const USER_AGENT_123PAN = "Mozilla/5.0";
const DEFAULT_TIMEOUT = 10_000;

const extractors: Record<string, { domains: string[]; pattern: RegExp }> = {
  uc: {
    domains: ["drive.uc.cn"],
    pattern: /https?:\/\/drive\.uc\.cn\/s\/([a-zA-Z0-9]+)/,
  },
  aliyun: {
    domains: ["aliyundrive.com", "alipan.com"],
    pattern:
      /https?:\/\/(?:www\.)?(?:aliyundrive|alipan)\.com\/s\/([a-zA-Z0-9]+)/,
  },
  quark: {
    domains: ["pan.quark.cn"],
    pattern: /https?:\/\/(?:www\.)?pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/,
  },
  "115": {
    domains: ["115.com", "115cdn.com", "anxia.com"],
    pattern:
      /https?:\/\/(?:www\.)?(?:115|115cdn|anxia)\.com\/s\/([a-zA-Z0-9]+)/,
  },
  "123pan": {
    domains: [
      "123684.com",
      "123685.com",
      "123912.com",
      "123pan.com",
      "123pan.cn",
      "123592.com",
    ],
    pattern:
      /https?:\/\/(?:www\.)?(?:123684|123685|123912|123pan|123pan\.cn|123592)\.com\/s\/([a-zA-Z0-9-]+)/,
  },
  tianyi: {
    domains: ["cloud.189.cn"],
    pattern:
      /https?:\/\/cloud\.189\.cn\/(?:t\/|web\/share\?code=)([a-zA-Z0-9]+)/,
  },
  xunlei: {
    domains: ["pan.xunlei.com"],
    pattern: /https?:\/\/(?:www\.)?pan\.xunlei\.com\/s\/([a-zA-Z0-9-_]+)/,
  },
  baidu: {
    domains: ["pan.baidu.com", "yun.baidu.com"],
    pattern:
      /https?:\/\/(?:[a-z]+\.)?(?:pan|yun)\.baidu\.com\/(?:s\/|share\/init\?surl=)([a-zA-Z0-9_-]+)/,
  },
};

export interface ShareLinkInfo {
  type: string;
  shareId: string;
}

export function extractNetDiskShareId(url: string): ShareLinkInfo | null {
  for (const [type, config] of Object.entries(extractors)) {
    if (!config.domains.some((domain) => url.includes(domain))) continue;
    const match = url.match(config.pattern);
    if (match?.[1]) {
      return { type, shareId: match[1] };
    }
  }
  return null;
}

function abortSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function checkUC(shareId: string): Promise<boolean> {
  const url = `https://drive.uc.cn/s/${shareId}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT_UC,
        Host: "drive.uc.cn",
        Referer: url,
        Origin: "https://drive.uc.cn",
      },
      signal: abortSignal(DEFAULT_TIMEOUT),
    });
    if (!res.ok) return false;
    const html = await res.text();
    const $ = cheerio.load(html);
    const pageText = $("body").text().trim();

    // 包含错误关键词
    const errorKeywords = [
      "失效",
      "不存在",
      "违规",
      "删除",
      "已过期",
      "被取消",
    ];
    if (errorKeywords.some((kw) => pageText.includes(kw))) return false;

    // 包含提取码关键词
    const passwordKeywords = ["提取码", "访问码", "请输入密码"];
    if (passwordKeywords.some((kw) => pageText.includes(kw))) return true;

    // 存在提取码输入框
    if ($(".share-receive-card .input-wrap input").length > 0) return true;

    // 包含文件列表关键词
    if (pageText.includes("提取文件") || $(".mini-file-list").length > 0) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function checkAliyun(shareId: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://api.aliyundrive.com/adrive/v3/share_link/get_share_by_anonymous",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_id: shareId }),
        signal: abortSignal(DEFAULT_TIMEOUT),
      },
    );
    const data = (await res.json()) as any;
    if (data?.has_pwd) return true;
    if (data?.code === "ShareLink.Expired") return false;
    if (data?.code === "NotFound.ShareLink") return false;
    if (!data?.file_infos?.length) return false;
    return true;
  } catch {
    return false;
  }
}

async function check115(shareId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://webapi.115.com/share/snap?share_code=${shareId}&receive_code=`,
      { signal: abortSignal(DEFAULT_TIMEOUT) },
    );
    const data = (await res.json()) as any;
    if (data?.state) return true;
    if (data?.error?.includes?.("请输入访问码")) return true;
    return false;
  } catch {
    return false;
  }
}

async function checkQuark(shareId: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://drive.quark.cn/1/clouddrive/share/sharepage/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pwd_id: shareId, passcode: "" }),
        signal: abortSignal(DEFAULT_TIMEOUT),
      },
    );
    const data = (await res.json()) as any;
    if (data?.message === "ok") {
      const stoken = data?.data?.stoken;
      if (!stoken) return false;
      const detailRes = await fetch(
        `https://drive-h.quark.cn/1/clouddrive/share/sharepage/detail?pwd_id=${shareId}&stoken=${encodeURIComponent(
          stoken,
        )}&_fetch_share=1`,
        { signal: abortSignal(DEFAULT_TIMEOUT) },
      );
      const detail = (await detailRes.json()) as any;
      if (detail?.status === 400) return true;
      if (detail?.data?.share?.status === 1) return true;
      return false;
    }
    if (data?.message === "需要提取码") return true;
    return false;
  } catch {
    return false;
  }
}

async function check123Pan(shareId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.123pan.com/api/share/info?shareKey=${shareId}`,
      {
        headers: { "User-Agent": USER_AGENT_123PAN },
        signal: abortSignal(DEFAULT_TIMEOUT),
      },
    );
    const text = await res.text();
    if (text.includes("分享页面不存在")) return false;
    const data = JSON.parse(text) as any;
    if (data?.code !== 0) return false;
    return true;
  } catch {
    return false;
  }
}

async function checkTianyi(shareId: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://api.cloud.189.cn/open/share/getShareInfoByCodeV2.action",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ shareCode: shareId }),
        signal: abortSignal(DEFAULT_TIMEOUT),
      },
    );
    const text = await res.text();
    const errorKeywords = [
      "ShareInfoNotFound",
      "ShareNotFound",
      "FileNotFound",
      "ShareExpiredError",
      "ShareAuditNotPass",
    ];
    if (errorKeywords.some((kw) => text.includes(kw))) return false;
    if (text.includes("needAccessCode")) return true;
    return true;
  } catch {
    return false;
  }
}

async function checkXunlei(shareId: string): Promise<boolean> {
  try {
    const tokenRes = await fetch(
      "https://xluser-ssl.xunlei.com/v1/shield/captcha/init",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "Xqp0kJBXWhwaTpB6",
          device_id: "925b7631473a13716b791d7f28289cad",
          action: "get:/drive/v1/share",
          meta: {
            package_name: "pan.xunlei.com",
            client_version: "1.45.0",
            captcha_sign: "1.fe2108ad808a74c9ac0243309242726c",
            timestamp: "1645241033384",
          },
        }),
        signal: abortSignal(DEFAULT_TIMEOUT),
      },
    );
    const tokenJson = (await tokenRes.json()) as any;
    const token = tokenJson?.captcha_token;
    if (!token) return false;

    const res = await fetch(
      `https://api-pan.xunlei.com/drive/v1/share?share_id=${shareId}`,
      {
        headers: {
          "x-captcha-token": token,
          "x-client-id": "Xqp0kJBXWhwaTpB6",
          "x-device-id": "925b7631473a13716b791d7f28289cad",
        },
        signal: abortSignal(DEFAULT_TIMEOUT),
      },
    );
    const text = await res.text();
    if (["PASS_CODE_EMPTY", "OK"].some((kw) => text.includes(kw))) return true;
    return false;
  } catch {
    return false;
  }
}

async function checkBaidu(shareId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://pan.baidu.com/s/${shareId}`, {
      headers: { "User-Agent": USER_AGENT_BAIDU },
      redirect: "follow",
      signal: abortSignal(DEFAULT_TIMEOUT),
    });
    const text = await res.text();
    const invalidKeywords = [
      "分享的文件已经被取消",
      "分享已过期",
      "你访问的页面不存在",
      "你所访问的页面",
      "链接不存在",
    ];

    if (invalidKeywords.some((kw) => text.includes(kw))) return false;
    if (text.includes("请输入提取码") || text.includes("提取文件")) return true;
    if (text.includes("过期时间") || text.includes("文件列表")) return true;
    return false;
  } catch {
    return false;
  }
}

const checkers: Record<string, (shareId: string) => Promise<boolean>> = {
  uc: checkUC,
  aliyun: checkAliyun,
  quark: checkQuark,
  "115": check115,
  "123pan": check123Pan,
  tianyi: checkTianyi,
  xunlei: checkXunlei,
  baidu: checkBaidu,
};

export async function validateNetDiskLink(url: string): Promise<boolean> {
  const info = extractNetDiskShareId(url);
  if (!info) return false;
  const checker = checkers[info.type];
  if (!checker) return false;
  return checker(info.shareId);
}

export async function validateNetDiskLinks(
  urls: string[],
): Promise<{ url: string; valid: boolean }[]> {
  return Promise.all(
    urls.map(async (url) => ({
      url,
      valid: await validateNetDiskLink(url),
    })),
  );
}
