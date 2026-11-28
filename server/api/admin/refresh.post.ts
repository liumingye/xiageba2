import { resolveTokenAdmin } from "#server/lib/adminToken";
import { rotateVerifiedTokens, verifyTokenDetailed } from "#server/utils/auth";

/**
 * 用 refresh token 换新的 access token（同时轮转 refresh token）
 *
 * 这个端点不走后台鉴权中间件（无法用 refresh token 过 access 校验），
 * 因此在 server/middleware/admin-auth.ts 的白名单里单独放行。
 */
export default defineEventHandler(async (event) => {
  let body: any = null;
  try {
    body = await readBody(event);
  } catch {
    body = null;
  }

  const refreshToken =
    typeof body?.refreshToken === "string" ? body.refreshToken : "";

  if (!refreshToken) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "登录已过期，请重新登录",
    });
  }

  const expiredError = () =>
    createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "登录已过期，请重新登录",
    });

  // 先校验签名与有效期，再做吊销校验：管理员被删除或改过密码后不允许续期
  const verified = verifyTokenDetailed(refreshToken, "refresh");
  if (!verified || !(await resolveTokenAdmin(verified))) {
    throw expiredError();
  }

  const tokens = rotateVerifiedTokens(verified);
  // 签名校验允许 60 秒时钟漂移，漂移窗口内的已过期令牌不能续
  if (!tokens) throw expiredError();

  return tokens;
});
