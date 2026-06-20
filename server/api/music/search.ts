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

  // 用 plainto_tsquery 替代手工构造 tsquery：
  // - plainto_tsquery 把输入当纯文本，自动按空白/标点分词并用 AND 连接
  // - 彻底避免 chinese_bigram 产生的标点字符（，()& 等）破坏 tsquery 语法
  const [musics, total] = await Promise.all([
    pool.query<any[]>(
      `SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
       FROM "Music"
       WHERE "searchVector" @@ plainto_tsquery('simple', chinese_bigram($1))
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      [term, pageSize, skip],
    ),
    pool.query<[{ count: string }]>(
      `SELECT COUNT(*) as count
       FROM "Music"
       WHERE "searchVector" @@ plainto_tsquery('simple', chinese_bigram($1))`,
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
