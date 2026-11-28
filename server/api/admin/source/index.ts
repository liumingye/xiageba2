import { prisma } from "#server/lib/prisma";
import { getCategoryList } from "#server/lib/categoryCache";
import { createSources, searchSourcesByKeyword } from "#server/lib/sourceService";
import { paginated, parsePagination } from "#server/utils/admin";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    const pagination = parsePagination(query);
    const { pageSize, skip } = pagination;
    const cid = Number(query.cid) || null;
    const keyword = (query.keyword as string | undefined)?.trim();

    // 1. 如果带有搜索关键词 keyword
    if (keyword) {
      const [{ data, total }, categories] = await Promise.all([
        searchSourcesByKeyword({ keyword, cid, pagination }),
        getCategoryList(),
      ]);

      return {
        ...paginated(data, total, pagination),
        categories,
      };
    }

    // 2. 无关键词时，保留 Prisma 原生普通列表查询
    const where: any = {};
    if (cid) where.cid = cid;

    // 1. 先只查 id（轻量，走索引少拉数据）
    const ids = await prisma.source.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "desc", id: "asc" },
      skip,
      take: pageSize,
    });

    // 2. 再通过 where id in (id数组) 查询展示字段
    const idList = ids.map((s) => s.id);
    const [sources, total, categories] = await Promise.all([
      idList.length > 0
        ? prisma.source.findMany({
            where: { id: { in: idList } },
            select: {
              id: true,
              cid: true,
              title: true,
              url: true,
              description: true,
              menu: true,
              isSelf: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc", id: "asc" },
          })
        : [],
      prisma.source.count({ where }),
      getCategoryList(),
    ]);

    return {
      ...paginated(sources, total, pagination),
      categories,
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    return createSources(body);
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
