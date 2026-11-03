import { prisma } from "#server/lib/prisma";
import { assertValidSlug } from "#server/lib/page";
import { paginated, parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const pagination = parsePagination(query);

    const where: any = {};
    if (query.status === "DRAFT" || query.status === "PUBLISHED") {
      where.status = query.status;
    }
    const keyword = (query.keyword as string)?.trim();
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: "insensitive" } },
        { slug: { contains: keyword, mode: "insensitive" } },
      ];
    }

    const [list, total] = await Promise.all([
      prisma.page.findMany({
        where,
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.page.count({ where }),
    ]);

    return paginated(list, total, pagination);
  }

  if (method === "POST") {
    const body = await readBody(event);
    const title = String(body?.title ?? "").trim();
    if (!title) {
      throw createError({ statusCode: 400, message: "页面标题不能为空" });
    }
    if (title.length > 255) {
      throw createError({ statusCode: 400, message: "页面标题不能超过 255 个字符" });
    }

    const slug = assertValidSlug(body?.slug);

    const icon = String(body?.icon ?? "").trim() || "file-text";

    try {
      const created = await prisma.page.create({
        data: {
          title,
          slug,
          icon,
          content: String(body?.content ?? ""),
          status: body?.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
          sort: Number.isFinite(parseInt(body?.sort))
            ? parseInt(body?.sort)
            : 0,
        },
      });
      return { success: true, data: created };
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw createError({
          statusCode: 400,
          message: `URL 缩略名 "${slug}" 已存在，请更换`,
        });
      }
      throw e;
    }
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
