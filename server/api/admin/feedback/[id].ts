import { prisma } from "#server/lib/prisma";
import { sendFeedbackResolvedEmail } from "#server/lib/email";

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

    // 如果用户提供了邮箱，发送通知邮件
    if (feedback.email) {
      try {
        await sendFeedbackResolvedEmail(
          feedback.email,
          feedback.musicTitle,
          feedback.musicArtist,
          feedback.type,
        );
      } catch (error) {
        // 邮件发送失败不影响反馈标记完成
        console.error("发送反馈通知邮件失败:", error);
      }
    }

    return feedback;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
