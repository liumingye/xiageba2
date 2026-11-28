import { prisma } from "#server/lib/prisma";
import { incCount } from "#server/lib/view-count";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少音乐ID" });
  }

  const music = await prisma.music.findUnique({
    select: {
      id: true,
      title: true,
      artist: true,
      album: true,
      cover: true,
      lyrics: true,
      playUrl: true,
      downloads: true,
      status: true,
    },
    where: { id },
  });

  if (!music) {
    throw createError({ statusCode: 404, message: "音乐不存在" });
  }

  // 后台禁用的歌曲不对外暴露（与资源详情接口行为一致）
  if (music.status === 0) {
    throw createError({ statusCode: 404, message: "音乐不存在" });
  }

  event.waitUntil(incCount(id));

  return {
    ...music,
    downloads: music.downloads || [],
  };
});
