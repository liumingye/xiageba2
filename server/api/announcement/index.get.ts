import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const displayType = query.displayType as string | undefined;
  const status = query.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(query.pageSize as string) || 10),
  );
  const skip = (page - 1) * pageSize;

  const where: any = { status };
  if (displayType && ["NORMAL", "BANNER", "DIALOG"].includes(displayType)) {
    where.displayType = displayType;
  }

  const [list, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        content: true,
        displayType: true,
        icon: true,
        status: true,
        sort: true,
        createdAt: true,
      },
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
});
