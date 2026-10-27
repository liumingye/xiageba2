import { prisma } from "#server/lib/prisma";
import { sendFeedbackResolvedEmail } from "#server/lib/email";

export default defineEventHandler(async (event) => {
  const method = event.method;
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少反馈 ID" });
  }

  if (method === "PUT") {
    const existing = await prisma.feedback.findUnique({ where: { id } });
    if (!existing) {
      throw createError({ statusCode: 404, message: "反馈不存在" });
    }

    // 只在 PENDING -> DONE 的这一次更新后发邮件。
    // 原实现每次 PUT 都发，管理员重复点击会给用户重复发信。
    const result = await prisma.feedback.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "DONE",
        resolvedBy: event.context.user?.username || null,
        resolvedAt: new Date(),
      },
    });

    const feedback = await prisma.feedback.findUniqueOrThrow({ where: { id } });

    // 如果用户提供了邮箱且本次确实完成了状态迁移，发送通知邮件
    if (result.count > 0 && feedback.email) {
      try {
        await sendFeedbackResolvedEmail(
          feedback.email,
          feedback.musicId,
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

  if (method === "DELETE") {
    await prisma.feedback.delete({
      where: { id },
    });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
