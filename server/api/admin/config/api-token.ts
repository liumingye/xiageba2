import { API_TOKEN_CONFIG_KEY } from "#server/lib/const";
import { getConfigValues, setConfigValues } from "#server/lib/configCache";

/** RFC 6750 b64token 字符集，16-128 位 */
const API_TOKEN_RE = /^[A-Za-z0-9\-._~+/=]{16,128}$/;

export default defineEventHandler(async (event) => {
  if (event.method === "GET") {
    const result = await getConfigValues([API_TOKEN_CONFIG_KEY]);
    return { data: result };
  }

  if (event.method === "POST") {
    const body = await readBody(event);
    const value = String(body?.[API_TOKEN_CONFIG_KEY] ?? "").trim();

    if (value && !API_TOKEN_RE.test(value)) {
      throw createError({
        statusCode: 400,
        message: "API Token 需为 16-128 位字母数字或 -._~+/= 字符",
      });
    }

    // 空串表示关闭开放 API
    return setConfigValues([{ key: API_TOKEN_CONFIG_KEY, value }]);
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
