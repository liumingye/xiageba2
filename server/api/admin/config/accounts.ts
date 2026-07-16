import { getConfigValues, setConfigValues } from "#server/lib/configCache";
import { cleanClients } from "#server/lib/pan-instance";

const ACCOUNT_KEYS = [
  "quark_cookie",
  "quark_temp_dir",
  "baidu_cookie",
  "baidu_refresh_token",
  // "baidu_access_token",
  // "baidu_expires_at",
  "baidu_temp_dir",
  "uc_cookie",
  "uc_temp_dir",
  "xunlei_refresh_token",
  // "xunlei_access_token",
  // "xunlei_expires_at",
  "xunlei_temp_dir",
];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(ACCOUNT_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const configs = [];
    for (const key of ACCOUNT_KEYS) {
      if (body && body[key] !== undefined) {
        configs.push({ key, value: body[key] || "" });
      }
    }

    const result = await setConfigValues(configs);

    cleanClients();

    return result;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
