import { prisma } from "#server/lib/prisma";
import { normalizeApiListBody } from "#server/lib/apiList";
import { paginated, parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const pagination = parsePagination(query);
    const keyword = query.keyword as string | undefined;

    const where: any = {};
    if (keyword?.trim()) {
      where.OR = [
        { name: { contains: keyword.trim() } },
        { url: { contains: keyword.trim() } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.apiList.findMany({
        where,
        orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.apiList.count({ where }),
    ]);

    return paginated(data, total, pagination);
  }

  if (method === "POST") {
    const body = await readBody(event);
    const data = normalizeApiListBody(body);

    if (!data.name) {
      throw createError({ statusCode: 400, message: "线路名称不能为空" });
    }
    if (!data.url) {
      throw createError({ statusCode: 400, message: "地址不能为空" });
    }

    const item = await prisma.apiList.create({ data });
    return { success: true, data: item };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
