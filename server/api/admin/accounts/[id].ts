import { prisma } from "#server/lib/prisma";
import { clearAccountCache } from "#server/lib/accountCache";
import { cleanClient } from "#server/lib/pan-instance";
import { getAccountNameByCredentials } from "#server/lib/pan-info";

const VALID_TYPES = ["quark", "baidu", "uc", "xunlei"];

export default defineEventHandler(async (event) => {
  const method = event.method;
  const id = parseInt(getRouterParam(event, "id") || "", 10);

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, message: "无效的账号 ID" });
  }

  // 获取单个账号（完整数据，用于编辑）
  if (method === "GET") {
    const account = await prisma.panAccount.findUnique({ where: { id } });
    if (!account) {
      throw createError({ statusCode: 404, message: "账号不存在" });
    }
    return { data: account };
  }

  // 更新
  if (method === "PUT") {
    const body = await readBody(event);
    const data: Record<string, any> = {};

    if (body?.type !== undefined) {
      const type = String(body.type).toLowerCase();
      if (!VALID_TYPES.includes(type)) {
        throw createError({ statusCode: 400, message: "不支持的网盘类型" });
      }
      data.type = type;
    }
    if (body?.cookie !== undefined) data.cookie = String(body.cookie);
    if (body?.refreshToken !== undefined)
      data.refreshToken = String(body.refreshToken);
    if (body?.accessToken !== undefined)
      data.accessToken = String(body.accessToken);
    if (body?.tempDir !== undefined) data.tempDir = String(body.tempDir);
    if (body?.status !== undefined) data.status = body.status === 0 ? 0 : 1;

    if (body?.expiresAt !== undefined) {
      if (body.expiresAt) {
        const d = new Date(body.expiresAt);
        if (!isNaN(d.getTime())) {
          data.expiresAt = d;
        }
      } else {
        data.expiresAt = null;
      }
    }

    // 如果凭证（cookie 或 refreshToken）发生变化，重新获取昵称
    const hasCredentialUpdate =
      body?.cookie !== undefined || body?.refreshToken !== undefined;

    if (hasCredentialUpdate) {
      const existing = await prisma.panAccount.findUnique({
        where: { id },
        select: {
          type: true,
          cookie: true,
          refreshToken: true,
          accessToken: true,
          expiresAt: true,
        },
      });

      if (existing) {
        const mergedType = (data.type || existing.type) as string;
        const mergedCookie =
          data.cookie !== undefined ? data.cookie : existing.cookie;
        const mergedRefreshToken =
          data.refreshToken !== undefined
            ? data.refreshToken
            : existing.refreshToken;
        const mergedAccessToken =
          data.accessToken !== undefined
            ? data.accessToken
            : existing.accessToken;
        const mergedExpiresAt =
          data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt;

        try {
          const name = await getAccountNameByCredentials({
            type: mergedType,
            cookie: mergedCookie,
            refreshToken: mergedRefreshToken,
            accessToken: mergedAccessToken,
            expiresAt: mergedExpiresAt || undefined,
          });
          data.name = name;
        } catch (e: any) {
          console.warn(`[accounts] 更新时获取昵称失败: ${e?.message || e}`);
        }
      }
    }

    try {
      await prisma.panAccount.update({ where: { id }, data });
    } catch (e: any) {
      // Prisma P2025 = 记录不存在；其他错误（如字段缺失）需暴露真实信息
      if (e?.code === "P2025") {
        throw createError({ statusCode: 404, message: "账号不存在" });
      }
      console.error("[accounts] 更新失败:", e);
      throw createError({
        statusCode: 500,
        message: e?.message || "更新失败",
      });
    }

    clearAccountCache();
    cleanClient(id);

    return { success: true };
  }

  // 删除
  if (method === "DELETE") {
    try {
      await prisma.panAccount.delete({ where: { id } });
    } catch {
      throw createError({ statusCode: 404, message: "账号不存在" });
    }

    clearAccountCache();
    cleanClient(id);

    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
