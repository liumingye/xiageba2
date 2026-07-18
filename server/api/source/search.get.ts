import {
  buildSearchWebQuery,
  cutForSearch,
  prioritizeSearchTokens,
} from "#server/utils/jieba";
import { getStorageType } from "#shared/utils";
import { Pool } from "pg";
import { truncateString } from "#server/utils/source";
import { TREE_MAX_LINE } from "#server/lib/const";

const MAX_PAGE = 100;
const MAX_KEYWORD_LENGTH = 30;

type TimeFilter = "any" | "day" | "week" | "month" | "year";
type PanFilter = "all" | "quark" | "baidu" | "xunlei" | "uc";
type SortOrder = "default" | "newest" | "oldest";

const TIME_FILTER_MAP: Record<TimeFilter, number> = {
  any: 0,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

const PAN_HOST_MAP: Record<PanFilter, string[]> = {
  all: [],
  quark: ["pan.quark.cn"],
  baidu: ["pan.baidu.com"],
  xunlei: ["pan.xunlei.com"],
  uc: ["pan.uc.cn", "drive.uc.cn"],
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

    const timeVal = String(query.time || "");
    const panVal = String(query.pan || "");
    const timeFilter =
      timeVal in TIME_FILTER_MAP ? (timeVal as TimeFilter) : "any";
    const panFilter = panVal in PAN_HOST_MAP ? (panVal as PanFilter) : "all";
    const sortOrder =
      query.sort &&
      ["default", "newest", "oldest"].includes(query.sort as string)
        ? (query.sort as SortOrder)
        : "default";
    const exact = query.exact === "true";

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

    // 1. 利用结巴分词获取干净的 tokens 数组
    const tokens = prioritizeSearchTokens(cutForSearch(term));

    if (tokens.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0, tokens };
    }

    // 模糊搜索使用“核心词 AND 其他词任选其一”，避免宽泛 OR 查询全表评分。
    const formattedWebQuery = buildSearchWebQuery(tokens, exact);

    // 3. 初始化基础参数（通用部分）
    const baseParams: any[] = [];
    let paramIndex = 1;

    const conditions: string[] = [];

    // 时间筛选
    const days = TIME_FILTER_MAP[timeFilter];
    if (days > 0) {
      conditions.push(
        `"createdAt" >= NOW() - ($${paramIndex++} * INTERVAL '1 day')`,
      );
      baseParams.push(days);
    }

    // 网盘类型筛选
    const panHosts = PAN_HOST_MAP[panFilter];
    if (panHosts.length > 0) {
      const likeConditions = panHosts.map((host) => {
        baseParams.push(`http%://${host}/%`);
        return `url LIKE $${paramIndex++}`;
      });
      conditions.push(`(${likeConditions.join(" OR ")})`);
    }

    // 🔥 核心变更：全面换成 websearch_to_tsquery
    const queryParamIndex = paramIndex++;
    conditions.push(`"searchVector" @@ search_query.value`);
    baseParams.push(formattedWebQuery);

    // 组装统一的 WHERE 语句
    const whereClause = `WHERE "isTemp" = false AND "status" = 1 AND ${conditions.join(" AND ")}`;

    // 4. 复制克隆一份 Count 参数，避免被后面的分页参数污染
    const countParams = [...baseParams, MAX_PAGE * pageSize];
    const countLimitIndex = baseParams.length + 1;

    // 5. 构建 Data 参数。排序专用参数不能放进 countParams，否则 pg 会收到多余参数。
    const dataParams = [...baseParams];

    // 动态排序
    let orderClause = "";
    if (sortOrder === "newest") {
      orderClause = `"createdAt" DESC`;
    } else if (sortOrder === "oldest") {
      orderClause = `"createdAt" ASC`;
    } else {
      const normalizedTermIndex = paramIndex++;
      dataParams.push(term.toLocaleLowerCase());

      const titleTokenScore = tokens
        .map((token) => {
          const tokenIndex = paramIndex++;
          dataParams.push(token.toLocaleLowerCase());
          const tokenWeight = Array.from(token).length;
          return `CASE WHEN strpos(lower(title), $${tokenIndex}) > 0 THEN ${tokenWeight} ELSE 0 END`;
        })
        .join(" + ");

      orderClause = `
      CASE
        WHEN lower(btrim(title)) = $${normalizedTermIndex} THEN 3
        WHEN strpos(lower(title), $${normalizedTermIndex}) = 1 THEN 2
        WHEN strpos(lower(title), $${normalizedTermIndex}) > 0 THEN 1
        ELSE 0
      END DESC,
      (${titleTokenScore}) DESC,
      ts_rank(
        "searchVector",
        search_query.value,
        1
      ) DESC,
      "isSelf" DESC,
      "createdAt" DESC,
      id ASC
    `;
    }

    dataParams.push(pageSize, skip);
    const limitIndex = paramIndex++;
    const offsetIndex = paramIndex++;

    const dataSql = `
    WITH search_query AS (
      SELECT websearch_to_tsquery('simple', $${queryParamIndex}) AS value
    )
    SELECT id, title, url, menu, "isSelf", "createdAt"
    FROM "Source" CROSS JOIN search_query
    ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${limitIndex} OFFSET $${offsetIndex};
  `;

    const countSql = `
    WITH search_query AS (
      SELECT websearch_to_tsquery('simple', $${queryParamIndex}) AS value
    ), limited_matches AS (
      SELECT 1
      FROM "Source" CROSS JOIN search_query
      ${whereClause}
      LIMIT $${countLimitIndex}
    )
    SELECT COUNT(*)::int AS count
    FROM limited_matches
  `;

    let client;
    try {
      client = await pool.connect();
      const [dataResult, countResult] = await Promise.all([
        client.query(dataSql, dataParams),
        client.query(countSql, countParams),
      ]);

      const sources = dataResult.rows;
      const totalCount = Math.min(
        MAX_PAGE * pageSize,
        parseInt(countResult.rows[0]?.count || "0", 10),
      );

      sources.forEach((item) => {
        item.type = item.type || getStorageType(item.url);
        item.menu = truncateString(
          item.menu || "",
          TREE_MAX_LINE,
          "\n(文件过多，已截断显示)",
        );
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
    } finally {
      if (client) client.release();
    }
  },
  {
    name: "source-search-v3",
    // maxAge: 30,
    // staleMaxAge: 120,

    maxAge: 0,
    staleMaxAge: 0,
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
      ]
        .map((value) => encodeURIComponent(String(value ?? "")))
        .join(":");
    },
  },
);
