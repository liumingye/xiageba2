import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const withLatest = query.withLatest === "true";

  const categories = await prisma.category.findMany({
    select: { id: true, name: true, image: true },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
  });

  if (!withLatest) {
    return { data: categories };
  }

  const data = await Promise.all(
    categories.map(async (cat) => {
      const latest = await prisma.source.findMany({
        where: { cid: cat.id, isTemp: false, status: 1 },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, url: true, createdAt: true },
      });

      const items = latest.map((item) => ({
        id: item.id,
        title: item.title,
        type: getStorageType(item.url),
        createdAt: item.createdAt,
      }));

      return {
        ...cat,
        latest: items,
      };
    }),
  );

  // 在最前面插入"最新资源"（不按分类筛选，全局最新 10 条）
  const latestAll = await prisma.source.findMany({
    where: { isTemp: false, status: 1 },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, url: true, createdAt: true },
  });
  const latestAllItems = latestAll.map((item) => ({
    id: item.id,
    title: item.title,
    type: getStorageType(item.url),
    createdAt: item.createdAt,
  }));

  data.unshift({
    id: 0,
    name: "最新资源",
    image: "",
    sort: -1,
    latest: latestAllItems,
  } as any);

  return { data };
});
