import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#server/utils/source";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少参数 id" });
  }

  const source = await prisma.source.findUnique({
    select: {
      id: true,
      title: true,
      createdAt: true,
      description: true,
      menu: true,
      url: true,
    },
    where: { id },
  });

  if (!source) {
    throw createError({ statusCode: 404, message: "资源不存在" });
  }

  const type = getStorageType(source.url);

  const { url, ...rest } = source;

  return {
    data: { ...rest, type },
  };
});
