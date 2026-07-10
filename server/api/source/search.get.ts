import {
  buildSearchTsQuery,
  buildSearchTsQueryExact,
  cutForSearch,
} from "#server/utils/jieba";
import { getStorageType } from "#shared/utils";
import { Pool } from "pg";

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

  // 筛选参数（校验合法性，无效值回退到默认）
  const timeVal = String(query.time || "");
  const panVal = String(query.pan || "");
  const timeFilter = timeVal in TIME_FILTER_MAP ? timeVal as TimeFilter : "any";
  const panFilter = panVal in PAN_HOST_MAP ? panVal as PanFilter : "all";
  const sortOrder =
    query.sort && ["default", "newest", "oldest"].includes(query.sort as string)
      ? (query.sort as SortOrder)
      : "default";
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

  // 精准搜索使用 plainto_tsquery，模糊搜索使用自定义分词
  const tokens = cutForSearch(term);
  const tsQuery = exact
    ? buildSearchTsQueryExact(tokens)
    : buildSearchTsQuery(tokens);

  if (!tsQuery) {
    return { data: [], total: 0, page, pageSize, totalPages: 0, tokens };
  }

  // 构建动态 SQL 条件（全部使用参数化查询，杜绝字符串拼接）
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // 时间筛选
  const days = TIME_FILTER_MAP[timeFilter];
  if (days > 0) {
    conditions.push(
      `s."createdAt" >= NOW() - ($${paramIndex} * INTERVAL '1 day')`,
    );
    params.push(days);
    paramIndex++;
  }

  // 网盘类型筛选（通过 URL hostname 匹配）
  const panHosts = PAN_HOST_MAP[panFilter];
  if (panHosts.length > 0) {
    const likeConditions = panHosts.map((host) => {
      params.push(`http%://${host}/%`);
      return `s.url LIKE $${paramIndex++}`;
    });
    conditions.push(`(${likeConditions.join(" OR ")})`);
  }

  const whereClause =
    conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  // 构建排序条件
  let orderClause = "";
  if (sortOrder === "newest") {
    orderClause = `s."createdAt" DESC`;
  } else if (sortOrder === "oldest") {
    orderClause = `s."createdAt" ASC`;
  } else {
    orderClause = `h.rank DESC, s."createdAt" DESC`;
  }

  // 添加 tsQuery 参数
  params.push(tsQuery);
  const tsQueryParam = `$${paramIndex++}`;

  // 构建完整 SQL
  const dataSql = `
    WITH hit_rows AS (
      SELECT
        id,
        ts_rank_cd("searchVector", query) AS rank
      FROM "Source", to_tsquery('simple', ${tsQueryParam}) AS query
      WHERE "searchVector" @@ query AND "isTemp" = false AND "status" = 1
    )
    SELECT s.id, s.title, s.url, s.menu, s."createdAt"
    FROM hit_rows h
    JOIN "Source" s USING(id)
    WHERE 1=1 ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++};
  `;
  params.push(pageSize, skip);

  const countSql = `
    SELECT COUNT(*) as count
    FROM "Source" s
    WHERE s."searchVector" @@ to_tsquery('simple', ${tsQueryParam})
      AND s."isTemp" = false AND s."status" = 1
      ${whereClause}
  `;
  const countParams = params.slice(0, paramIndex - 3); // 不包含 pageSize 和 skip

  const client = await pool.connect();
  try {
    const [dataResult, countResult] = await Promise.all([
      client.query(dataSql, params),
      client.query(countSql, countParams),
    ]);

    const sources = dataResult.rows;
    const totalCount = Math.min(
      MAX_PAGE * pageSize,
      parseInt(countResult.rows[0]?.count || "0", 10),
    );

    sources.forEach((item) => {
      item.type = item.type || getStorageType(item.url);
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
    client.release();
  }
});
