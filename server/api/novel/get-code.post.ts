import { getConfigValues } from "#server/lib/configCache";
import { getRedisCache, setRedisCache } from "#server/lib/redis";

const CACHE_KEY_PREFIX = "novel:pcode:";
const CACHE_TTL_DAYS = 360;
const CACHE_TTL_SECONDS = CACHE_TTL_DAYS * 24 * 60 * 60; // 2592000

async function getBaiduCookie(): Promise<string> {
  const config = await getConfigValues(["baidu_cookie"]);
  const cookie = config.baidu_cookie;
  if (!cookie) {
    throw createError({
      statusCode: 500,
      message: "未配置百度网盘 Cookie，请先在账号管理中配置",
    });
  }
  return cookie;
}

/**
 * 获取小说口令
 * POST /api/novel/get-code  body: { book_id, content_title, content_author }
 * 缓存策略：按 bookId 缓存
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const bookId = body?.book_id;
  const contentTitle = body?.content_title || "";
  const contentAuthor = body?.content_author || "";
  if (!bookId) {
    throw createError({ statusCode: 400, message: "缺少 book_id" });
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${bookId}`;

  // 先查 Redis 缓存
  const cached = await getRedisCache<{ pcode: string; msg: string }>(cacheKey);
  if (cached) {
    return cached;
  }

  const cookie = await getBaiduCookie();

  const pdata = {
    content_id: String(bookId),
    content_title: contentTitle,
    content_author: contentAuthor,
    is_custom_code: 0,
    content_type: "novel",
  };

  const params = new URLSearchParams({
    clienttype: "0",
    app_id: "250528",
    web: "1",
    mg_type: "201",
    mg_appid: "10010",
    mg_ak: "wap",
    pdata_format: "json",
    pdata: JSON.stringify(pdata),
  });

  const url = `https://pan.baidu.com/api/mg/pcode/set?${params.toString()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw createError({
      statusCode: 500,
      message: `获取口令请求失败: ${res.status}`,
    });
  }

  const data = await res.json();
  if (data.errno !== 0) {
    throw createError({
      statusCode: 500,
      message: data.show_msg || "获取口令失败",
    });
  }

  const result = {
    pcode: data.data?.pcode,
    msg: data.data?.msg,
  };

  // 写入 Redis 缓存（Redis 未配置时 setRedisCache 内部安全跳过）
  await setRedisCache(cacheKey, result, CACHE_TTL_SECONDS);

  return result;
});
