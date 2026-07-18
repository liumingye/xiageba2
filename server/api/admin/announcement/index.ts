import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize as string) || 20),
    );
    const skip = (page - 1) * pageSize;

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
        skip,
        take: pageSize,
      }),
      prisma.announcement.count({ where }),
    ]);

    return {
      data: list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
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
