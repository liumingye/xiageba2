import { Pool } from "pg";
import { prisma } from "#server/lib/prisma";
import { buildSourceSearchTokens } from "#server/utils/source";
import { cutForSearch, buildSearchWebQuery } from "#server/utils/jieba";
import type { Pagination } from "#server/utils/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 15 });

export interface SourceKeywordSearchParams {
  keyword: string;
  cid: number | null;
  pagination: Pagination;
  /** 不传则不过滤状态；传 1 可命中 Source 的部分全文索引 */
  status?: number;
}

export interface SourceListRow {
  id: string;
  cid: number | null;
  title: string;
  url: string;
  description: string;
  menu: string;
  isSelf: boolean;
  status: number;
  createdAt: Date;
}

/** 重建资源的 searchVector 全文索引（分词规则与全量重建共用单点实现） */
const updateSearchVector = async (source: {
  id: string;
  title: string | null;
  description: string | null;
  menu: string | null;
}) => {
  const tokens = buildSourceSearchTokens(source);
  if (tokens) {
    await prisma.$executeRaw`UPDATE "Source" SET "searchVector" = to_tsvector('simple', ${tokens}) WHERE id = ${source.id}`;
  }
};

/**
 * 资源关键词搜索：URL 精准 / 24 位 ID 精准 / 分词全文三路。
 * keyword 需由调用方 trim。
 */
export const searchSourcesByKeyword = async (
  params: SourceKeywordSearchParams,
): Promise<{ data: SourceListRow[]; total: number }> => {
  const { keyword, cid, pagination, status } = params;
  const { pageSize, skip } = pagination;

  let client;
  try {
    client = await pool.connect();

    const isUrl = /^https?:\/\//i.test(keyword);
    // cuid(2) 资源 ID：24 位字母数字，可直接按 ID 精准匹配
    const isId = /^[A-Za-z0-9]{24}$/.test(keyword);
    const baseParams: any[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    if (status !== undefined) {
      conditions.push(`status = $${paramIndex++}`);
      baseParams.push(status);
    }
    if (cid) {
      conditions.push(`cid = $${paramIndex++}`);
      baseParams.push(cid);
    }

    let searchQueryExpression = "";

    if (isUrl) {
      // 精准 URL 匹配
      conditions.push(`url = $${paramIndex++}`);
      baseParams.push(keyword);
    } else if (isId) {
      // 精准 ID 匹配
      conditions.push(`id = $${paramIndex++}`);
      baseParams.push(keyword);
    } else {
      // 分词 + 全文检索逻辑
      const keywordTokens = cutForSearch(keyword);
      const keywordWebQuery =
        keywordTokens.length > 0
          ? buildSearchWebQuery(keywordTokens, false)
          : keyword;

      const queryParamIndex = paramIndex++;
      baseParams.push(keywordWebQuery);

      searchQueryExpression = `to_tsquery('simple', $${queryParamIndex})`;
      conditions.push(`"searchVector" @@ search_query.value`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // URL / ID 均为精准匹配，不需要全文检索
    const isExactMatch = isUrl || isId;

    // 参数克隆与分页索引
    const countParams = [...baseParams];
    const dataParams = [...baseParams, pageSize, skip];
    const limitIndex = baseParams.length + 1;
    const offsetIndex = baseParams.length + 2;

    const dataSql = isExactMatch
      ? `
            SELECT id, cid, title, url, description, menu, "isSelf", status, "createdAt"
            FROM "Source"
            ${whereClause}
            ORDER BY "createdAt" DESC, id ASC
            LIMIT $${limitIndex} OFFSET $${offsetIndex};
          `
      : `
            WITH search_query AS (
              SELECT ${searchQueryExpression} AS value
            )
            SELECT id, cid, title, url, description, menu, "isSelf", status, "createdAt"
            FROM "Source" CROSS JOIN search_query
            ${whereClause}
            ORDER BY ts_rank("searchVector", search_query.value, 1) DESC, "createdAt" DESC, id ASC
            LIMIT $${limitIndex} OFFSET $${offsetIndex};
          `;

    const countSql = isExactMatch
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

    const [dataResult, countResult] = await Promise.all([
      client.query(dataSql, dataParams),
      client.query(countSql, countParams),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count || "0", 10),
    };
  } finally {
    if (client) client.release();
  }
};

export interface CreateSourceInput {
  cid?: any;
  title?: any;
  urls?: any;
  description?: any;
  menu?: any;
  isSelf?: any;
  force?: boolean;
  updateExisting?: boolean;
  skipDuplicates?: boolean;
}

export interface CreateSourceResult {
  success: true;
  inserted: number;
  updated: number;
  duplicate: number;
  failed: number;
}

/**
 * 批量新建资源：按 url 精确匹配去重。
 * 存在重复且未指定 force / updateExisting / skipDuplicates 时抛 409，
 * data.duplicates 携带重复列表供调用方决定处理方式。
 */
export const createSources = async (
  body: CreateSourceInput,
): Promise<CreateSourceResult> => {
  const { cid, title, urls, description, menu, isSelf, force, updateExisting, skipDuplicates } =
    body || ({} as CreateSourceInput);

  if (!title?.trim()) {
    throw createError({ statusCode: 400, message: "资源名称不能为空" });
  }

  // urls 地址数组（批量添加，自动去重）
  const rawList: string[] = Array.isArray(urls)
    ? urls.map((u: unknown) => String(u ?? "").trim())
    : [];
  const urlList = [...new Set(rawList.filter(Boolean))];

  if (urlList.length === 0) {
    throw createError({ statusCode: 400, message: "资源地址不能为空" });
  }

  const baseData = {
    cid: Number(cid) || null,
    title: title.trim(),
    description: description || "",
    menu: menu || "",
    isSelf: isSelf || false,
  };

  // 先整体检测重复，有重复且未选择处理方式时返回 409，由前端弹窗选择
  const existingList = await prisma.source.findMany({
    where: { url: { in: urlList } },
    select: { id: true, title: true, url: true },
  });
  const existingMap = new Map(existingList.map((item) => [item.url, item]));

  // skipDuplicates：跳过重复地址，仅添加不重复的
  if (
    existingList.length > 0 &&
    !force &&
    !updateExisting &&
    !skipDuplicates
  ) {
    throw createError({
      statusCode: 409,
      message: `${existingList.length} 个资源地址已存在`,
      data: { duplicates: existingList },
    });
  }

  const result: CreateSourceResult = {
    success: true,
    inserted: 0,
    updated: 0,
    duplicate: 0,
    failed: 0,
  };

  for (const itemUrl of urlList) {
    try {
      const existing = existingMap.get(itemUrl);

      if (existing) {
        if (updateExisting) {
          const source = await prisma.source.update({
            where: { id: existing.id },
            data: baseData,
          });
          await updateSearchVector(source);
          result.updated++;
        } else if (force) {
          // 强制添加：即使地址重复也插入新记录
          const source = await prisma.source.create({
            data: { ...baseData, url: itemUrl },
          });
          await updateSearchVector(source);
          result.inserted++;
        } else {
          result.duplicate++;
        }
        continue;
      }

      const source = await prisma.source.create({
        data: { ...baseData, url: itemUrl },
      });
      await updateSearchVector(source);
      result.inserted++;
    } catch {
      result.failed++;
    }
  }

  return result;
};
