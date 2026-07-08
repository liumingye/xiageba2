import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  if (!event.context.params?.id) {
    throw createError({ statusCode: 400, message: "缺少分类ID" });
  }

  const id = parseInt(event.context.params.id);
  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: "分类ID必须是数字" });
  }

  const method = event.method;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少分类ID" });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { name, image, sort } = body;

    if (!name?.trim()) {
      throw createError({ statusCode: 400, message: "分类名称不能为空" });
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: name.trim(),
        image: image || "",
        sort: sort !== undefined ? parseInt(sort) || 0 : undefined,
      },
    });

    return { success: true, data: category };
  }

  if (method === "DELETE") {
    await prisma.category.delete({ where: { id } });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
