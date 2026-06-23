import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;
    const status = query.status as string | undefined;

    const where = status ? { status: status as "PENDING" | "DONE" } : {};

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.feedback.count({ where }),
    ]);

    return {
      data: feedbacks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  if (method === "DELETE") {
    const result = await prisma.feedback.deleteMany({
      where: { status: "DONE" },
    });
    return { success: true, deleted: result.count };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
