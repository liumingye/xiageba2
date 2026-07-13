import { prisma } from "#server/lib/prisma";
import { buildTokens, cutForSearch } from "#server/utils/jieba";

export default defineEventHandler(async (event) => {
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
      // 1. 采用结巴分词获取 tokens 数组
      const tokens = cutForSearch(search);
      if (tokens.length === 0) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }

      // 2. 🔥 核心优化：采用大写 OR 拼接成符合 websearch_to_tsquery 语法的宽泛搜索文本
      const formattedWebQuery = tokens.join(" OR ");

      // 🔥 核心变更：全面平替为 websearch_to_tsquery，安全且完美抗碎
      const [musics, total] = await Promise.all([
        prisma.$queryRaw<any[]>`
          WITH hit_rows AS (
            SELECT 
              id,
              ts_rank_cd("searchVector", websearch_to_tsquery('simple', ${formattedWebQuery})) AS rank
            FROM "Music"
            WHERE "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery})
          )
          SELECT m.id, m.title, m.artist, m.album, m.cover, m.downloads
          FROM hit_rows h
          JOIN "Music" m USING(id)
          ORDER BY h.rank DESC, m."createdAt" DESC
          LIMIT ${pageSize} OFFSET ${skip};
        `,
        prisma.$queryRaw<[{ count: number }]>`
          SELECT COUNT(*)::int as count
          FROM "Music"
          WHERE "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery})
        `,
      ]);

      const totalCount = total[0]?.count ?? 0;

      return {
        data: musics.map((m) => ({
          ...m,
          downloads:
            typeof m.downloads === "string"
              ? JSON.parse(m.downloads || "[]")
              : m.downloads,
        })),
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    }

    // 无搜索词时的默认查询
    const [musics, total] = await Promise.all([
      prisma.music.findMany({
        select: {
          id: true,
          title: true,
          artist: true,
          album: true,
          cover: true,
          downloads: true, // 🛠️ 修复：此前漏了选择该字段，导致下方 JSON.parse 崩溃
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.music.count(),
    ]);

    return {
      data: musics.map((m) => ({
        ...m,
        downloads: JSON.parse((m.downloads as string) || "[]"),
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

    // 1) 由 Prisma 创建记录
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

    // 2) 用 jieba 构造 tokens 并维护 searchVector
    const searchVectorTokens = buildTokens(
      music.title || "",
      music.artist || "",
      music.album || "",
    );

    if (searchVectorTokens) {
      await prisma.$executeRaw`UPDATE "Music" SET "searchVector" = to_tsvector('simple', ${searchVectorTokens}) WHERE id = ${music.id}`;
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

    // 1) 先由 Prisma 更新基础数据
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

    // 2) 更新对应的全文检索向量
    const searchVectorTokens = buildTokens(
      music.title || "",
      music.artist || "",
      music.album || "",
    );
    await prisma.$executeRaw`UPDATE "Music" SET "searchVector" = to_tsvector('simple', ${searchVectorTokens}) WHERE id = ${music.id}`;

    // 清理 ISR 缓存
    const storage = useStorage(`cache:nuxt:payload:`);
    const keys = await storage.getKeys();
    for (const k of keys) {
      if (k.startsWith(`music_${id}`)) {
        await storage.removeItem(k);
      }
    }

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
