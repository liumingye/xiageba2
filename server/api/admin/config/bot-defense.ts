import { getConfigValue, setConfigValue } from "#server/lib/configCache";
import {
  BOT_DEFENSE_CONFIG_KEY,
  listCaptchaProviders,
  listProtectedApis,
  parseBotDefenseConfig,
  validateBotDefenseConfig,
} from "#server/lib/bot-defense";

/**
 * 后台「安全配置 → BOT 防御」配置接口
 *
 * GET  返回当前配置 + 可选项（验证码类型 / 受保护接口均来自注册表，
 *      新增 Provider 或接口后后台下拉框自动出现，无需改本文件）
 * POST 校验并保存整份配置
 */
export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const raw = await getConfigValue(BOT_DEFENSE_CONFIG_KEY);
    return {
      data: parseBotDefenseConfig(raw),
      providers: listCaptchaProviders().map((p) => ({
        type: p.type,
        label: p.label,
        scriptUrl: p.scriptUrl,
        siteKeyLabel: p.siteKeyLabel,
        secretKeyLabel: p.secretKeyLabel,
      })),
      apis: listProtectedApis(),
    };
  }

  if (method === "POST") {
    const body = await readBody(event);
    const result = validateBotDefenseConfig(body);
    if (!result.ok) {
      throw createError({
        statusCode: 400,
        message: result.errors.join("；"),
        data: { errors: result.errors },
      });
    }
    await setConfigValue(
      BOT_DEFENSE_CONFIG_KEY,
      JSON.stringify(result.config),
    );
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
