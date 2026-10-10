import { analyzeQuery, type SearchTier } from "#server/utils/jieba";
import { prisma } from "#server/lib/prisma";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { Prisma } from "@@/prisma/generated";

const MAX_PAGE = 100;
const MAX_KEYWORD_LENGTH = 30;

/** tier 阶梯：把「完全匹配」和「兜底召回」彻底分层，越小越严格 */
const buildTierUnion = (tiers: SearchTier[], cap: number): Prisma.Sql =>
  Prisma.join(
    tiers
      .filter((tier) => Boolean(tier.query))
      .map(
        // ⚠️ 每个 UNION ALL 分支必须加括号：PostgreSQL 不允许在 UNION 的左/右分支上
        //    直接挂 ORDER BY / LIMIT，只有括起来才是合法的独立子查询。
        (tier, index) =>
          Prisma.sql`(SELECT m.id, ${index + 1}::int AS tier FROM "Music" m WHERE m."searchVector" @@ to_tsquery('simple', ${tier.query}) LIMIT ${cap})`,
      ),
    " UNION ALL ",
  );

const emptyResult = (pageSize: number) => ({
  data: [],
  total: 0,
  page: 1,
  pageSize,
  totalPages: 0,
  tokens: [],
});

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

    if (!term) return emptyResult(pageSize);

    if (term.length > MAX_KEYWORD_LENGTH) {
      throw createError({
        statusCode: 400,
        statusMessage: "关键词过长",
        message: `搜索关键词最多 ${MAX_KEYWORD_LENGTH} 个字符`,
      });
    }

    // 结巴分词 + 冗余词识别 + 别名扩展 + 召回阶梯
    const plan = analyzeQuery(term, exact);
    if (plan.tokens.length === 0 || plan.tiers.length === 0) {
      return { ...emptyResult(pageSize), page };
    }

    // 最多筛选的候选集上限 (100 * 20 = 2000 条)
    const maxCandidates = MAX_PAGE * pageSize;

    // 完全匹配：标题 / 歌手 / 专辑 归一化后与查询串完全相等
    const normalized = plan.normalized;
    const exactScore = Prisma.sql`
      CASE
        WHEN lower(btrim(COALESCE(m.title, '')))  = ${normalized} THEN 1000
        WHEN lower(btrim(COALESCE(m.artist, ''))) = ${normalized} THEN 900
        WHEN lower(btrim(COALESCE(m.album, '')))  = ${normalized} THEN 850
        ELSE 0
      END`;

    // 连续包含：查询串作为整体出现在字段里（比逐词命中更强）
    const containScore = Prisma.sql`
      CASE
        WHEN strpos(lower(COALESCE(m.title, '')),  ${normalized}) > 0 THEN 400
        WHEN strpos(lower(COALESCE(m.artist, '')), ${normalized}) > 0 THEN 260
        WHEN strpos(lower(COALESCE(m.album, '')),  ${normalized}) > 0 THEN 200
        ELSE 0
      END`;

    // 覆盖度：逐词打分，权重 = 字符数 × 出现次数（重复词权重翻倍）
    const coverageScore =
      plan.groups.length > 0
        ? Prisma.join(
            plan.groups.map((group) => {
              const memberChecks = group.members.map(
                (member) =>
                  Prisma.sql`strpos(s.hay, ${member.toLocaleLowerCase()}) > 0`,
              );
              return Prisma.sql`(CASE WHEN ${Prisma.join(memberChecks, " OR ")} THEN ${group.weight} ELSE 0 END)`;
            }),
            " + ",
          )
        : Prisma.sql`0`;

    // 候选集：把 tier 序号带出来，排序时作为第一优先级。
    // 这样"完全匹配"永远排在"核心匹配"之前，"核心匹配"永远排在"宽松匹配"之前，
    // 不会出现无关结果反超的情况。
    const runSearch = async (tiers: SearchTier[]) => {
      const tierUnion = buildTierUnion(tiers, maxCandidates);

      const dataSql = Prisma.sql`
        WITH rank_query AS (
          SELECT to_tsquery('simple', ${plan.rankQuery}) AS q
        ),
        hits AS (${tierUnion}),
        candidates AS (
          SELECT h.id AS id, MIN(h.tier) AS tier
          FROM hits h
          GROUP BY h.id
          ORDER BY tier ASC, id ASC
          LIMIT ${maxCandidates}
        ),
        scored AS (
          SELECT
            c.id,
            c.tier,
            lower(
              COALESCE(m.title, '') || ' ' ||
              COALESCE(m.artist, '') || ' ' ||
              COALESCE(m.album, '')
            ) AS hay,
            ts_rank(m."searchVector", rq.q, 1) AS trank
          FROM candidates c
          JOIN "Music" m ON m.id = c.id
          CROSS JOIN rank_query rq
        )
        SELECT
          m.id, m.title, m.artist, m.album, m.cover, m.downloads
        FROM scored s
        JOIN "Music" m ON m.id = s.id
        ORDER BY
          s.tier ASC,
          (${exactScore} + ${containScore} + ${coverageScore}) DESC,
          s.trank DESC,
          m."viewCount" DESC,
          m."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `;

      const countSql = Prisma.sql`
        WITH hits AS (${tierUnion})
        SELECT COUNT(*)::int AS count
        FROM (SELECT DISTINCT id FROM hits LIMIT ${maxCandidates}) x
      `;

      return {
        dataSql,
        countSql,
        tiersKey: tiers.map((tier) => tier.name).join("+"),
      };
    };

    let { dataSql, countSql, tiersKey } = await runSearch(plan.tiers);

    // 📦 总数缓存到 Redis：相同关键词在 TTL 内直接复用 COUNT 结果
    const totalCacheKey = `musicSearchTotal:v2:${tiersKey}:${exact ? "exact" : "fuzzy"}:${term}`;
    const cachedTotal = await getRedisCache<number>(totalCacheKey);

    let totalCount: number;
    let musics: any[];

    if (cachedTotal !== null) {
      totalCount = cachedTotal;
      musics = await prisma.$queryRaw<any[]>(dataSql);
    } else {
      const [musicRows, totalResult] = await Promise.all([
        prisma.$queryRaw<any[]>(dataSql),
        prisma.$queryRaw<[{ count: number }]>(countSql),
      ]);
      musics = musicRows;
      totalCount = Math.min(maxCandidates, totalResult[0]?.count ?? 0);
      await setRedisCache(totalCacheKey, totalCount, 10 * 60);
    }

    // 兜底：所有精确层都没命中时，才降级到全 OR 模糊层（tier 最低，排在最后）
    if (musics.length === 0 && !exact && plan.looseQuery) {
      const loose = await runSearch([
        { name: "loose", query: plan.looseQuery },
        ...plan.tiers,
      ]);
      musics = await prisma.$queryRaw<any[]>(loose.dataSql);
      if (musics.length > 0) {
        const looseTotal = await prisma.$queryRaw<[{ count: number }]>(
          loose.countSql,
        );
        totalCount = Math.min(maxCandidates, looseTotal[0]?.count ?? 0);
        tiersKey = loose.tiersKey;
      }
    }

    const formattedMusics = musics.map((music) => ({
      id: music.id,
      title: music.title,
      artist: music.artist,
      album: music.album,
      cover: music.cover,
      quality:
        music.downloads?.map((v: { quality: string }) => v.quality) || [],
    }));

    return {
      data: formattedMusics,
      total: totalCount,
      page,
      pageSize,
      totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
      // 清理掉分词中可能残留的双引号，防止前端高亮匹配时错乱
      tokens: plan.tokens.map((v) => v.replace(/"/g, "")).filter(Boolean),
    };
  },
  {
    name: "api-music-search",
    maxAge: 30 * 60,
    staleMaxAge: 120 * 60,
    swr: true,
    getKey: (event) => {
      const query = getQuery(event);
      return [query.q, query.page, query.pageSize, query.exact]
        .map((value) => encodeURIComponent(String(value ?? "")))
        .join("_");
    },
  },
);
