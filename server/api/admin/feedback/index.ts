import { prisma } from "#server/lib/prisma";
import { paginated, parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const pagination = parsePagination(query);
    const status = query.status as string | undefined;

    const where = status ? { status: status as "PENDING" | "DONE" } : {};

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.feedback.count({ where }),
    ]);

    return paginated(feedbacks, total, pagination);
  }

  if (method === "DELETE") {
    const result = await prisma.feedback.deleteMany({
      where: { status: "DONE" },
    });
    return { success: true, deleted: result.count };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
