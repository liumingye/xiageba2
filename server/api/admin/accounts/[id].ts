import { prisma } from "#server/lib/prisma";
import { clearAccountCache } from "#server/lib/accountCache";
import { cleanClient } from "#server/lib/pan-instance";

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

    try {
      await prisma.panAccount.update({ where: { id }, data });
    } catch {
      throw createError({ statusCode: 404, message: "账号不存在" });
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
