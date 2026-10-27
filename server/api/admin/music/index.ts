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

      // 2. 🔥 采用 | 拼接成符合 to_tsquery 语法的宽泛搜索文本
      //    （不能用 websearch_to_tsquery：它会静默丢弃括号，导致 OR 语义错乱）
      const formattedWebQuery = tokens.join(" | ");
      const [musics, total] = await Promise.all([
        prisma.$queryRaw<any[]>`
          WITH hit_rows AS (
            SELECT 
              id,
              ts_rank_cd("searchVector", to_tsquery('simple', ${formattedWebQuery})) AS rank
            FROM "Music"
            WHERE "searchVector" @@ to_tsquery('simple', ${formattedWebQuery})
          )
          SELECT m.id, m.title, m.artist, m.album, m.cover, m.status
          FROM hit_rows h
          JOIN "Music" m USING(id)
          ORDER BY h.rank DESC, m."createdAt" DESC
          LIMIT ${pageSize} OFFSET ${skip};
        `,
        prisma.$queryRaw<[{ count: number }]>`
          SELECT COUNT(*)::int as count
          FROM "Music"
          WHERE "searchVector" @@ to_tsquery('simple', ${formattedWebQuery})
        `,
      ]);

      const totalCount = total[0]?.count ?? 0;

      return {
        data: musics.map((m) => ({
          ...m,
        })),
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    }

    // 无搜索词时的默认查询
    // 1. 先只查 id（轻量，走索引少拉数据）
    const ids = await prisma.music.findMany({
      select: { id: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    });

    // 2. 再通过 where id in (id数组) 查询展示字段
    const idList = ids.map((m) => m.id);
    const [musics, total] = await Promise.all([
      idList.length > 0
        ? prisma.music.findMany({
            where: { id: { in: idList } },
            select: {
              id: true,
              title: true,
              artist: true,
              album: true,
              cover: true,
              status: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : [],
      prisma.music.count(),
    ]);

    return {
      data: musics.map((m) => ({
        ...m,
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

    if (typeof title !== "string" || !title.trim()) {
      throw createError({ statusCode: 400, message: "歌名不能为空" });
    }
    if (typeof artist !== "string" || !artist.trim()) {
      throw createError({ statusCode: 400, message: "歌手不能为空" });
    }
    if (downloads !== undefined && !Array.isArray(downloads)) {
      throw createError({ statusCode: 400, message: "下载列表格式错误" });
    }

    // 创建记录与全文索引放同一事务，避免出现能查到详情但搜不到的半成品数据。
    return await prisma.$transaction(async (tx) => {
      const music = await tx.music.create({
        data: {
          title: title.trim(),
          artist: artist.trim(),
          album: album || "",
          cover: cover || "",
          lyrics: lyrics || "",
          playUrl: playUrl || "",
          downloads: downloads || [],
        },
      });

      const searchVectorTokens = buildTokens(
        music.title || "",
        music.artist || "",
        music.album || "",
      );

      await tx.$executeRaw`UPDATE "Music" SET "searchVector" = to_tsvector('simple', ${searchVectorTokens || ""}) WHERE id = ${music.id}`;

      return music;
    });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { id, title, artist, album, cover, lyrics, playUrl, downloads, status } =
      body;

    if (!id) {
      throw createError({ statusCode: 400, message: "缺少音乐ID" });
    }

    // 部分字段更新：只写入显式传入的字段。
    // 状态开关只会传 { id, status }，若按全量字段更新会把 downloads 等清空。
    const data: any = {};
    const requireText = (field: string, value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw createError({ statusCode: 400, message: `${field}不能为空` });
      }
      return value;
    };

    if (title !== undefined) data.title = requireText("歌名", title);
    if (artist !== undefined) data.artist = requireText("歌手", artist);
    if (album !== undefined) {
      if (typeof album !== "string") {
        throw createError({ statusCode: 400, message: "专辑格式错误" });
      }
      data.album = album;
    }
    if (cover !== undefined) {
      if (typeof cover !== "string") {
        throw createError({ statusCode: 400, message: "封面格式错误" });
      }
      data.cover = cover;
    }
    if (lyrics !== undefined) {
      if (typeof lyrics !== "string") {
        throw createError({ statusCode: 400, message: "歌词格式错误" });
      }
      data.lyrics = lyrics;
    }
    if (playUrl !== undefined) {
      if (typeof playUrl !== "string") {
        throw createError({ statusCode: 400, message: "播放地址格式错误" });
      }
      data.playUrl = playUrl;
    }
    if (downloads !== undefined) {
      if (!Array.isArray(downloads)) {
        throw createError({ statusCode: 400, message: "下载列表格式错误" });
      }
      data.downloads = downloads;
    }
    if (status !== undefined) {
      const parsedStatus = Number(status);
      if (parsedStatus !== 0 && parsedStatus !== 1) {
        throw createError({ statusCode: 400, message: "音乐状态不合法" });
      }
      data.status = parsedStatus;
    }

    if (Object.keys(data).length === 0) {
      throw createError({ statusCode: 400, message: "没有需要更新的字段" });
    }

    // 1) 更新主记录与全文索引必须同一事务，避免一边成功一边失败导致搜索结果与详情不一致。
    const music = await prisma.$transaction(async (tx) => {
      const updated = await tx.music.update({ where: { id }, data });

      if (title !== undefined || artist !== undefined || album !== undefined) {
        const searchVectorTokens = buildTokens(
          updated.title || "",
          updated.artist || "",
          updated.album || "",
        );
        await tx.$executeRaw`UPDATE "Music" SET "searchVector" = to_tsvector('simple', ${searchVectorTokens}) WHERE id = ${updated.id}`;
      }
      return updated;
    });

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
