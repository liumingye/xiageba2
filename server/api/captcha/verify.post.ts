import {
  getBotDefenseConfig,
  getCaptchaProvider,
  getBotDefenseSecret,
  issueCaptchaPassToken,
  verifyCaptchaToken,
} from "#server/lib/bot-defense";
import { getClientIp } from "#server/lib/geturl-record";

/**
 * 公开的人机验证接口（无需后台登录）
 *
 * POST /api/captcha/verify  body: { token }
 * - token 为验证码组件完成后产生的凭证：
 *   Turnstile 为字符串；极验 4.0 为 { lot_number, captcha_output, pass_token, gen_time }
 * - 服务端向验证码平台发起二次校验，通过后签发通行令牌（x-captcha-pass），
 *   有效期内访问受保护接口无需重复验证
 */
export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 405, message: "请求方法错误" });
  }

  const body = await readBody(event);

  const config = await getBotDefenseConfig();
  if (config.captchaType === "none") {
    throw createError({ statusCode: 400, message: "未启用人机验证" });
  }

  const provider = getCaptchaProvider(config.captchaType);
  if (!provider) {
    throw createError({ statusCode: 500, message: "验证码类型配置无效" });
  }

  const ok = await verifyCaptchaToken(provider, {
    siteKey: config.siteKey,
    secretKey: config.secretKey,
    token: body?.token,
    remoteIp: getClientIp(event),
  });
  if (!ok) {
    throw createError({ statusCode: 403, message: "人机验证失败，请重试" });
  }

  const passToken = issueCaptchaPassToken(
    config.verifyTtlMinutes,
    getBotDefenseSecret(),
  );

  return {
    success: true,
    passToken,
    /** 通行令牌剩余有效秒数 */
    expiresIn: config.verifyTtlMinutes * 60,
  };
});
