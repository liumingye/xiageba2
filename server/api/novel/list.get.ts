import {
  getRandomBaiduCookie,
  buildQuery,
  mapBookItem,
  fetchBaiduNovel,
  parseBaiduNovelResponse,
} from "#server/utils/novel";

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

    const res = await fetchBaiduNovel(
      `/novel/distribute/list?${buildQuery(params)}`,
      cookie,
    );

    const body = await parseBaiduNovelResponse(res, "小说列表请求");

    const books = body.data?.books || [];
    const hasMore = body.data?.has_more === 1;

    return {
      books: books.map((b: any) => mapBookItem(b)),
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
