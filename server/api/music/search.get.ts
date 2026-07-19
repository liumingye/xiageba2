import { cutForSearch } from "#server/utils/jieba";
import { prisma } from "#server/lib/prisma";

const MAX_PAGE = 100;
const MAX_KEYWORD_LENGTH = 30;

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
  const [musics, totalResult] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT id, title, artist, m.album, m.cover
      FROM "Music" m
      WHERE "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery})
      ORDER BY 
        ts_rank("searchVector", websearch_to_tsquery('simple', ${formattedWebQuery}), 1) DESC, 
        "viewCount" DESC, 
        "createdAt" DESC
      LIMIT ${pageSize} OFFSET ${skip};
    `,
    prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as count
      FROM "Music"
      WHERE "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery})
    `,
  ]);

  const rawCount = totalResult[0]?.count ?? 0;
  const totalCount = Math.min(MAX_PAGE * pageSize, rawCount);

  return {
    data: musics,
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
    // 清理掉分词中可能残留的双引号，防止前端高亮匹配时错乱
    tokens: tokens.map((v) => v.replace(/"/g, "")).filter(Boolean),
  };
});
