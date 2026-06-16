import { PrismaClient } from "@prisma/client";
import { requireAuth } from "~/server/utils/auth";

const prisma = new PrismaClient();

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const method = event.method;

  // GET - 列表查询
  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;
    const search = (query.search as string)?.trim() || "";

    if (search) {
      const chars = [...search];
      const bigrams: string[] = [];
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] !== " ") bigrams.push(chars[i]);
        if (i < chars.length - 1 && chars[i] !== " " && chars[i + 1] !== " ") {
          bigrams.push(chars[i] + chars[i + 1]);
        }
      }
      const tsQuery = bigrams.join(" & ");

      const [musics, total] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
          FROM "Music"
          WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
          ORDER BY "createdAt" DESC
          LIMIT ${pageSize} OFFSET ${skip}
        `,
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) as count
          FROM "Music"
          WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
        `,
      ]);

      const totalCount = Number((total as any)[0]?.count || 0);

      return {
        data: musics.map((m) => ({
          ...m,
          downloads: JSON.parse(m.downloads || "[]"),
        })),
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
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

  // POST - 创建音乐
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

  // PUT - 更新音乐
  if (method === "PUT") {
    const body = await readBody(event);
    const { id, title, artist, album, cover, lyrics, playUrl, downloads } = body;

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

  // DELETE - 删除音乐
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
