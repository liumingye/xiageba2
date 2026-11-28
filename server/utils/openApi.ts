import { parsePagination } from "#server/utils/admin";

/**
 * 解析开放 API 搜索参数：q 必填且不超过 maxKeywordLength，
 * pageSize 落在 [1, 50]（响应含歌词/目录等宽列，不放开到后台的 100）。
 */
export const parseOpenSearchQuery = (
  query: Record<string, unknown>,
  maxKeywordLength: number,
) => {
  const q = String(query.q ?? "").trim();
  if (!q) {
    throw createError({ statusCode: 400, message: "缺少搜索关键词 q" });
  }
  if (q.length > maxKeywordLength) {
    throw createError({
      statusCode: 400,
      message: `搜索关键词最多 ${maxKeywordLength} 个字符`,
    });
  }

  return {
    q,
    pagination: parsePagination(query, { defaultPageSize: 20, maxPageSize: 50 }),
    cid: Number(query.cid) || null,
  };
};
