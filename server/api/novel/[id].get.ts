import {
  getRandomBaiduCookie,
  buildQuery,
  cleanCoverImage,
  fetchBaiduNovel,
  parseBaiduNovelResponse,
} from "#server/utils/novel";

/**
 * 小说详情
 * GET /api/novel/:id
 * 对接 /novel/distribute/detail?book_id=xxx
 * 缓存策略：defineCachedEventHandler，1 小时新鲜、6 小时总有效（SWR）
 */
export default defineCachedEventHandler(
  async (event) => {
    const rawId = event.context.params?.id;
    const bookId = decodeURIComponent(String(rawId || ""));
    if (!bookId) {
      throw createError({ statusCode: 400, message: "缺少 book_id" });
    }

    const cookie = await getRandomBaiduCookie();

    const params = buildQuery({
      clienttype: "0",
      app_id: "250528",
      web: "1",
      book_id: String(bookId),
    });
    const res = await fetchBaiduNovel(
      `/novel/distribute/detail?${params}`,
      cookie,
    );

    const body = await parseBaiduNovelResponse(res, "小说详情请求");

    if (!body.data) {
      throw createError({
        statusCode: 404,
        message: "小说不存在",
      });
    }

    const d: any = body.data || {};

    return {
      bookId: String(d.book_id),
      bookName: d.book_name,
      author: d.author,
      coverImage: cleanCoverImage(d.cover_image),
      bookScore: d.book_score ? Number(d.book_score) : 0,
      bookStatus: d.book_status,
      category: d.category,
      shortCategory: d.short_category,
      chapterCount: Number(d.chapter_count || 0),
      wordCount: Number(d.word_count || 0),
      description: d.description || "",
      tag: d.tag,
    };
  },
  {
    name: "api-novel-detail-v1",
    maxAge: 60 * 60,
    staleMaxAge: 360 * 60,
    swr: true,
    getKey: (event) => {
      const rawId = event.context.params?.id || "";
      return encodeURIComponent(String(rawId));
    },
  },
);
