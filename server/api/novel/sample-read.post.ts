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

/**
 * 小说试读
 * POST /api/novel/sample-read  body: { book_id }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const bookId = body?.book_id;
  if (!bookId) {
    throw createError({ statusCode: 400, message: "缺少 book_id" });
  }

  const cookie = await getBaiduCookie();

  const url =
    "https://pan.baidu.com/novel/distribute/sampleread?clienttype=0&app_id=250528&web=1";

  const form = new URLSearchParams();
  form.set("book_id", String(bookId));
  form.set("clienttype", "1");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    throw createError({
      statusCode: 500,
      message: `试读请求失败: ${res.status}`,
    });
  }

  const data = await res.json();
  if (data.errno !== 0) {
    throw createError({
      statusCode: 500,
      message: data.show_msg || "试读请求失败",
    });
  }

  return {
    bookId: String(data.data?.book_id),
    bookType: data.data?.book_type,
    chapters: (data.data?.chapters || []).map((c: any) => ({
      chapterId: c.chapter_id,
      chapterIndex: c.chapter_index,
      chapterTitle: c.chapter_title,
      content: c.content,
    })),
  };
});
