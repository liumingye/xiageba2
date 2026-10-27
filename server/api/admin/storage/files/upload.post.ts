import { uploadFile } from "#server/lib/s3";

/** 单文件上传体积上限（100MB）。multipart 默认无大小限制，需在应用层拦截 */
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

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

  // readMultipartFormData 会把整个请求体读进内存，必须在读取前先看声明长度。
  // 这里给 multipart 边界预留 1MB，最终仍以 file.data.length 为准。
  const declaredLength = Number(getHeader(event, "content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_SIZE + 1024 * 1024) {
    throw createError({
      statusCode: 413,
      message: `文件体积超过上限（${MAX_UPLOAD_SIZE / 1024 / 1024}MB）`,
    });
  }

  const formData = await readMultipartFormData(event);
  if (!formData) {
    throw createError({ statusCode: 400, message: "未收到文件数据" });
  }

  const file = formData.find((f) => f.name === "file");
  if (!file || !file.data) {
    throw createError({ statusCode: 400, message: "未找到上传文件" });
  }

  if (file.data.length > MAX_UPLOAD_SIZE) {
    throw createError({
      statusCode: 413,
      message: `文件体积超过上限（${MAX_UPLOAD_SIZE / 1024 / 1024}MB）`,
    });
  }

  // 可选自定义路径
  const pathField = formData.find((f) => f.name === "path");
  const customPath = pathField?.data?.toString().trim() || "";

  const originalName = file.filename || "unnamed";
  const key = customPath ? `${customPath.replace(/^\/+|\/+$/g, "")}/${originalName}` : originalName;

  // 上传前检测重复
  const { prisma } = await import("#server/lib/prisma");
  const { getFullKey, getS3Config } = await import("#server/lib/s3");

  const config = await getS3Config(configId);
  const fullKey = getFullKey(config, key);
  const existing = await prisma.storageFile.findFirst({
    where: { configId, path: fullKey, isDeleted: false },
  });

  if (existing) {
    return {
      success: true,
      skipped: true,
      message: `文件 "${existing.name}" 已存在，已跳过`,
      data: {
        id: existing.id,
        key: existing.path,
        name: existing.name,
        size: existing.size,
        mimeType: existing.mimeType,
        lastModified: existing.createdAt.toISOString(),
        url: existing.url,
      },
    };
  }

  const result = await uploadFile(configId, key, file.data, file.type || "application/octet-stream");
  return { success: true, data: result };
});
