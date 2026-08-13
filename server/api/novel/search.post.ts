import { getConfigValues } from "#server/lib/configCache";

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

  const cookie = await getBaiduCookie();

  const params = new URLSearchParams({
    scene: "public_novel",
    query,
    clienttype: "1",
  });
  const url = `${BAIDU_BASE}/api/unisearch?${params.toString()}`;

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
      message: `小说搜索请求失败: ${res.status}`,
    });
  }

  const data = await res.json();
  if (data.error_no !== 0) {
    throw createError({
      statusCode: 500,
      message: data.error_msg || "小说搜索请求失败",
    });
  }

  // data.data 是数组，每个元素有 list 字段包含小说列表
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
