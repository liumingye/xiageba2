import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;
    const cid = query.cid as string | undefined;
    const keyword = query.keyword as string | undefined;

    const where: any = {};
    if (cid) where.cid = cid;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { url: { contains: keyword } },
      ];
    }

    const [sources, total, categories] = await Promise.all([
      prisma.source.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.source.count({ where }),
      prisma.category.findMany({ orderBy: { sort: "asc" } }),
    ]);

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const data = sources.map((s) => ({
      ...s,
      categoryName: categoryMap.get(s.cid) || "",
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      categories,
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const { cid, title, url, description, menu } = body;

    if (!cid?.trim()) {
      throw createError({ statusCode: 400, message: "请选择分类" });
    }
    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: "资源名称不能为空" });
    }
    if (!url?.trim()) {
      throw createError({ statusCode: 400, message: "资源地址不能为空" });
    }

    const source = await prisma.source.create({
      data: {
        cid: cid.trim(),
        title: title.trim(),
        url: url.trim(),
        description: description || "",
        menu: menu || "",
      },
    });

    return { success: true, data: source };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
