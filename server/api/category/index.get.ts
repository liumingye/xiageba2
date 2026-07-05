import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const withLatest = query.withLatest === "true";

  const categories = await prisma.category.findMany({
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

  return { data };
});
