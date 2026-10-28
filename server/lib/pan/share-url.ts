import { isGuangyaURL, parseGuangyaShareURL } from "@netdisk-sdk/guangya-sdk";
import { isC139URL, parseC139ShareURL } from "@netdisk-sdk/c139-sdk";
import type { ParsedShare, PanType } from "./types";

/**
 * 分享链接识别与规范化。
 *
 * 原实现是 8 段平铺 if + 两处 if-else listFn 选择，规则改动要同时动多个分支。
 * 这里把「正则 → 类型」抽成规则表，解析器退化为一次查表；新增网盘只需追加一条规则。
 */

/** 允许转存的分享域名白名单（O(1) 判断） */
export const ALLOWED_HOSTS = new Set([
  "pan.quark.cn",
  "pan.baidu.com",
  "drive.uc.cn",
  "fast.uc.cn",
  "pan.xunlei.com",
  "www.guangyapan.com",
  "guangyapan.com",
  "yun.139.com",
  "caiyun.139.com",
]);

/** 提取码提取：严格限制字符集，防正则穿透 */
const PASSCODE_RE =
  /(?:密|提取|访问|訪問|key=|pwd=|password=|code=|passcode=|:|：|[码碼])\s*([a-zA-Z0-9]{4})/i;

function extractPasscode(url: string): string {
  const m = url.match(PASSCODE_RE);
  return m && m[1] ? m[1] : "";
}

interface ShareRule {
  type: PanType;
  pattern: RegExp;
  /** 默认取第一个捕获组作为 fid，个别规则需要改写（如百度 surl 要补前缀 1） */
  toFid?: (captured: string) => string;
}

const SHARE_RULES: ShareRule[] = [
  { type: "quark", pattern: /pan\.quark\.cn\/s\/([a-zA-Z0-9-_]+)/i },
  { type: "uc", pattern: /(?:drive|fast)\.uc\.cn\/s\/([a-zA-Z0-9-_]+)/i },
  { type: "baidu", pattern: /pan\.baidu\.com\/s\/([a-zA-Z0-9-_]+)/i },
  {
    type: "baidu",
    pattern: /pan\.baidu\.com\/share\/init\?surl=([a-zA-Z0-9-_]+)/i,
    // init 形式拿到的是 surl，真实 fid 需要补一个前导 1
    toFid: (surl) => `1${surl}`,
  },
  { type: "xunlei", pattern: /pan\.xunlei\.com\/s\/([a-zA-Z0-9-_]+)/i },
];

/** 需要借助各 SDK 自带解析器的网盘（URL 形态多，正则维护不划算） */
const SDK_PARSERS: {
  type: PanType;
  detect: (url: string) => boolean;
  parse: (url: string) => { fid: string; passcode: string } | null;
}[] = [
  {
    type: "guangya",
    detect: isGuangyaURL,
    parse: (url) => {
      const parsed = parseGuangyaShareURL(url);
      return parsed.shareId
        ? { fid: parsed.shareId, passcode: parsed.passcode }
        : null;
    },
  },
  {
    type: "c139",
    detect: isC139URL,
    parse: (url) => {
      const parsed = parseC139ShareURL(url);
      return parsed.linkId
        ? { fid: parsed.linkId, passcode: parsed.passcode }
        : null;
    },
  },
];

/**
 * 解析分享链接，识别网盘类型并提取 fid 和提取码
 */
export function parseShareUrl(url: string): ParsedShare {
  for (const rule of SHARE_RULES) {
    const match = url.match(rule.pattern);
    if (match && match[1]) {
      return {
        type: rule.type,
        fid: rule.toFid ? rule.toFid(match[1]) : match[1],
        passcode: extractPasscode(url),
        url,
      };
    }
  }

  for (const parser of SDK_PARSERS) {
    if (!parser.detect(url)) continue;
    const parsed = parser.parse(url);
    if (parsed) {
      return { type: parser.type, ...parsed, url };
    }
  }

  return { type: "unknown", fid: "", passcode: "", url };
}

/**
 * 规范化用户粘贴的分享链接：全角符号转半角、去掉所有空白
 */
export function normalizeShareUrl(rawURL: string): string {
  return rawURL
    .trim()
    .replace(/？/g, "?")
    .replace(/＆/g, "&")
    .split(/\s+/)
    .join("");
}
