import {
  getQuery,
  setResponseHeader,
  setResponseStatus,
  createError,
} from "h3";

const WHITELIST_SET = new Set([
  "img1.doubanio.com",
  "img2.doubanio.com",
  "img3.doubanio.com",
  "img4.doubanio.com",
  "img5.doubanio.com",
  "img6.doubanio.com",
  "img7.doubanio.com",
  "img8.doubanio.com",
  "img9.doubanio.com",
  "pic0.iqiyipic.com",
  "pic1.iqiyipic.com",
  "pic2.iqiyipic.com",
  "pic3.iqiyipic.com",
  "pic4.iqiyipic.com",
  "pic5.iqiyipic.com",
  "pic6.iqiyipic.com",
  "pic7.iqiyipic.com",
  "pic8.iqiyipic.com",
  "pic9.iqiyipic.com",
]);

/**
 * 严格验证 Hostname 是否合法
 */
function isHostnameAllowed(hostname: string): boolean {
  if (!hostname) return false;
  // 转换为小写，且杜绝任何端口号干扰
  const lowerHostname = hostname.toLowerCase().trim();

  // 精准匹配静态白名单
  if (WHITELIST_SET.has(lowerHostname)) return true;

  return false;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const targetUrl = (query.url as string) || "";
  const referer = (query.referer as string) || "";

  if (!targetUrl) {
    throw createError({ statusCode: 400, message: "缺少 url 参数" });
  }

  let parsedUrl: URL;
  try {
    // 使用标准 URL 解析器
    parsedUrl = new URL(targetUrl);
  } catch {
    throw createError({ statusCode: 400, message: "无效的 url 参数" });
  }

  // 🔒 安全提升：严格校验协议，防止用 file:// 或 ftp:// 协议探测服务器本地文件
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      message: "仅支持 http 或 https 协议",
    });
  }

  // 🔒 安全提升：改用 hostname 避免受到 port(端口号) 欺骗或混淆
  if (!isHostnameAllowed(parsedUrl.hostname)) {
    throw createError({
      statusCode: 403,
      message: `该图片域名不在白名单中: ${parsedUrl.hostname}`,
    });
  }

  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  if (referer) {
    // 过滤可能导致 HTTP Header 注入的换行符
    headers.Referer = referer.replace(/[\r\n]/g, "");
  }

  try {
    // 默认 fetch 会自动跟随重定向(redirect: 'follow')
    const res = await fetch(targetUrl, {
      headers,
      // 🔒 性能防御：设定超时，防止慢速链接把服务器挂起
      signal: AbortSignal.timeout(10000),
    });

    // 🔒 再次验证最终落地域名，防止 302 重定向到内网或非法网址
    let finalUrl: URL;
    try {
      finalUrl = new URL(res.url);
    } catch {
      throw createError({ statusCode: 502, message: "响应解析失败" });
    }

    if (!isHostnameAllowed(finalUrl.hostname)) {
      throw createError({
        statusCode: 403,
        message: `重定向后的目标图片域名不在白名单中: ${finalUrl.hostname}`,
      });
    }

    // 🔒 校验响应大小，防止通过超大文件撑爆服务器带宽或内存 (例如限制 20MB)
    const contentLength = parseInt(
      res.headers.get("Content-Length") || "0",
      10,
    );
    if (contentLength > 20 * 1024 * 1024) {
      throw createError({ statusCode: 413, message: "图片体积过大，拒绝代理" });
    }

    const contentType =
      res.headers.get("Content-Type") || "application/octet-stream";

    // 🔒 安全限制：只允许真正的 image 类型通过，防止白名单网站被篡改后用来代理木马脚本文件
    if (
      !contentType.startsWith("image/") &&
      contentType !== "application/octet-stream"
    ) {
      throw createError({ statusCode: 415, message: "不支持的响应媒体类型" });
    }

    setResponseHeader(event, "Content-Type", contentType);
    setResponseHeader(
      event,
      "Cache-Control",
      "public, max-age=86400, must-revalidate",
    );

    setResponseStatus(event, res.status);
    return res.body;
  } catch (error: any) {
    if (error.name === "TimeoutError") {
      throw createError({ statusCode: 504, message: "请求源站图片超时" });
    }
    throw createError({ statusCode: 502, message: "图片代理请求失败" });
  }
});
