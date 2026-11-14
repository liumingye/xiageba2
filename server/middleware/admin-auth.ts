import { getTokenFromEvent, verifyToken } from "#server/utils/auth";

/**
 * 免鉴权端点：登录与刷新令牌本身不能要求已登录
 * 路径比对前先剥掉 query，避免 /api/admin/login?x=1 这类请求被误判成受保护接口
 */
const PUBLIC_ADMIN_PATHS = new Set(["/api/admin/login", "/api/admin/refresh"]);

export default defineEventHandler((event) => {
  const path = (event.path || "").split("?")[0] || "";

  // 只拦截 /api/admin/** 下的请求
  if (!path.startsWith("/api/admin")) return;

  // 严格比对路由路径，防止通过 /api/admin/login/.. 绕过
  if (PUBLIC_ADMIN_PATHS.has(path)) return;

  const token = getTokenFromEvent(event);
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "未登录或登录已过期",
    });
  }

  // 只接受 access token：refresh token 只能用来换新令牌，不能直接访问接口
  const decoded = verifyToken(token, "access");
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
