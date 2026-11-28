import { Prisma } from "@@/prisma/generated";
import { prisma } from "#server/lib/prisma";
import { buildTokens, cutForSearch } from "#server/utils/jieba";
import type { Pagination } from "#server/utils/admin";

export type MusicColumnSet = "summary" | "full";

/** 列清单为常量 SQL 片段（非用户输入），按调用方需要选择 */
const MUSIC_COLUMNS: Record<MusicColumnSet, string> = {
  summary: `m.id, m.title, m.artist, m.album, m.cover, m.status`,
  full: `m.id, m.title, m.artist, m.album, m.cover, m.lyrics, m."playUrl", m.downloads, m."viewCount", m.status, m."createdAt"`,
};

export interface MusicKeywordSearchParams {
  search: string;
  pagination: Pagination;
  columns: MusicColumnSet;
  /** 不传则不过滤状态 */
  status?: number;
}

/**
 * 音乐关键词搜索：分词后以 OR 拼成宽泛的 to_tsquery 文本，按 ts_rank_cd 排序。
 * search 需由调用方 trim；分词为空时直接返回空集。
 */
export const searchMusicByKeyword = async (
  params: MusicKeywordSearchParams,
): Promise<{ data: any[]; total: number }> => {
  const { search, pagination, columns, status } = params;
  const { pageSize, skip } = pagination;

  const tokens = cutForSearch(search);
  if (tokens.length === 0) {
    return { data: [], total: 0 };
  }

  // 采用 | 拼接成符合 to_tsquery 语法的宽泛搜索文本
  // （不能用 websearch_to_tsquery：它会静默丢弃括号，导致 OR 语义错乱）
  const formattedWebQuery = tokens.join(" | ");
  const statusCondition =
    status !== undefined ? Prisma.sql`AND status = ${status}` : Prisma.empty;

  const [musics, total] = await Promise.all([
    prisma.$queryRaw<any[]>`
          WITH hit_rows AS (
            SELECT 
              id,
              ts_rank_cd("searchVector", to_tsquery('simple', ${formattedWebQuery})) AS rank
            FROM "Music"
            WHERE "searchVector" @@ to_tsquery('simple', ${formattedWebQuery}) ${statusCondition}
          )
          SELECT ${Prisma.raw(MUSIC_COLUMNS[columns])}
          FROM hit_rows h
          JOIN "Music" m USING(id)
          ORDER BY h.rank DESC, m."createdAt" DESC
          LIMIT ${pageSize} OFFSET ${skip};
        `,
    prisma.$queryRaw<[{ count: number }]>`
          SELECT COUNT(*)::int as count
          FROM "Music"
          WHERE "searchVector" @@ to_tsquery('simple', ${formattedWebQuery}) ${statusCondition}
        `,
  ]);

  return { data: musics, total: total[0]?.count ?? 0 };
};

export interface CreateMusicInput {
  title?: any;
  artist?: any;
  album?: any;
  cover?: any;
  lyrics?: any;
  playUrl?: any;
  downloads?: any;
}

/** 新建音乐，创建记录与全文索引放同一事务，避免出现能查到详情但搜不到的半成品数据。 */
export const createMusic = async (body: CreateMusicInput) => {
  const { title, artist, album, cover, lyrics, playUrl, downloads } =
    body || ({} as CreateMusicInput);

  if (typeof title !== "string" || !title.trim()) {
    throw createError({ statusCode: 400, message: "歌名不能为空" });
  }
  if (typeof artist !== "string" || !artist.trim()) {
    throw createError({ statusCode: 400, message: "歌手不能为空" });
  }
  if (downloads !== undefined && !Array.isArray(downloads)) {
    throw createError({ statusCode: 400, message: "下载列表格式错误" });
  }

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
};
