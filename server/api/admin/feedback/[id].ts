import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const method = event.method;
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少反馈 ID" });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { resolvedBy } = body;

    const feedback = await prisma.feedback.update({
      where: { id },
      data: {
        status: "DONE",
        resolvedBy: resolvedBy || null,
        resolvedAt: new Date(),
      },
    });

    return feedback;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
