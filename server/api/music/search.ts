import { buildSearchTsQuery } from "#server/utils/jieba";
import { prisma } from "#server/lib/prisma";

const MAX_PAGE = 100;

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

  const tsQuery = buildSearchTsQuery(term);

  if (!tsQuery) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const [musics, total] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
      FROM "Music"
      WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
      ORDER BY "createdAt" DESC
      LIMIT ${pageSize} OFFSET ${skip}
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
    data: musics.map((m) => ({
      ...m,
      downloads: JSON.parse(m.downloads || "[]"),
    })),
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
  };
});
