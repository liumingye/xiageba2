import { Pool } from "pg";

const MAX_PAGE = 100;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const term = (query.q as string)?.trim() || "";
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(query.page as string) || 1));
  const pageSize = Math.min(
    20,
    Math.max(1, parseInt(query.pageSize as string) || 20),
  );
  const skip = (page - 1) * pageSize;

  if (!term) {
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0 };
  }

  // 直接用 pg Pool 查询，绕过 Prisma 参数绑定限制
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // chinese_bigram() + unnest + string_agg 在 SQL 中构造 tsquery：
  // 'lij' → chinese_bigram('lij') → 'l i j li ij' → string_agg → 'l & i & j & li & ij'
  const tsqueryExpr = `(SELECT string_agg(token, ' & ') FROM unnest(string_to_array(chinese_bigram($1), ' ')) AS token)`;

  const [musics, total] = await Promise.all([
    pool.query<any[]>(
      `SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
       FROM "Music"
       WHERE "searchVector" @@ to_tsquery('simple', ${tsqueryExpr})
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [term, pageSize, skip],
    ),
    pool.query<[{ count: string }]>(
      `SELECT COUNT(*) as count
       FROM "Music"
       WHERE "searchVector" @@ to_tsquery('simple', ${tsqueryExpr})`,
      [term],
    ),
  ]);

  await pool.end();

  const totalCount = Math.min(MAX_PAGE * pageSize, parseInt(total.rows[0]?.count || "0", 10));

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
