import {
  buildSearchTsQuery,
  buildSearchTsQueryExact,
  cutForSearch,
} from "#server/utils/jieba";
import { prisma } from "#server/lib/prisma";

const MAX_PAGE = 100;
const MAX_KEYWORD_LENGTH = 30;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const term = (query.q as string)?.trim() || "";
  const page = Math.min(
    MAX_PAGE,
    Math.max(1, parseInt(query.page as string) || 1),
  );
  const pageSize = Math.min(
    20,
    Math.max(1, parseInt(query.pageSize as string) || 20),
  );
  const skip = (page - 1) * pageSize;
  const exact = query.exact === "true";

  if (!term) {
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0, tokens: [] };
  }

  if (term.length > MAX_KEYWORD_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: "关键词过长",
      message: `搜索关键词最多 ${MAX_KEYWORD_LENGTH} 个字符`,
    });
  }

  const tokens = cutForSearch(term);
  const tsQuery = exact
    ? buildSearchTsQueryExact(tokens)
    : buildSearchTsQuery(tokens);

  if (!tsQuery) {
    return {
      data: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 0,
      tokens: [],
    };
  }

  // 使用 Promise.all 并发执行数据查询与总数统计
  // 注意：在 SQL 内部将 count 强转为 ::int，彻底消灭 JS 端的 BigInt 序列化和类型转换报错
  const [musics, totalResult] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT id, title, artist, m.album, m.cover
      FROM "Music" m
      WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
      ORDER BY 
        ts_rank_cd("searchVector", to_tsquery('simple', ${tsQuery}), 1) DESC, 
        "viewCount" DESC, 
        "createdAt" DESC
      LIMIT ${pageSize} OFFSET ${skip};
    `,
    prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as count
      FROM "Music"
      WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
    `,
  ]);

  // 因为 SQL 层已经确保了是 number 类型，这里可以直接安全使用
  const rawCount = totalResult[0]?.count ?? 0;
  const totalCount = Math.min(MAX_PAGE * pageSize, rawCount);

  return {
    data: musics,
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
    // 清理掉分词中可能残留的双引号，防止前端高亮匹配时错乱
    tokens: tokens.map((v) => v.replace(/"/g, "")).filter(Boolean),
  };
});
