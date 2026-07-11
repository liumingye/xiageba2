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

  const timeVal = String(query.time || "");
  const panVal = String(query.pan || "");
  const timeFilter =
    timeVal in TIME_FILTER_MAP ? (timeVal as TimeFilter) : "any";
  const panFilter = panVal in PAN_HOST_MAP ? (panVal as PanFilter) : "all";
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

  const tokens = cutForSearch(term);
  const tsQuery = exact
    ? buildSearchTsQueryExact(tokens)
    : buildSearchTsQuery(tokens);

  if (!tsQuery) {
    return { data: [], total: 0, page, pageSize, totalPages: 0, tokens };
  }

  // 1. 初始化基础参数（通用部分）
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

  // 加入全文检索参数
  conditions.push(`"searchVector" @@ to_tsquery('simple', $${paramIndex++})`);
  baseParams.push(tsQuery);

  // 组装统一的 WHERE 语句
  const whereClause = `WHERE "isTemp" = false AND "status" = 1 AND ${conditions.join(" AND ")}`;

  // 2. 复制克隆一份 Count 参数，避免被后面的分页参数污染（解决原代码的 slice Bug）
  const countParams = [...baseParams];

  // 3. 构建 Data 参数
  const dataParams = [...baseParams];
  dataParams.push(pageSize, skip);
  const limitIndex = paramIndex++;
  const offsetIndex = paramIndex++;

  // 动态排序
  let orderClause = "";
  if (sortOrder === "newest") {
    orderClause = `"createdAt" DESC`;
  } else if (sortOrder === "oldest") {
    orderClause = `"createdAt" ASC`;
  } else {
    orderClause = `ts_rank_cd("searchVector", to_tsquery('simple', $${baseParams.length}), 1) DESC, "createdAt" DESC`;
  }

  // 砍掉多余的 WITH 嵌套，直接单层查询，让 PG 索引发挥最大威力
  const dataSql = `
    SELECT id, title, url, menu, "createdAt"
    FROM "Source"
    ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${limitIndex} OFFSET $${offsetIndex};
  `;

  const countSql = `
    SELECT COUNT(*) as count
    FROM "Source"
    ${whereClause}
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
});
