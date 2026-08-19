import { Pool } from "pg";
import { prisma } from "#server/lib/prisma";
import { clearTreeSymbols, truncateString } from "#server/utils/source";
import {
  buildTokens,
  cutForSearch,
  prioritizeSearchTokens,
  buildSearchWebQuery,
} from "#server/utils/jieba";
import { TREE_MAX_LINE } from "#server/lib/const";

// 实例化 pg 连接池（保持与 Prisma 数据库连接一致）
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    const cid = Number(query.cid) || null;
    const keyword = (query.keyword as string | undefined)?.trim();

    // 1. 如果带有搜索关键词 keyword
    if (keyword) {
      let client;
      try {
        client = await pool.connect();

        const isUrl = /^https?:\/\//i.test(keyword);
        const baseParams: any[] = [];
        let paramIndex = 1;
        const conditions: string[] = [];

        if (cid) {
          conditions.push(`cid = $${paramIndex++}`);
          baseParams.push(cid);
        }

        let searchQueryExpression = "";

        if (isUrl) {
          // 精准 URL 匹配
          conditions.push(`url = $${paramIndex++}`);
          baseParams.push(keyword);
        } else {
          // 分词 + 全文检索逻辑
          const keywordTokens = prioritizeSearchTokens(cutForSearch(keyword));
          const keywordWebQuery =
            keywordTokens.length > 0
              ? buildSearchWebQuery(keywordTokens, false)
              : keyword;

          const queryParamIndex = paramIndex++;
          baseParams.push(keywordWebQuery);

          searchQueryExpression = `websearch_to_tsquery('simple', $${queryParamIndex})`;
          conditions.push(`"searchVector" @@ search_query.value`);
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;

        // 参数克隆与分页索引
        const countParams = [...baseParams];
        const dataParams = [...baseParams, pageSize, skip];
        const limitIndex = baseParams.length + 1;
        const offsetIndex = baseParams.length + 2;

        const dataSql = isUrl
          ? `
            SELECT id, cid, title, url, description, menu, "isSelf", status, "createdAt", "updatedAt"
            FROM "Source"
            ${whereClause}
            ORDER BY "createdAt" DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex};
          `
          : `
            WITH search_query AS (
              SELECT ${searchQueryExpression} AS value
            )
            SELECT id, cid, title, url, description, menu, "isSelf", status, "createdAt", "updatedAt"
            FROM "Source" CROSS JOIN search_query
            ${whereClause}
            ORDER BY ts_rank("searchVector", search_query.value, 1) DESC, "createdAt" DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex};
          `;

        const countSql = isUrl
          ? `
            SELECT COUNT(*)::int AS count
            FROM "Source"
            ${whereClause};
          `
          : `
            WITH search_query AS (
              SELECT ${searchQueryExpression} AS value
            )
            SELECT COUNT(*)::int AS count
            FROM "Source" CROSS JOIN search_query
            ${whereClause};
          `;

        const [dataResult, countResult, categories] = await Promise.all([
          client.query(dataSql, dataParams),
          client.query(countSql, countParams),
          prisma.category.findMany({ orderBy: { sort: "asc" } }),
        ]);

        const sources = dataResult.rows;
        const total = parseInt(countResult.rows[0]?.count || "0", 10);

        return {
          data: sources,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          categories,
        };
      } finally {
        if (client) client.release();
      }
    }

    // 2. 无关键词时，保留 Prisma 原生普通列表查询
    const where: any = {};
    if (cid) where.cid = cid;

    const [sources, total, categories] = await Promise.all([
      prisma.source.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.source.count({ where }),
      prisma.category.findMany({ orderBy: { sort: "asc" } }),
    ]);

    return {
      data: sources,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      categories,
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const { cid, title, url, description, menu, isSelf } = body;

    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: "资源名称不能为空" });
    }
    if (!url?.trim()) {
      throw createError({ statusCode: 400, message: "资源地址不能为空" });
    }

    const existing = await prisma.source.findFirst({
      where: { url: url.trim() },
      select: { id: true, title: true },
    });
    if (existing) {
      throw createError({
        statusCode: 409,
        message: `资源地址已存在（ID: ${existing.id}，名称: ${existing.title}）`,
      });
    }

    const source = await prisma.source.create({
      data: {
        cid: Number(cid) || null,
        title: title.trim(),
        url: url.trim(),
        description: description || "",
        menu: menu || "",
        isSelf: isSelf || false,
      },
    });

    // jieba 分词后更新 searchVector
    const tokens = buildTokens(
      source.title || "",
      source.description || "",
      truncateString(clearTreeSymbols(source.menu || ""), TREE_MAX_LINE),
    );
    if (tokens) {
      await prisma.$executeRaw`UPDATE "Source" SET "searchVector" = to_tsvector('simple', ${tokens}) WHERE id = ${source.id}`;
    }

    return { success: true, data: source };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});