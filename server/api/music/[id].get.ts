import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少音乐ID" });
  }

  const music = await prisma.music.findUnique({
    where: { id },
  });

  if (!music) {
    throw createError({ statusCode: 404, message: "音乐不存在" });
  }

  prisma.music.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });

  return {
    ...music,
    downloads: JSON.parse(music.downloads || "[]"),
  };
});
