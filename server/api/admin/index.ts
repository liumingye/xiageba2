import { prisma } from "#server/lib/prisma";
import { hashPassword } from "#server/utils/password";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "POST") {
    const body = await readBody(event);
    const { username, password } = body;

    if (!username || !password) {
      throw createError({ statusCode: 400, message: "用户名和密码不能为空" });
    }
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 50 ||
      password.length > 200
    ) {
      throw createError({ statusCode: 400, message: "用户名或密码格式错误" });
    }

    const existingAdmin = await prisma.admin.findUnique({
      where: { username },
    });

    if (existingAdmin) {
      throw createError({ statusCode: 400, message: "用户名已存在" });
    }

    const hashedPassword = hashPassword(password);

    const admin = await prisma.admin.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    return {
      id: admin.id,
      username: admin.username,
    };
  }

  if (method === "GET") {
    const admins = await prisma.admin.findMany({
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });
    return admins;
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { id, username, password } = body;

    if (!id) {
      throw createError({ statusCode: 400, message: "缺少管理员ID" });
    }

    if (!username && !password) {
      throw createError({
        statusCode: 400,
        message: "请提供要修改的用户名或密码",
      });
    }
    if (
      (username !== undefined &&
        (typeof username !== "string" ||
          !username.trim() ||
          username.length > 50)) ||
      (password !== undefined &&
        (typeof password !== "string" || password.length > 200))
    ) {
      throw createError({ statusCode: 400, message: "用户名或密码格式错误" });
    }

    const existingAdmin = await prisma.admin.findUnique({
      where: { id },
    });

    if (!existingAdmin) {
      throw createError({ statusCode: 404, message: "管理员不存在" });
    }

    if (username && username !== existingAdmin.username) {
      const duplicateAdmin = await prisma.admin.findUnique({
        where: { username },
      });

      if (duplicateAdmin) {
        throw createError({ statusCode: 400, message: "用户名已存在" });
      }
    }

    const updateData: any = {};
    if (username) updateData.username = username;
    if (password) updateData.password = hashPassword(password);

    const admin = await prisma.admin.update({
      where: { id },
      data: updateData,
    });

    return {
      id: admin.id,
      username: admin.username,
    };
  }

  if (method === "DELETE") {
    const body = await readBody(event);
    const { id } = body;

    if (!id) {
      throw createError({ statusCode: 400, message: "缺少管理员ID" });
    }

    // count 与 delete 必须在同一个事务里串行化，否则两个并发删除请求
    // 会同时读到 count=2，把仅有的两个管理员全部删掉，造成永久锁死后台。
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin:delete'))`;

        const count = await tx.admin.count();
        if (count <= 1) {
          throw createError({
            statusCode: 400,
            message: "至少需要保留一个管理员",
          });
        }

        const target = await tx.admin.findUnique({ where: { id } });
        if (!target) {
          throw createError({ statusCode: 404, message: "管理员不存在" });
        }

        await tx.admin.delete({ where: { id } });
      },
      { timeout: 10_000 },
    );

    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
