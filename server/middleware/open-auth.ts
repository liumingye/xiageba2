import { API_TOKEN_CONFIG_KEY } from "#server/lib/const";
import { getConfigValue } from "#server/lib/configCache";
import { safeEqual } from "#server/utils/auth";

/**
 * 开放 API（/api/open/**）鉴权：Authorization: Bearer <api_token>。
 * auth-scheme 按 RFC 7235 大小写不敏感，兼容第三方客户端的小写 bearer。
 */
export default defineEventHandler(async (event) => {
  const path = (event.path || "").split("?")[0] || "";

  if (!path.startsWith("/api/open/")) return;

  const header = getHeader(event, "authorization") || "";
  const match = /^\s*bearer\s+(.+?)\s*$/i.exec(header);
  const provided = match?.[1]?.trim() ?? "";
  const expected = ((await getConfigValue(API_TOKEN_CONFIG_KEY)) || "").trim();

  if (!expected) {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden",
      message: "开放 API 未启用：请先在后台「安全配置」中生成 API Token",
    });
  }

  if (!provided || !safeEqual(provided, expected)) {
    setResponseHeader(event, "WWW-Authenticate", "Bearer");
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: provided ? "API Token 无效" : "缺少 API Token",
    });
  }

  event.context.openApi = { auth: "api-token" };
});
