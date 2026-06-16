import { usePrisma } from "~/lib/prisma";

export default defineEventHandler(async (event) => {
  const prisma = usePrisma();
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

  return {
    ...music,
    downloads: JSON.parse(music.downloads || "[]"),
  };
});
