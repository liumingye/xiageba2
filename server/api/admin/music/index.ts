import { usePrisma } from "#server/lib/prisma";
import { requireAuth } from "#server/utils/auth";
import { Pool } from "pg";

export default defineEventHandler(async (event) => {
  const prisma = usePrisma();
  requireAuth(event);
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize as string) || 20),
    );
    const skip = (page - 1) * pageSize;
    const search = (query.search as string)?.trim() || "";

    if (search) {
      // 直接用 pg Pool 查询，绕过 Prisma 参数绑定限制
      // 与公开搜索 API 保持一致：通过 chinese_bigram() + unnest + string_agg 在 SQL 中构造 tsquery
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const tsqueryExpr = `(SELECT string_agg(token, ' & ') FROM unnest(string_to_array(chinese_bigram($1), ' ')) AS token)`;

      const [musics, total] = await Promise.all([
        pool.query<any[]>(
          `SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
           FROM "Music"
           WHERE "searchVector" @@ to_tsquery('simple', ${tsqueryExpr})
           ORDER BY "createdAt" DESC
           LIMIT $2 OFFSET $3`,
          [search, pageSize, skip],
        ),
        pool.query<[{ count: string }]>(
          `SELECT COUNT(*) as count
           FROM "Music"
           WHERE "searchVector" @@ to_tsquery('simple', ${tsqueryExpr})`,
          [search],
        ),
      ]);

      await pool.end();

      return {
        data: musics.rows.map((m) => ({
          ...m,
          downloads: JSON.parse(m.downloads || "[]"),
        })),
        total: parseInt(total.rows[0]?.count || "0", 10),
        page,
        pageSize,
        totalPages: Math.ceil(parseInt(total.rows[0]?.count || "0", 10) / pageSize),
      };
    }

    const [musics, total] = await Promise.all([
      prisma.music.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.music.count(),
    ]);

    return {
      data: musics.map((m) => ({
        ...m,
        downloads: JSON.parse(m.downloads || "[]"),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const { title, artist, album, cover, lyrics, playUrl, downloads } = body;

    if (!title || !artist) {
      throw createError({ statusCode: 400, message: "歌名和歌手不能为空" });
    }

    const music = await prisma.music.create({
      data: {
        title,
        artist,
        album: album || "",
        cover: cover || "",
        lyrics: lyrics || "",
        playUrl: playUrl || "",
        downloads: JSON.stringify(downloads || []),
      },
    });

    return music;
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { id, title, artist, album, cover, lyrics, playUrl, downloads } =
      body;

    if (!id) {
      throw createError({ statusCode: 400, message: "缺少音乐ID" });
    }

    const music = await prisma.music.update({
      where: { id },
      data: {
        title,
        artist,
        album,
        cover,
        lyrics,
        playUrl,
        downloads: JSON.stringify(downloads || []),
      },
    });

    return music;
  }

  if (method === "DELETE") {
    const body = await readBody(event);
    const { id } = body;

    if (!id) {
      throw createError({ statusCode: 400, message: "缺少音乐ID" });
    }

    await prisma.music.delete({
      where: { id },
    });

    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
