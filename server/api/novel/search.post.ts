import {
  getRandomBaiduCookie,
  buildQuery,
  mapBookItem,
  fetchBaiduNovel,
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

  let data: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetchBaiduNovel(url, cookie, { method: "POST" });

    if (!res.ok) {
      throw createError({
        statusCode: 500,
        message: `小说搜索请求失败: ${res.status}`,
      });
    }

    data = await res.json();
    if (data.error_no !== 0) {
      throw createError({
        statusCode: 500,
        message: data.error_msg || "小说搜索请求失败",
      });
    }

    if (Array.isArray(data.data) && data.data.length > 0) {
      break;
    }

    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
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
