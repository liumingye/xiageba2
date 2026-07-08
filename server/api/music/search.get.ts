import { buildSearchTsQuery, cutForSearch } from "#server/utils/jieba";
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
  const tsQuery = buildSearchTsQuery(tokens);

  if (!tsQuery) {
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0, tokens };
  }

  const [musics, total] = await Promise.all([
    prisma.$queryRaw<any[]>`
      WITH hit_rows AS (
        SELECT 
          id,
          ts_rank_cd("searchVector", query) AS rank
        FROM "Music", to_tsquery('simple', ${tsQuery}) AS query
        WHERE "searchVector" @@ query
      )
      SELECT m.id, m.title, m.artist, m.album, m.cover
      FROM hit_rows h
      JOIN "Music" m USING(id)
      ORDER BY h.rank DESC, m."viewCount" DESC, m."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${skip};
    `,
    prisma.$queryRaw<[{ count: string }]>`
      SELECT COUNT(*) as count
      FROM "Music"
      WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
    `,
  ]);

  const totalCount = Math.min(
    MAX_PAGE * pageSize,
    parseInt(total[0]?.count || "0", 10),
  );

  return {
    data: musics,
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
    tokens,
  };
});
