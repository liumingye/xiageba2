import { getTokenFromEvent, verifyToken } from "#server/utils/auth";

export default defineEventHandler((event) => {
  const path = event.path;

  // 只拦截 /api/admin/** 下的请求（排除 /api/admin/login）
  if (!path.startsWith("/api/admin")) return;

  // 严格比对或使用干净的路由路径匹配，防止通过 /api/admin/login/.. 绕过
  if (path === "/api/admin/login") return;

  const token = getTokenFromEvent(event);
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "未登录或登录已过期",
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "未登录或登录已过期",
    });
  }

  // 将用户信息挂载到 event 上下文，供后续 handler 使用
  event.context.user = decoded;
});
