import { cutForSearch } from "#server/utils/jieba";
import { prisma } from "#server/lib/prisma";
import { getRedisCache, setRedisCache } from "#server/lib/redis";

const MAX_PAGE = 100;
const MAX_KEYWORD_LENGTH = 30;

export default defineCachedEventHandler(
  async (event) => {
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
  const exact = query.exact === "true";

  if (!term) {
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0, tokens: [] };
  }

  if (term.length > MAX_KEYWORD_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: "关键词过长",
      message: `搜索关键词最多 ${MAX_KEYWORD_LENGTH} 个字符`,
    });
  }

  // 1. 获取结巴分词的 tokens 数组
  const tokens = cutForSearch(term);
  if (tokens.length === 0) {
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0, tokens: [] };
  }

  // 2. 🔥 核心优化：构建符合 websearch_to_tsquery 语法的查询文本
  // exact 模式（AND 精准匹配）：用纯空格连接 -> "周杰伦 1"
  // 非 exact 模式（OR 模糊匹配）：用大写 OR 连接 -> "周杰伦 OR 1"
  const formattedWebQuery = exact ? tokens.join(" ") : tokens.join(" OR ");

  // 使用 Promise.all 并发执行数据查询与总数统计
  // 🔥 将 to_tsquery 替换为 websearch_to_tsquery，参数传递完全保持 Prisma 的参数化安全机制
  const musicsPromise = prisma.$queryRaw<any[]>`
    WITH parsed_query AS (
      SELECT websearch_to_tsquery('simple', ${formattedWebQuery}) AS q
    )
    SELECT 
      m.id, 
      m.title, 
      m.artist, 
      m.album, 
      m.cover,
      m.downloads
    FROM "Music" m, parsed_query pq
    WHERE m."searchVector" @@ pq.q
    ORDER BY 
      ts_rank(m."searchVector", pq.q, 1) DESC, 
      m."viewCount" DESC, 
      m."createdAt" DESC
    LIMIT ${pageSize} OFFSET ${skip};
  `;

  // 📦 总数缓存到 Redis：相同关键词在 TTL 内直接复用 COUNT 结果
  const totalCacheKey = `musicSearchTotal:${exact ? "exact" : "fuzzy"}:${term}`;
  const cachedTotal = await getRedisCache<number>(totalCacheKey);

  let totalCount: number;
  let musics: any[];
  if (cachedTotal !== null) {
    totalCount = cachedTotal;
    musics = await musicsPromise;
  } else {
    const [musicRows, totalResult] = await Promise.all([
      musicsPromise,
      prisma.$queryRaw<[{ count: number }]>`
        SELECT COUNT(*)::int as count
        FROM "Music"
        WHERE "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery})
        LIMIT ${MAX_PAGE * pageSize}
      `,
    ]);
    musics = musicRows;
    const rawCount = totalResult[0]?.count ?? 0;
    totalCount = Math.min(MAX_PAGE * pageSize, rawCount);
    // 缓存计数结果
    await setRedisCache(totalCacheKey, totalCount, 10 * 60);
  }

  const formattedMusics = musics.map((music) => ({
    id: music.id,
    title: music.title,
    artist: music.artist,
    album: music.album,
    cover: music.cover,
    quality: music.downloads?.map((v: { quality: string }) => v.quality) || [],
  }));

  return {
    data: formattedMusics,
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
    // 清理掉分词中可能残留的双引号，防止前端高亮匹配时错乱
    tokens: tokens.map((v) => v.replace(/"/g, "")).filter(Boolean),
  };
  },
  {
    name: "api-music-search-v1",
    maxAge: 30 * 60,
    staleMaxAge: 120 * 60,
    swr: true,
    getKey: (event) => {
      const query = getQuery(event);
      return [
        query.q,
        query.page,
        query.pageSize,
        query.exact,
      ]
        .map((value) => encodeURIComponent(String(value ?? "")))
        .join(":");
    },
  },
);
