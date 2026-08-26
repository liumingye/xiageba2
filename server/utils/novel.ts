import { getRandomAccountByType } from "#server/lib/accountCache";

/** 百度网盘 API 基础域名 */
export const BAIDU_BASE = "https://pan.baidu.com";

/** 模拟浏览器的通用 User-Agent */
export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 百度网盘小说 API 通用请求头 */
export const BAIDU_HEADERS = {
  "accept-encoding": "gzip, deflate",
  "User-Agent": CHROME_UA,
} as const;

/**
 * 随机获取一个启用的百度网盘 Cookie。
 * 优先从 PanAccount 多账号池（type=baidu，status=1）随机选取；
 */
export async function getRandomBaiduCookie(): Promise<string> {
  const account = await getRandomAccountByType("baidu");
  if (account && account.cookie) {
    return account.cookie;
  }
  throw createError({
    statusCode: 500,
    message: "未配置百度网盘 Cookie，请先在账号管理中配置",
  });
}

/**
 * 构建查询字符串，自动过滤掉 undefined / null / 空字符串 的参数。
 */
export function buildQuery(params: Record<string, any>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}

/**
 * 清理封面 URL 上可能存在的反引号包裹（如 `http://...`）。
 */
export function cleanCoverImage(url: string | undefined | null): string {
  return String(url || "").replace(/^`|`$/g, "");
}

/**
 * 将百度小说列表项的原始字段映射为统一的对外结构。
 */
export function mapBookItem(b: any) {
  return {
    bookId: String(b.book_id),
    bookName: b.book_name,
    author: b.author,
    coverImage: cleanCoverImage(b.cover_image),
    category: b.category,
    bookStatus: b.book_status,
    cpName: b.cp_name,
    tag: b.tag,
  };
}

/**
 * 发起一次带 Cookie 的百度网盘小说请求。
 * @param path 相对路径，如 `/novel/distribute/list`
 * @param cookie 账号 Cookie
 * @param options 附加 fetch 选项（method / body 等）
 */
export async function fetchBaiduNovel(
  path: string,
  cookie: string,
  options: { method?: string; body?: BodyInit } = {},
) {
  return fetch(`${BAIDU_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Cookie: cookie,
      ...BAIDU_HEADERS,
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(options.body !== undefined ? { body: options.body } : {}),
  });
}

/**
 * 校验百度小说接口响应并抛出统一错误。
 * @param res fetch 响应对象
 * @param message 请求失败时的提示前缀
 * @returns 解析后的 JSON body
 */
export async function parseBaiduNovelResponse(
  res: Response,
  message: string,
): Promise<any> {
  if (!res.ok) {
    throw createError({
      statusCode: 500,
      message: `${message}失败: ${res.status}`,
    });
  }
  const data = await res.json();
  if (data.errno !== 0) {
    throw createError({
      statusCode: 500,
      message: data.show_msg || `${message}失败`,
    });
  }
  return data;
}
