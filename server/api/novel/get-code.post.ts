import { getRedisCache, setRedisCache } from "#server/lib/redis";
import {
  getRandomBaiduCookie,
  buildQuery,
  fetchBaiduNovel,
  parseBaiduNovelResponse,
} from "#server/utils/novel";

const CACHE_KEY_PREFIX = "novel:pcode:";
const CACHE_TTL_DAYS = 365;
const CACHE_TTL_SECONDS = CACHE_TTL_DAYS * 24 * 60 * 60; // 2592000

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

  const cookie = await getRandomBaiduCookie();

  const pdata = {
    content_id: String(bookId),
    content_title: contentTitle,
    content_author: contentAuthor,
    is_custom_code: 0,
    content_type: "novel",
  };

  const params = buildQuery({
    clienttype: "0",
    app_id: "250528",
    web: "1",
    mg_type: "201",
    mg_appid: "10010",
    mg_ak: "wap",
    pdata_format: "json",
    pdata: JSON.stringify(pdata),
  });

  const res = await fetchBaiduNovel(
    `/api/mg/pcode/set?${params}`,
    cookie,
    { method: "POST" },
  );

  const data = await parseBaiduNovelResponse(res, "获取口令请求");

  const result = {
    pcode: data.data?.pcode,
    msg: data.data?.msg,
  };

  // 写入 Redis 缓存（Redis 未配置时 setRedisCache 内部安全跳过）
  await setRedisCache(cacheKey, result, CACHE_TTL_SECONDS);

  return result;
});
