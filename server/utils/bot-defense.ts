import type { H3Event } from "h3";
import {
  evaluateBotDefense,
  getBotDefenseConfig,
  getBotDefenseSecret,
} from "#server/lib/bot-defense";
import { getTokenFromEvent, verifyToken } from "#server/utils/auth";

/**
 * BOT 防御闸门（nitro 自动导入，受保护接口 handler 顶部调用）
 *
 * 放行顺序：
 * 1. 未启用防御 / 接口不在保护列表 → 放行
 * 2. 后台管理员携带合法 Bearer Token → 放行（后台自身预览不受影响）
 * 3. 请求头 x-captcha-pass 携带未过期通行令牌 → 放行
 * 4. 否则抛 403，data.code = CAPTCHA_REQUIRED，前端 captchaFetch 据此拉起验证码
 *
 * 用法：await assertBotDefense(event, "/api/source/geturl");
 * 新增保护接口：先在 server/lib/bot-defense.ts 的 registerProtectedApi 登记，
 * 再到目标 handler 顶部加一行调用。
 */
export async function assertBotDefense(
  event: H3Event,
  apiPath: string,
): Promise<void> {
  const config = await getBotDefenseConfig();
  // 快速通道：未启用 / 该接口不受保护时，不触碰任何密钥逻辑
  if (config.captchaType === "none") return;
  if (!config.protectedApis.includes(apiPath)) return;

  // 后台管理员放行
  try {
    const adminToken = getTokenFromEvent(event);
    if (adminToken && verifyToken(adminToken)) return;
  } catch {
    // ADMIN_SECRET 未配置时视为无管理员通道，继续走通行令牌判定
  }

  const captchaPass = getHeader(event, "x-captcha-pass") || "";
  const result = evaluateBotDefense(config, {
    apiPath,
    captchaPass,
    secret: getBotDefenseSecret(),
  });

  if (!result.ok) {
    throw createError({
      statusCode: 403,
      message: "需要人机验证",
      data: {
        code: "CAPTCHA_REQUIRED",
        captchaType: result.captchaType,
        siteKey: result.siteKey,
      },
    });
  }
}
