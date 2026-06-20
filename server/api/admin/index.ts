import { prisma } from "#server/lib/prisma";
import { createHash } from "crypto";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "POST") {
    const body = await readBody(event);
    const { username, password } = body;

    if (!username || !password) {
      throw createError({ statusCode: 400, message: "用户名和密码不能为空" });
    }

    const existingAdmin = await prisma.admin.findUnique({
      where: { username },
    });

    if (existingAdmin) {
      throw createError({ statusCode: 400, message: "用户名已存在" });
    }

    const hashedPassword = createHash("sha256").update(password).digest("hex");

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
    if (password)
      updateData.password = createHash("sha256").update(password).digest("hex");

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

    const count = await prisma.admin.count();
    if (count <= 1) {
      throw createError({
        statusCode: 400,
        message: "至少需要保留一个管理员",
      });
    }

    await prisma.admin.delete({
      where: { id },
    });

    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
