import { prisma } from "#server/lib/prisma";
import { clearS3ClientCache } from "#server/lib/s3";

export default defineEventHandler(async (event) => {
  if (event.method === "GET") {
    const configs = await prisma.s3Config.findMany({
      where: { isHidden: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        bucket: true,
        prefix: true,
        endpoint: true,
        region: true,
        accessKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 返回时隐藏 secretKey，仅显示掩码
    return {
      data: configs.map((c) => ({
        ...c,
        secretKey: "••••••••",
      })),
    };
  }

  if (event.method === "POST") {
    const body = await readBody(event);

    if (!body.name?.trim()) {
      throw createError({ statusCode: 400, message: "配置名称不能为空" });
    }
    if (!body.bucket?.trim()) {
      throw createError({ statusCode: 400, message: "存储桶不能为空" });
    }
    if (!body.accessKey?.trim()) {
      throw createError({ statusCode: 400, message: "AccessKey 不能为空" });
    }
    if (!body.secretKey?.trim()) {
      throw createError({ statusCode: 400, message: "SecretKey 不能为空" });
    }

    const config = await prisma.s3Config.create({
      data: {
        name: body.name.trim(),
        baseUrl: body.baseUrl || "",
        bucket: body.bucket.trim(),
        prefix: body.prefix || "",
        endpoint: body.endpoint || "",
        region: body.region || "",
        accessKey: body.accessKey.trim(),
        secretKey: body.secretKey.trim(),
      },
    });

    return {
      success: true,
      data: { ...config, secretKey: "••••••••" },
    };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
