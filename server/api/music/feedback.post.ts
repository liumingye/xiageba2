import { prisma } from "#server/lib/prisma";

const FEEDBACK_TYPES = [
  "BROKEN_LINK",
  "WRONG_CONTENT",
  "WRONG_CODE",
  "WRONG_QUALITY",
  "WRONG_INFO",
] as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { musicId, type, description } = body;

  if (!musicId) {
    throw createError({ statusCode: 400, message: "缺少音乐ID" });
  }

  if (!type || !FEEDBACK_TYPES.includes(type)) {
    throw createError({
      statusCode: 400,
      message: "无效的反馈类型",
    });
  }

  if (description && description.length > 100) {
    throw createError({
      statusCode: 400,
      message: "补充说明最多100字",
    });
  }

  const music = await prisma.music.findUnique({
    where: { id: musicId },
    select: { id: true, title: true, artist: true },
  });

  if (!music) {
    throw createError({ statusCode: 404, message: "音乐不存在" });
  }

  const feedback = await prisma.feedback.create({
    data: {
      musicId: music.id,
      musicTitle: music.title,
      musicArtist: music.artist,
      type,
      description: description || "",
    },
  });

  return { success: true, id: feedback.id };
});
