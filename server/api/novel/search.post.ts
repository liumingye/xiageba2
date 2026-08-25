import { getRandomBaiduCookie } from "#server/utils/novel";

const BAIDU_BASE = "https://pan.baidu.com";

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

  const params = new URLSearchParams({
    scene: "public_novel",
    query,
    clienttype: "1",
  });
  const url = `${BAIDU_BASE}/api/unisearch?${params.toString()}`;

  const fetchOptions = {
    method: "POST",
    headers: {
      Cookie: cookie,
      "accept-encoding": "gzip, deflate",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  };

  let data: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, fetchOptions);

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
    (group.list || []).map((b: any) => ({
      bookId: String(b.book_id),
      bookName: b.book_name,
      author: b.author,
      coverImage: String(b.cover_image || "").replace(/^`|`$/g, ""),
      category: b.category,
      bookStatus: b.book_status,
      cpName: b.cp_name,
      tag: b.tag,
    })),
  );

  return {
    books,
    isEnd: data.is_end === true,
  };
});
