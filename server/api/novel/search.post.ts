import {
  getRandomBaiduCookie,
  buildQuery,
  mapBookItem,
  fetchBaiduNovel,
  parseJsonSafe,
} from "#server/utils/novel";

/**
 * 小说搜索
 * POST /api/novel/search  body: { query: "关键词" }
 * 对接百度 pan.baidu.com/api/unisearch?scene=public_novel
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const query = (body?.query || "").trim();

  if (!query) {
    throw createError({ statusCode: 400, message: "请输入搜索关键词" });
  }
  if (query.length > 30) {
    throw createError({ statusCode: 400, message: "搜索关键词最多 30 个字符" });
  }

  const cookie = await getRandomBaiduCookie();

  const params = buildQuery({
    scene: "public_novel",
    query,
    clienttype: "1",
  });
  const url = `/api/unisearch?${params}`;

  // 仅在「请求成功但返回空结果」时重试（百度侧索引延迟），
  // 非 2xx 与业务错误码直接抛出，不重试
  const MAX_ATTEMPTS = 5;
  const BASE_BACKOFF_MS = 100;

  let data: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetchBaiduNovel(url, cookie, { method: "POST" });

    if (!res.ok) {
      throw createError({
        statusCode: 500,
        message: `小说搜索请求失败: ${res.status}`,
      });
    }

    data = await parseJsonSafe(res, "小说搜索");
    if (data.error_no !== 0) {
      throw createError({
        statusCode: 500,
        message: data.error_msg || "小说搜索请求失败",
      });
    }

    if (Array.isArray(data.data) && data.data.length > 0) {
      break;
    }

    // 指数退避：100 / 200 / 400 / 800ms。
    // 原实现只在第一次重试前 sleep 100ms，后续 4 次无间隔连打，
    // 既打不中索引延迟的窗口，又容易撞上游风控。
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, BASE_BACKOFF_MS * 2 ** attempt),
      );
    }
  }

  const books = (data.data || []).flatMap((group: any) =>
    (group.list || []).map((b: any) => mapBookItem(b)),
  );

  return {
    books,
    isEnd: data.is_end === true,
  };
});
