import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";

const MAX_PAGE = 100;

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id;
  const cid = Number(id);

  if (!cid && (cid !== 0 || isNaN(cid))) {
    throw createError({ statusCode: 400, message: "无效的分类ID" });
  }

  const query = getQuery(event);
  const page = Math.min(
    MAX_PAGE,
    Math.max(1, parseInt(query.page as string) || 1),
  );
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(query.pageSize as string) || 20),
  );
  const skip = (page - 1) * pageSize;

  // cid=0 表示不按分类筛选，返回所有资源
  const where =
    cid === 0
      ? { isTemp: false, status: 1 }
      : { cid, isTemp: false, status: 1 };

  const [category, sources, total] = await Promise.all([
    cid === 0
      ? Promise.resolve({ id: 0, name: "最新资源", image: "", sort: 0 })
      : prisma.category.findUnique({ where: { id: cid } }),
    prisma.source.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        url: true,
        menu: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.source.count({ where }),
  ]);

  if (!category) {
    throw createError({ statusCode: 404, message: "分类不存在" });
  }

  const items = sources.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    menu: item.menu,
    type: getStorageType(item.url),
    createdAt: item.createdAt,
  }));

  const totalPages = Math.min(MAX_PAGE, Math.ceil(total / pageSize));

  return {
    category,
    data: items,
    total: Math.min(total, MAX_PAGE * pageSize),
    page,
    pageSize,
    totalPages,
  };
});
