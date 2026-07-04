import {
  getConfigValues,
  setConfigValues,
} from "#server/lib/configCache";

const REDIS_KEYS = ["redis_host", "redis_port", "redis_db", "redis_password"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(REDIS_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const configs = [];
    for (const key of REDIS_KEYS) {
      if (body && body[key] !== undefined) {
        configs.push({ key, value: body[key] || "" });
      }
    }

    const result = await setConfigValues(configs);

    return result;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
