import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default defineEventHandler(async () => {
  const limit = 9;

  const musics = await prisma.music.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return musics.map((m) => ({
    ...m,
    downloads: JSON.parse(m.downloads || "[]"),
  }));
});
