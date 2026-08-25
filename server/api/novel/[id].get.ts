import { getRandomBaiduCookie } from "#server/utils/novel";

const BAIDU_BASE = "https://pan.baidu.com";

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

    const params = new URLSearchParams({
      clienttype: "0",
      app_id: "250528",
      web: "1",
      book_id: String(bookId),
    });
    const url = `${BAIDU_BASE}/novel/distribute/detail?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        Cookie: cookie,
        "accept-encoding": "gzip, deflate",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw createError({
        statusCode: 500,
        message: `小说详情请求失败: ${res.status}`,
      });
    }

    const body = await res.json();

    if (!body.data) {
      throw createError({
        statusCode: 404,
        message: "小说不存在",
      });
    }

    if (body.errno !== 0) {
      throw createError({
        statusCode: 500,
        message: body.show_msg || "小说详情请求失败",
      });
    }

    const d: any = body.data || {};

    return {
      bookId: String(d.book_id),
      bookName: d.book_name,
      author: d.author,
      coverImage: String(d.cover_image || "").replace(/^`|`$/g, ""),
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
