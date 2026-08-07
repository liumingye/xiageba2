import { prisma } from "#server/lib/prisma";
import { clearS3ClientCache } from "#server/lib/s3";

export default defineEventHandler(async (event) => {
  const idStr = event.context.params?.id;
  if (!idStr) {
    throw createError({ statusCode: 400, message: "缺少配置 ID" });
  }
  const id = parseInt(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, message: "配置 ID 不合法" });
  }

  if (event.method === "PUT") {
    const body = await readBody(event);

    if (!body.name?.trim()) {
      throw createError({ statusCode: 400, message: "配置名称不能为空" });
    }
    if (!body.bucket?.trim()) {
      throw createError({ statusCode: 400, message: "存储桶不能为空" });
    }

    const existing = await prisma.s3Config.findUnique({ where: { id } });
    if (!existing || existing.isHidden) {
      throw createError({ statusCode: 404, message: "配置不存在" });
    }

    const data: Record<string, any> = {
      name: body.name.trim(),
      baseUrl: body.baseUrl || "",
      bucket: body.bucket.trim(),
      prefix: body.prefix || "",
      endpoint: body.endpoint || "",
      region: body.region || "",
      accessKey: body.accessKey?.trim() || existing.accessKey,
    };

    // 只有传了非空且非掩码的 secretKey 才更新
    if (body.secretKey && body.secretKey !== "••••••••") {
      data.secretKey = body.secretKey.trim();
    }

    const config = await prisma.s3Config.update({ where: { id }, data });
    clearS3ClientCache(id);

    return {
      success: true,
      data: { ...config, secretKey: "••••••••" },
    };
  }

  if (event.method === "DELETE") {
    const existing = await prisma.s3Config.findUnique({ where: { id } });
    if (!existing || existing.isHidden) {
      throw createError({ statusCode: 404, message: "配置不存在" });
    }

    // 软删除（隐藏）
    await prisma.s3Config.update({
      where: { id },
      data: { isHidden: true },
    });
    clearS3ClientCache(id);

    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
