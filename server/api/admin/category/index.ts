import { prisma } from "#server/lib/prisma";
import { clearCategoryNameMapCache } from "#server/lib/categoryCache";
import { paginated, parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const pagination = parsePagination(query);

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.category.count(),
    ]);

    return paginated(categories, total, pagination);
  }

  if (method === "POST") {
    const body = await readBody(event);
    const { name, image, sort, isShow } = body;

    if (!name?.trim()) {
      throw createError({ statusCode: 400, message: "分类名称不能为空" });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        image: image || "",
        sort: sort ? parseInt(sort) || 0 : 0,
        isShow: isShow !== undefined ? isShow : true,
      },
    });

    await clearCategoryNameMapCache();
    return { success: true, data: category };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
