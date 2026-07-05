import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async () => {
  const limit = 15;

  const musics = await prisma.music.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return musics.map((m) => ({
    ...m,
    downloads: JSON.parse(m.downloads || "[]"),
  }));
});
