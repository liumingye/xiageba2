import { getConfigValues, setConfigValues } from "#server/lib/configCache";
import { initAutomaton_websearch_filter_keywords } from "#server/lib/simpleAC";

const CONFIG_KEYS = ["websearch_filter_keywords"];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(CONFIG_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const configs = [];
    for (const key of CONFIG_KEYS) {
      if (body && body[key] !== undefined) {
        configs.push({ key, value: body[key] || "" });
      }
    }

    const result = await setConfigValues(configs);

    // 重新初始化自动机
    await initAutomaton_websearch_filter_keywords();

    return result;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
