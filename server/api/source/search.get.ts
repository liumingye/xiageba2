import { buildSearchTsQuery } from "#server/utils/jieba";
import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";

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
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0 };
  }

  if (term.length > MAX_KEYWORD_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: "关键词过长",
      message: `搜索关键词最多 ${MAX_KEYWORD_LENGTH} 个字符`,
    });
  }

  const tsQuery = buildSearchTsQuery(term);

  if (!tsQuery) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const [sources, total] = await Promise.all([
    prisma.$queryRaw<any[]>`
      WITH hit_rows AS (
        SELECT
          id,
          ts_rank_cd("searchVector", query) AS rank
        FROM "Source", to_tsquery('simple', ${tsQuery}) AS query
        WHERE "searchVector" @@ query AND "isTemp" = false AND "status" = 1
      )
      SELECT s.id, s.title, s.url, s.menu, s."createdAt"
      FROM hit_rows h
      JOIN "Source" s USING(id)
      ORDER BY h.rank DESC, s."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${skip};
    `,
    prisma.$queryRaw<[{ count: string }]>`
      SELECT COUNT(*) as count
      FROM "Source"
      WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
        AND "isTemp" = false AND "status" = 1
    `,
  ]);

  const totalCount = Math.min(
    MAX_PAGE * pageSize,
    parseInt(total[0]?.count || "0", 10),
  );

  sources.forEach((item) => {
    item.type = getStorageType(item.url);
    delete item.url;
  });

  return {
    data: sources,
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
  };
});
