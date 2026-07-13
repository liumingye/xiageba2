import { cutForSearch } from "#server/utils/jieba";
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

  // 1. 利用结巴分词获取干净的 tokens 数组
  const tokens = cutForSearch(term);
  if (tokens.length === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0, tokens };
  }

  // 2. 🔥 核心优化：根据 exact 模式动态拼接符合 websearch_to_tsquery 语法的字符串
  // 模糊查询 (OR)： 用大写的 " OR " 连接 -> "周杰伦 OR 1"
  // 精准查询 (AND)：用纯空格 " " 连接 -> "周杰伦 1"
  const formattedWebQuery = exact ? tokens.join(" ") : tokens.join(" OR ");

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
  conditions.push(
    `"searchVector" @@ websearch_to_tsquery('simple', $${queryParamIndex})`,
  );
  baseParams.push(formattedWebQuery);

  // 组装统一的 WHERE 语句
  const whereClause = `WHERE "isTemp" = false AND "status" = 1 AND ${conditions.join(" AND ")}`;

  // 4. 复制克隆一份 Count 参数，避免被后面的分页参数污染
  const countParams = [...baseParams];

  // 5. 构建 Data 参数
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
    // 🔥 核心变更：计算权重等级评分函数也同步换成 websearch_to_tsquery
    orderClause = `ts_rank_cd("searchVector", websearch_to_tsquery('simple', $${queryParamIndex})) DESC, "createdAt" DESC`;
  }

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
