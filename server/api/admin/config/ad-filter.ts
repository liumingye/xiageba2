import { getConfigValues, setConfigValues } from "#server/lib/configCache";
import { initAutomaton_ad_filter } from "#server/lib/simpleAC";

const CONFIG_KEY = "ad_filter";

interface AdFilterConfig {
  enabled: boolean;
  keywords: string;
}

const DEFAULT_CONFIG: AdFilterConfig = {
  enabled: false,
  keywords: "",
};

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues([CONFIG_KEY]);
    if (!result[CONFIG_KEY]) {
      return { data: DEFAULT_CONFIG };
    }
    return { data: JSON.parse(result[CONFIG_KEY]) };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const value: Record<string, string> = {};
    for (const key of ["enabled", "keywords"]) {
      if (body && body[key] !== undefined) {
        value[key] = body[key] || "";
      }
    }

    const result = await setConfigValues([
      {
        key: CONFIG_KEY,
        value: JSON.stringify(value),
      },
    ]);

    // 重新初始化自动机
    await initAutomaton_ad_filter();

    return result;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
