import { getRandomBaiduCookie } from "#server/utils/novel";

function buildQuery(params: Record<string, any>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}

const BAIDU_BASE = "https://pan.baidu.com";

/**
 * 小说列表
 * GET /api/novel/list?page=0&limit=20&book_status=-1&category=all
 */
export default defineCachedEventHandler(
  async (event) => {
    const query = getQuery(event);
    const page = Math.max(0, parseInt(query.page as string) || 0);
    const limit = Math.min(50, parseInt(query.limit as string) || 20);
    const bookStatus = query.book_status;
    const category = (query.category as string) || "all";

    const cookie = await getRandomBaiduCookie();

    const params: Record<string, any> = {
      clienttype: 0,
      app_id: 250528,
      web: 1,
      page,
      limit,
    };
    if (bookStatus !== undefined && bookStatus !== "" && bookStatus !== "-1") {
      params.book_status = bookStatus;
    }
    if (category && category !== "all") {
      params.category = category;
    }

    const url = `${BAIDU_BASE}/novel/distribute/list?${buildQuery(params)}`;

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
        message: `小说列表请求失败: ${res.status}`,
      });
    }

    const body = await res.json();
    if (body.errno !== 0) {
      throw createError({
        statusCode: 500,
        message: body.show_msg || "小说列表请求失败",
      });
    }

    const books = body.data?.books || [];
    const hasMore = body.data?.has_more === 1;

    return {
      books: books.map((b: any) => ({
        bookId: String(b.book_id),
        bookName: b.book_name,
        author: b.author,
        // 清理可能存在的反引号包裹（如 `http://...`）
        coverImage: String(b.cover_image || "").replace(/^`|`$/g, ""),
        category: b.category,
        bookStatus: b.book_status,
        cpName: b.cp_name,
        tag: b.tag,
      })),
      hasMore,
    };
  },
  {
    name: "api-novel-list-v1",
    maxAge: 60 * 60,
    staleMaxAge: 360 * 60,
    swr: true,
    getKey: (event) => {
      const query = getQuery(event);
      return [query.page, query.limit, query.book_status, query.category]
        .map((value) => encodeURIComponent(String(value ?? "")))
        .join(":");
    },
  },
);
