import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const body = getQuery(event);

  const pageSize = Math.min(Math.max(1, Number(body.pageSize) || 15), 20);
  const page = Math.min(500, Math.max(1, Number(body.page) || 1));

  const skip = (page - 1) * pageSize;

  const musics = await prisma.music.findMany({
    select: {
      id: true,
      title: true,
      artist: true,
      cover: true,
    },
    orderBy: { createdAt: "desc" },
    take: pageSize,
    skip,
  });

  return musics.map((m) => ({
    ...m,
  }));
});
