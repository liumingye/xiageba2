import { usePrisma } from "#server/lib/prisma";
import { Pool } from "pg";
import { buildTokens, tokenize } from "#server/utils/jieba";

export default defineEventHandler(async (event) => {
  const prisma = usePrisma();
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
      // 在应用层用 jieba 分词，然后 plainto_tsquery 查询
      const tokens = tokenize(search);

      if (!tokens) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }

      const pool = new Pool({ connectionString: process.env.DATABASE_URL });

      const [musics, total] = await Promise.all([
        pool.query<any[]>(
          `SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
           FROM "Music"
           WHERE "searchVector" @@ plainto_tsquery('simple', $1)
           ORDER BY "createdAt" DESC
           LIMIT $2 OFFSET $3`,
          [tokens, pageSize, skip],
        ),
        pool.query<[{ count: string }]>(
          `SELECT COUNT(*) as count
           FROM "Music"
           WHERE "searchVector" @@ plainto_tsquery('simple', $1)`,
          [tokens],
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

    // 1) 先由 Prisma 创建记录（由 Prisma 生成 cuid(2) id）
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

    // 2) 然后用 jieba 构造 tokens，通过原始 SQL 更新 searchVector
    const searchVectorTokens = buildTokens(title || "", artist || "", album || "");

    if (searchVectorTokens) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(
        `UPDATE "Music" SET "searchVector" = to_tsvector('simple', $1) WHERE id = $2`,
        [searchVectorTokens, music.id],
      );
      await pool.end();
    }

    return music;
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { id, title, artist, album, cover, lyrics, playUrl, downloads } =
      body;

    if (!id) {
      throw createError({ statusCode: 400, message: "缺少音乐ID" });
    }

    // 1) 先由 Prisma 更新普通字段
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

    // 2) 用 jieba 构造 tokens 更新 searchVector
    const searchVectorTokens = buildTokens(title || "", artist || "", album || "");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `UPDATE "Music" SET "searchVector" = to_tsvector('simple', $1) WHERE id = $2`,
      [searchVectorTokens || "", music.id],
    );
    await pool.end();

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
