import { uploadFile } from "#server/lib/s3";

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

  const formData = await readMultipartFormData(event);
  if (!formData) {
    throw createError({ statusCode: 400, message: "未收到文件数据" });
  }

  const file = formData.find((f) => f.name === "file");
  if (!file || !file.data) {
    throw createError({ statusCode: 400, message: "未找到上传文件" });
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
