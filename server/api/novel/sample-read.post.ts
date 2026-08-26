import {
  getRandomBaiduCookie,
  buildQuery,
  fetchBaiduNovel,
  parseBaiduNovelResponse,
} from "#server/utils/novel";

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

  const cookie = await getRandomBaiduCookie();

  const url =
    `/novel/distribute/sampleread?${buildQuery({
      clienttype: 0,
      app_id: 250528,
      web: 1,
    })}`;

  const form = new URLSearchParams();
  form.set("book_id", String(bookId));
  form.set("clienttype", "1");

  const res = await fetchBaiduNovel(url, cookie, {
    method: "POST",
    body: form.toString(),
  });

  const data = await parseBaiduNovelResponse(res, "试读请求");

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
