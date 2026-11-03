import { listFiles } from "#server/lib/s3";
import { parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  if (event.method !== "GET") {
    throw createError({ statusCode: 405, message: "不支持的请求方法" });
  }

  const query = getQuery(event);
  const configIdStr = query.configId as string;
  if (!configIdStr) {
    throw createError({ statusCode: 400, message: "缺少 configId" });
  }
  const configId = parseInt(configIdStr);
  if (!Number.isFinite(configId) || configId <= 0) {
    throw createError({ statusCode: 400, message: "configId 不合法" });
  }

  const { page, pageSize } = parsePagination(query);
  const search = (query.search as string) || "";

  const result = await listFiles(configId, { search, page, pageSize });
  return result;
});
