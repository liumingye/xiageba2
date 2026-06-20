import { Pool } from "pg";
import { buildSearchTsQuery } from "#server/utils/jieba";

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
  console.log(tsQuery);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const [musics, total] = await Promise.all([
    pool.query<any[]>(
      `SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
       FROM "Music"
       WHERE "searchVector" @@ to_tsquery('simple', $1)
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [tsQuery, pageSize, skip],
    ),
    pool.query<[{ count: string }]>(
      `SELECT COUNT(*) as count
       FROM "Music"
       WHERE "searchVector" @@ to_tsquery('simple', $1)`,
      [tsQuery],
    ),
  ]);

  await pool.end();

  const totalCount = Math.min(
    MAX_PAGE * pageSize,
    parseInt(total.rows[0]?.count || "0", 10),
  );

  return {
    data: musics.rows.map((m) => ({
      ...m,
      downloads: JSON.parse(m.downloads || "[]"),
    })),
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
  };
});
