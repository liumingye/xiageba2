import {
  buildSearchWebQuery,
  cutForSearch,
  prioritizeSearchTokens,
} from "#server/utils/jieba";
import { getStorageType } from "#shared/utils";
import type { PanFilter } from "#shared/utils";
import { truncateString } from "#server/utils/source";
import { TREE_MAX_LINE } from "#server/lib/const";
import {
  getResourceFileExtensions,
  normalizeResourceFileTypes,
} from "#shared/resource-file-types";
import { automaton_websearch_filter_keywords } from "#server/lib/simpleAC";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import { Prisma } from "@@/prisma/generated";
import { prisma } from "#server/lib/prisma";

const MAX_PAGE = 100;
const MAX_KEYWORD_LENGTH = 30;

export type TimeFilter = "any" | "day" | "week" | "month" | "year";
export type SortOrder = "default" | "newest" | "oldest";

const TIME_FILTER_MAP: Record<TimeFilter, number> = {
  any: 0,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export const PAN_HOST_MAP: Partial<Record<PanFilter, string[]>> = {
  all: [],
  quark: ["pan.quark.cn"],
  baidu: ["pan.baidu.com"],
  xunlei: ["pan.xunlei.com"],
  uc: ["fast.uc.cn", "drive.uc.cn"],
  ali: ["www.alipan.com", "www.aliyundrive.com"],
};

export default defineCachedEventHandler(
  async (event) => {
    const query = getQuery(event);
    const term = (query.q as string)?.trim() || "";
    const page = Math.min(
      MAX_PAGE,
      Math.max(1, parseInt(query.page as string) || 1),
    );
    const pageSize = Math.min(
      10,
      Math.max(1, parseInt(query.pageSize as string) || 10),
    );
    const skip = (page - 1) * pageSize;

    const timeVal = String(query.time || "");
    const panFilter = (query.pan || "all") as PanFilter;

    if (!(panFilter in PAN_HOST_MAP)) {
      return {
        data: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        tokens: [],
      };
    }

    const timeFilter =
      timeVal in TIME_FILTER_MAP ? (timeVal as TimeFilter) : "any";
    const sortOrder =
      query.sort &&
      ["default", "newest", "oldest"].includes(query.sort as string)
        ? (query.sort as SortOrder)
        : "default";
    const exact = query.exact === "true";
    const fileTypes = normalizeResourceFileTypes(query.type);

    if (!term) {
      return {
        data: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        tokens: [],
      };
    }

    if (term.length > MAX_KEYWORD_LENGTH) {
      throw createError({
        statusCode: 400,
        statusMessage: "关键词过长",
        message: `搜索关键词最多 ${MAX_KEYWORD_LENGTH} 个字符`,
      });
    }

    if (term.length < 2) {
      throw createError({
        statusCode: 400,
        statusMessage: "关键词过短",
        message: "搜索关键词最少 2 个字符",
      });
    }

    // 关键词屏蔽：命中黑名单则拒绝搜索
    if (
      automaton_websearch_filter_keywords &&
      automaton_websearch_filter_keywords.hasFullMatch(term.toLowerCase())
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "关键词被禁止",
        message: "该搜索关键词已被禁止",
      });
    }

    // 1. 利用结巴分词获取干净的 tokens 数组
    const keywordTokens = prioritizeSearchTokens(cutForSearch(term));

    if (keywordTokens.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        tokens: keywordTokens,
      };
    }

    // 模糊搜索使用“核心词 AND 其他词任选其一”，避免宽泛 OR 查询全表评分。
    const keywordWebQuery = buildSearchWebQuery(keywordTokens, exact);
    const extensionTokens = getResourceFileExtensions(fileTypes);
    const tokens = [...keywordTokens, ...extensionTokens];

    // 3. 构建动态 WHERE 条件（Prisma.sql 片段，参数自动安全转义）
    const whereFragments: Prisma.Sql[] = [Prisma.sql`"status" = 1`];

    // 时间筛选
    const days = TIME_FILTER_MAP[timeFilter];
    if (days > 0) {
      whereFragments.push(
        Prisma.sql`"createdAt" >= NOW() - (${days} * INTERVAL '1 day')`,
      );
    }

    // 网盘类型筛选（多个 host 用 OR 展开，避免数组参数被模板展开成 IN 列表）
    const panHosts = PAN_HOST_MAP[panFilter];
    if (panHosts && panHosts.length > 0) {
      const hostMatches = panHosts.map(
        (host) =>
          Prisma.sql`split_part(split_part(url, '//'::text, 2), '/'::text, 1) = ${host}`,
      );
      whereFragments.push(Prisma.sql`(${Prisma.join(hostMatches, " OR ")})`);
    }

    // 关键词与扩展名分别构造 tsquery，避免 websearch 括号改变 OR 优先级。
    const keywordTsQuery = Prisma.sql`websearch_to_tsquery('simple', ${keywordWebQuery})`;
    const searchQueryExpression: Prisma.Sql =
      extensionTokens.length > 0
        ? Prisma.sql`(${keywordTsQuery} && to_tsquery('simple', ${extensionTokens
            .map((extension) => extension.slice(1))
            .join(" | ")}))`
        : keywordTsQuery;
    whereFragments.push(Prisma.sql`"searchVector" @@ search_query.value`);

    // 4. 动态排序（所有动态值均参数化）
    // ⚠️ 排序列使用无表前缀的裸列名：在 ranked 子查询中自动解析到 candidates
    //    的列，在最终 SELECT 中解析到 JOIN 回表的 "Source" 列（ranked 只暴露
    //    rid，故 id 无歧义）。同一 orderClause 片段两处复用。
    let orderClause: Prisma.Sql;
    if (sortOrder === "newest") {
      orderClause = Prisma.sql`"createdAt" DESC`;
    } else if (sortOrder === "oldest") {
      orderClause = Prisma.sql`"createdAt" ASC`;
    } else {
      const normalizedTerm = term.toLocaleLowerCase();
      const titleTokenScores = tokens.map(
        (token) =>
          Prisma.sql`CASE WHEN strpos(lower(title), ${token.toLocaleLowerCase()}) > 0 THEN ${Array.from(token).length} ELSE 0 END`,
      );
      orderClause = Prisma.sql`
        CASE
          WHEN lower(btrim(title)) = ${normalizedTerm} THEN 3
          WHEN strpos(lower(title), ${normalizedTerm}) = 1 THEN 2
          WHEN strpos(lower(title), ${normalizedTerm}) > 0 THEN 1
          ELSE 0
        END DESC,
        (${Prisma.join(titleTokenScores, " + ")}) DESC,
        ts_rank("searchVector", search_query.value, 1) DESC,
        "isSelf" DESC
      `;
    }

    // 5. 组装 SQL（Prisma.sql 嵌套片段，占位符由 Prisma 自动编号）
    // ⚡ 三段式粗筛，避免对全部匹配行计算重量级的 ts_rank / detoast 宽列：
    //    步骤 1 candidates：只取排序与筛选所需列（不含 TOAST 宽列 menu），
    //                       按 createdAt 快速截断到最多 MAX_PAGE*pageSize
    //                       （2000）条候选。高命中词（如 mp3）命中上万行，
    //                       全量排序前抓取 menu 实测 8.9s；
    //    步骤 2 ranked：仅对这 2000 条候选计算 ts_rank 排序键并分页；
    //    步骤 3 最终 SELECT：只对 LIMIT 后的 pageSize 行回表抓取 menu/url。
    //    ⚠️ 注意：candidates 直接带排序列，避免先取 id 再 JOIN 回表导致的
    //    2000 次主键随机读（冷缓存下实测多耗 ~6s）。
    //    注意：候选集按最新时间截断，更深页的相关性排序以候选集为界（总数上限
    //    同样是 MAX_PAGE*pageSize，语义一致）。
    const candidateCap = MAX_PAGE * pageSize;
    // 候选粗排用廉价列序（利用 Source_createdAt_idx 快速截断，避免全量 bitmap 扫描）
    const candidateOrderClause =
      sortOrder === "oldest"
        ? Prisma.sql`"createdAt" ASC`
        : Prisma.sql`"createdAt" DESC`;

    const dataSql = Prisma.sql`
      WITH search_query AS (
        SELECT ${searchQueryExpression} AS value
      ),
      candidates AS (
        SELECT id, "createdAt"
        FROM "Source"
        CROSS JOIN search_query
        WHERE ${Prisma.join(whereFragments, " AND ")}
        LIMIT ${candidateCap}
      ),
      ranked AS (
        SELECT c.id AS rid
        FROM candidates c
        CROSS JOIN search_query
        ORDER BY ${candidateOrderClause}
        LIMIT ${pageSize} OFFSET ${skip}
      )
      SELECT s.id, s.title, s.url, s.menu, s."isSelf", s."createdAt"
      FROM ranked
      JOIN "Source" s ON s.id = ranked.rid
      CROSS JOIN search_query
      ORDER BY ${orderClause}
    `;

    const countSql = Prisma.sql`
      WITH search_query AS (
        SELECT ${searchQueryExpression} AS value
      ), limited_matches AS (
        SELECT 1
        FROM "Source" CROSS JOIN search_query
        WHERE ${Prisma.join(whereFragments, " AND ")}
        LIMIT ${MAX_PAGE * pageSize}
      )
      SELECT COUNT(*)::int AS count
      FROM limited_matches
    `;

    // 📦 总数缓存到 Redis：相同关键词+筛选条件在 TTL 内直接复用 COUNT 结果
    const totalCacheKey = [
      "sourceSearchTotal",
      term,
      timeFilter,
      panFilter,
      exact ? "exact" : "fuzzy",
      fileTypes.length > 0 ? fileTypes.join(",") : "all",
    ].join(":");
    const cachedTotal = await getRedisCache<number>(totalCacheKey);

    let sources: any[];
    let totalCount: number;
    if (cachedTotal !== null) {
      sources = await prisma.$queryRaw<any[]>(dataSql);
      totalCount = cachedTotal;
    } else {
      const [rows, countRows] = await Promise.all([
        prisma.$queryRaw<any[]>(dataSql),
        prisma.$queryRaw<[{ count: number }]>(countSql),
      ]);
      sources = rows;
      totalCount = countRows[0]?.count || 0;
      // 缓存计数结果
      await setRedisCache(totalCacheKey, totalCount, 10 * 60);
    }

    sources.forEach((item) => {
      item.type = item.type || getStorageType(item.url);
      item.menu = truncateString(item.menu || "", TREE_MAX_LINE);
      delete item.url;
    });

    return {
      data: sources,
      total: totalCount,
      page,
      pageSize,
      totalPages: Math.min(MAX_PAGE, Math.ceil(totalCount / pageSize)),
      tokens: tokens.map((v) => v.replace(/"/g, "")).filter(Boolean),
    };
  },
  {
    name: "api-source-search-v1",
    maxAge: 30 * 60,
    staleMaxAge: 120 * 60,
    swr: true,
    getKey: (event) => {
      const query = getQuery(event);
      return [
        query.q,
        query.page,
        query.pageSize,
        query.time,
        query.pan,
        query.sort,
        query.exact,
        Array.isArray(query.type)
          ? [...query.type].map(String).sort().join(",")
          : query.type,
      ]
        .map((value) => encodeURIComponent(String(value ?? "")))
        .join(":");
    },
  },
);
