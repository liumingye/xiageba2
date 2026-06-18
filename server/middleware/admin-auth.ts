import { getTokenFromEvent, verifyToken } from "#server/utils/auth";

export default defineEventHandler((event) => {
  const url = event.node.req.url || "";

  // 只拦截 /api/admin/** 下的请求（排除 /api/admin/login）
  if (!url.startsWith("/api/admin")) return;
  if (url.startsWith("/api/admin/login")) return;

  const token = getTokenFromEvent(event);
  const decoded = verifyToken(token);
  if (!decoded) {
    throw createError({
      statusCode: 401,
      message: "未登录或登录已过期",
    });
  }

  // 将用户信息挂载到 event 上下文，供后续 handler 使用
  event.context.user = decoded;
});
