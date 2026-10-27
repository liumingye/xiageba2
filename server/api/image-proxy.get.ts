import {
  getQuery,
  setResponseHeader,
  setResponseStatus,
  createError,
} from "h3";

/** 单张图片最大允许字节数 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** 最多跟随的重定向次数 */
const MAX_REDIRECTS = 3;
/** 需要手动校验 Location 后再跟随的状态码 */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

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
  "bgmimg.anibt.net",
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

/**
 * 校验并返回可请求的 URL。
 * 重定向不能再交给 fetch 自动跟随：自动跟随会先向未校验的 Location 发出请求，
 * 再检查最终域名，此时 SSRF 请求已经打到目标上了。
 */
function parseAllowedUrl(raw: string, base?: URL): URL {
  let parsed: URL;
  try {
    parsed = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw createError({ statusCode: 400, message: "无效的 url 参数" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      message: "仅支持 http 或 https 协议",
    });
  }
  if (parsed.username || parsed.password) {
    throw createError({ statusCode: 403, message: "不允许携带 URL 认证信息" });
  }
  if (!isHostnameAllowed(parsed.hostname)) {
    throw createError({
      statusCode: 403,
      message: `该图片域名不在白名单中: ${parsed.hostname}`,
    });
  }
  return parsed;
}

/** 手动跟随重定向，每一跳都先做域名白名单校验 */
async function fetchAllowedImage(
  initialUrl: URL,
  headers: Record<string, string>,
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    if (!REDIRECT_STATUS.has(res.status)) return res;

    const location = res.headers.get("Location");
    // 丢掉重定向响应体，避免连接一直挂着
    await res.body?.cancel();

    if (!location) {
      throw createError({ statusCode: 502, message: "重定向缺少 Location" });
    }
    if (hop === MAX_REDIRECTS) {
      throw createError({ statusCode: 502, message: "重定向次数过多" });
    }

    currentUrl = parseAllowedUrl(location, currentUrl);
  }

  throw createError({ statusCode: 502, message: "重定向次数过多" });
}

/**
 * 按实际流经的字节数限流。
 * Content-Length 可能缺失或造假，不能只依赖响应头。
 */
function limitStreamBytes(
  body: ReadableStream<Uint8Array> | null,
): ReadableStream<Uint8Array> | null {
  if (!body) return null;

  let received = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_IMAGE_BYTES) {
          controller.error(
            createError({ statusCode: 413, message: "图片体积过大，拒绝代理" }),
          );
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const targetUrl = (query.url as string) || "";
  const referer = (query.referer as string) || "";

  if (!targetUrl) {
    throw createError({ statusCode: 400, message: "缺少 url 参数" });
  }

  const parsedUrl = parseAllowedUrl(targetUrl);

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
    const res = await fetchAllowedImage(parsedUrl, headers);

    // 🔒 校验响应大小，防止通过超大文件撑爆服务器带宽或内存 (例如限制 20MB)
    const contentLength = parseInt(
      res.headers.get("Content-Length") || "0",
      10,
    );
    if (contentLength > MAX_IMAGE_BYTES) {
      await res.body?.cancel();
      throw createError({ statusCode: 413, message: "图片体积过大，拒绝代理" });
    }

    const contentType =
      res.headers.get("Content-Type") || "application/octet-stream";

    // 🔒 安全限制：只允许真正的 image 类型通过，防止白名单网站被篡改后用来代理木马脚本文件
    if (
      !contentType.startsWith("image/") &&
      contentType !== "application/octet-stream"
    ) {
      await res.body?.cancel();
      throw createError({ statusCode: 415, message: "不支持的响应媒体类型" });
    }

    setResponseHeader(event, "Content-Type", contentType);
    setResponseHeader(
      event,
      "Cache-Control",
      "public, max-age=86400, must-revalidate",
    );

    setResponseStatus(event, res.status);
    return limitStreamBytes(res.body);
  } catch (error: any) {
    if (error.name === "TimeoutError") {
      throw createError({ statusCode: 504, message: "请求源站图片超时" });
    }
    // 保留前面主动抛出的 400/403/413/415，不要统一吞成 502。
    if (error?.statusCode) throw error;
    throw createError({ statusCode: 502, message: "图片代理请求失败" });
  }
});
