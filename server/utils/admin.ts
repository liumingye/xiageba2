import {
  getConfigValues,
  setConfigValues,
} from "#server/lib/configCache";

/**
 * 后台接口的横切工具。
 *
 * 收敛三类在 server/api/admin 下逐文件手写的样板：
 * 1. 分页查询参数解析与列表响应信封（原 8 个 index.ts 逐字重复）
 * 2. 批量操作入参校验（原 music/source 两个 batch.post.ts 重复）
 * 3. 「Config 表 KV 配置」读写端点（原 aes/redis/site-seo/web-search-filter 四文件重复）
 *
 * 本模块只依赖 Nitro 自动导入的全局符号（defineEventHandler / readBody /
 * createError），不显式 import h3，与被调用方一样可在 vitest 里用
 * stubGlobal 模拟。
 */

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
}

/**
 * 解析分页参数：page 从 1 起，pageSize 落在 [1, maxPageSize]，
 * 非法值回退默认值。query 值可能是 string | string[]，统一转字符串后解析。
 */
export const parsePagination = (
  query: Record<string, unknown>,
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): Pagination => {
  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;

  const page = Math.max(1, parseInt(String(query.page ?? ""), 10) || 1);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, parseInt(String(query.pageSize ?? ""), 10) || defaultPageSize),
  );

  return { page, pageSize, skip: (page - 1) * pageSize };
};

/** 列表响应信封，与既有前端约定一致 */
export const paginated = <T>(
  data: T[],
  total: number,
  { page, pageSize }: Pagination,
) => ({
  data,
  total,
  page,
  pageSize,
  totalPages: Math.ceil(total / pageSize),
});

/**
 * 批量操作入参校验：非空数组、不超上限、过滤非法 id 并去重。
 * label 用于错误文案，如「音乐」「资源」。
 */
export const parseBatchIds = (
  ids: unknown,
  label: string,
  max = 1000,
): string[] => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, message: `缺少${label}ID列表` });
  }
  if (ids.length > max) {
    throw createError({
      statusCode: 400,
      message: `单次最多操作 ${max} 条`,
    });
  }

  const idList = [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && !!id)),
  ];

  if (idList.length === 0) {
    throw createError({ statusCode: 400, message: `${label}ID列表为空` });
  }

  return idList;
};

export interface ConfigKVHandlerOptions {
  /** 保存成功后的附加动作（清 Nitro 缓存、重建自动机等），失败不阻断已完成的写入 */
  afterSave?: () => Promise<void> | void;
  /** 单键值的序列化方式，默认复刻各文件原逻辑：falsy 统一为空串 */
  normalizeValue?: (value: unknown) => string;
}

/**
 * 生成「Config 表 KV 配置」的 GET/POST handler。
 *
 * GET 返回 { data: Record<key, value> }；POST 只写入 body 中显式出现的键，
 * 未出现的键不修改（与 setConfigValues 的 undefined 语义一致）。
 */
export const createConfigKVHandler = (
  keys: string[],
  options: ConfigKVHandlerOptions = {},
) => {
  const normalizeValue =
    options.normalizeValue ?? ((value: unknown) => (value ? String(value) : ""));

  return defineEventHandler(async (event) => {
    if (event.method === "GET") {
      const result = await getConfigValues(keys);
      return { data: result };
    }

    if (event.method === "POST") {
      const body = await readBody(event);

      const configs: { key: string; value: string }[] = [];
      for (const key of keys) {
        if (body && body[key] !== undefined) {
          configs.push({ key, value: normalizeValue(body[key]) });
        }
      }

      const result = await setConfigValues(configs);

      if (options.afterSave) {
        await options.afterSave();
      }

      return result;
    }

    throw createError({ statusCode: 405, message: "不支持的请求方法" });
  });
};
