import { prisma } from "#server/lib/prisma";
import { paginated, parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const pagination = parsePagination(query);

    const where: any = {};
    if (query.status === "ACTIVE" || query.status === "ARCHIVED") {
      where.status = query.status;
    }
    if (
      query.displayType === "NORMAL" ||
      query.displayType === "BANNER" ||
      query.displayType === "DIALOG"
    ) {
      where.displayType = query.displayType;
    }

    const [list, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.announcement.count({ where }),
    ]);

    return paginated(list, total, pagination);
  }

  if (method === "POST") {
    const body = await readBody(event);
    const { title, content, displayType, icon, sort } = body;

    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: "标题不能为空" });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim(),
        content: content || "",
        displayType: displayType || "NORMAL",
        icon: icon || "INFO",
        sort: sort ? parseInt(sort) || 0 : 0,
      },
    });

    return { success: true, data: announcement };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
