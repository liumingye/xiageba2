import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.category.count(),
    ]);

    return {
      data: categories,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const { name, image, sort } = body;

    if (!name?.trim()) {
      throw createError({ statusCode: 400, message: "分类名称不能为空" });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        image: image || "",
        sort: sort ? parseInt(sort) || 0 : 0,
      },
    });

    return { success: true, data: category };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
