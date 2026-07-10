const WHITELIST = [
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
];

function isHostAllowed(host: string, allowed: string[]): boolean {
  const lowerHost = host.toLowerCase();
  for (const pattern of allowed) {
    if (pattern === lowerHost) return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      if (lowerHost.endsWith(suffix)) return true;
    }
  }
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
    parsedUrl = new URL(targetUrl);
  } catch {
    throw createError({ statusCode: 400, message: "无效的 url 参数" });
  }

  const allowedHosts = WHITELIST;

  if (allowedHosts.length > 0 && !isHostAllowed(parsedUrl.host, allowedHosts)) {
    throw createError({
      statusCode: 403,
      message: `该图片域名不在白名单中: ${parsedUrl.host}`,
    });
  }

  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  if (referer) {
    headers.Referer = referer;
  }

  try {
    const res = await fetch(targetUrl, { headers });

    // 验证最后响应的域名是否在白名单中，防止重定向攻击
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(res.url);
    } catch {
      throw createError({ statusCode: 400, message: "无效的 url 参数" });
    }
    if (
      allowedHosts.length > 0 &&
      !isHostAllowed(parsedUrl.host, allowedHosts)
    ) {
      throw createError({
        statusCode: 403,
        message: `该图片域名不在白名单中: ${parsedUrl.host}`,
      });
    }

    const contentType =
      res.headers.get("Content-Type") || "application/octet-stream";
    setResponseHeader(event, "Content-Type", contentType);
    setResponseHeader(event, "Cache-Control", "public, max-age=86400");

    setResponseStatus(event, res.status);
    return res.body;
  } catch (error) {
    if (error instanceof Error) {
      throw createError({ statusCode: 502, message: error.message });
    }
    throw createError({ statusCode: 502, message: "图片代理请求失败" });
  }
});
