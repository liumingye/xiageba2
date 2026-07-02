import { prisma } from "#server/lib/prisma";
import { tokenizeIndex } from "#server/utils/jieba";

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
    const cid = Number(query.cid) || null;
    const keyword = query.keyword as string | undefined;

    const where: any = { isTemp: false, status: 1 };
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

    return {
      data: sources,
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

    // if (!cid) {
    //   throw createError({ statusCode: 400, message: "请选择分类" });
    // }
    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: "资源名称不能为空" });
    }
    if (!url?.trim()) {
      throw createError({ statusCode: 400, message: "资源地址不能为空" });
    }

    // 从分享链接中提取 fid（网盘文件ID）
    // const fid = url.match(/\/s\/([^/?#]+)/)?.[1] || "";

    const source = await prisma.source.create({
      data: {
        cid: Number(cid) || null,
        title: title.trim(),
        url: url.trim(),
        // fid,
        description: description || "",
        menu: menu || "",
      },
    });

    // jieba 分词后更新 searchVector
    const tokens = [title, description]
      .map((s) => tokenizeIndex(s || ""))
      .filter(Boolean)
      .join(" ");
    if (tokens) {
      await prisma.$executeRaw`UPDATE "Source" SET "searchVector" = to_tsvector('simple', ${tokens}) WHERE id = ${source.id}`;
    }

    return { success: true, data: source };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
