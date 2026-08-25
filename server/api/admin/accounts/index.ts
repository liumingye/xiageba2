import { prisma } from "#server/lib/prisma";
import { clearAccountCache } from "#server/lib/accountCache";
import { getAccountNameByCredentials } from "#server/lib/pan-info";

const VALID_TYPES = ["quark", "baidu", "uc", "xunlei"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  // 列表：返回所有账号（脱敏敏感字段）
  if (method === "GET") {
    const accounts = await prisma.panAccount.findMany({
      orderBy: [{ type: "asc" }, { id: "asc" }],
    });

    const data = accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      tempDir: a.tempDir,
      status: a.status,
      hasCookie: !!a.cookie,
      hasRefreshToken: !!a.refreshToken,
      hasAccessToken: !!a.accessToken,
      expiresAt: a.expiresAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return { data };
  }

  // 创建
  if (method === "POST") {
    const body = await readBody(event);
    const type = String(body?.type || "").toLowerCase();

    if (!VALID_TYPES.includes(type)) {
      throw createError({ statusCode: 400, message: "不支持的网盘类型" });
    }

    const cookie = String(body?.cookie || "");
    const refreshToken = String(body?.refreshToken || "");
    const accessToken = String(body?.accessToken || "");
    const tempDir = String(body?.tempDir || "");
    const status = body?.status === 0 ? 0 : 1;

    // 不同类型需要不同的必填凭证
    if ((type === "quark" || type === "uc") && !cookie) {
      throw createError({
        statusCode: 400,
        message: `${type} 网盘必须填写 Cookie`,
      });
    }
    if (type === "xunlei" && !refreshToken) {
      throw createError({
        statusCode: 400,
        message: "迅雷网盘必须填写 Refresh Token",
      });
    }
    if (type === "baidu" && !cookie) {
      throw createError({
        statusCode: 400,
        message: "百度网盘必须填写 Cookie",
      });
    }

    let expiresAt: Date | null = null;
    if (body?.expiresAt) {
      const d = new Date(body.expiresAt);
      if (!isNaN(d.getTime())) expiresAt = d;
    }

    // 通过临时凭证获取账号昵称（失败不阻断创建流程，仅记录日志）
    let name = "";
    try {
      name = await getAccountNameByCredentials({
        type,
        cookie,
        refreshToken,
        accessToken,
        expiresAt: expiresAt || undefined,
      });
    } catch (e: any) {
      console.warn(`[accounts] 创建时获取昵称失败: ${e?.message || e}`);
    }

    const account = await prisma.panAccount.create({
      data: {
        type,
        name,
        cookie,
        refreshToken,
        accessToken,
        expiresAt,
        tempDir,
        status,
      },
    });

    clearAccountCache();

    return { data: { id: account.id } };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
