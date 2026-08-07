import { deleteFile, renameFile } from "#server/lib/s3";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const configIdStr = query.configId as string;
  if (!configIdStr) {
    throw createError({ statusCode: 400, message: "缺少 configId" });
  }
  const configId = parseInt(configIdStr);
  if (!Number.isFinite(configId) || configId <= 0) {
    throw createError({ statusCode: 400, message: "configId 不合法" });
  }

  // key 从路由参数获取，支持多段路径，手动解码还原 encodeURIComponent 编码的字符
  const rawKey = event.context.params?.key;
  if (!rawKey) {
    throw createError({ statusCode: 400, message: "缺少文件 key" });
  }
  const key = decodeURIComponent(rawKey);

  if (event.method === "DELETE") {
    await deleteFile(configId, key);
    return { success: true };
  }

  if (event.method === "PATCH" || event.method === "PUT") {
    const body = await readBody(event);
    const newName = body?.newName?.trim();
    if (!newName) {
      throw createError({ statusCode: 400, message: "新文件名不能为空" });
    }
    const result = await renameFile(configId, key, newName);
    return { success: true, data: result };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
