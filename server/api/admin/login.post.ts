import { prisma } from "#server/lib/prisma";
import { generateToken } from "#server/utils/auth";
import { verifyPassword } from "#server/utils/password";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { username, password } = body;

    if (!username || !password) {
      throw createError({ statusCode: 400, message: "用户名和密码不能为空" });
    }

    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin) {
      // 即使不存在也走一次轻量验证，避免枚举计时攻击
      verifyPassword("dummy", "0".repeat(64));
      throw createError({ statusCode: 401, message: "用户名或密码错误" });
    }

    const { ok } = verifyPassword(password, admin.password);
    if (!ok) {
      throw createError({ statusCode: 401, message: "用户名或密码错误" });
    }

    const token = generateToken(admin.username);

    return {
      id: admin.id,
      username: admin.username,
      token,
    };
  } catch (error: any) {
    throw createError({
      statusCode: error?.statusCode || 500,
      message: error.message || "服务器内部错误",
    });
  }
});
