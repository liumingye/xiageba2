import { getConfigValues, setConfigValues } from "#server/lib/configCache";
import { clearCacheNitroHandlers } from "#server/utils/cache";

const SEO_KEYS = [
  "site_seo_title",
  "site_seo_short_title",
  "site_seo_description",
  "site_icp_licence",
];

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const result = await getConfigValues(SEO_KEYS);
    return { data: result };
  }

  if (method === "POST") {
    const body = await readBody(event);

    const configs = [];
    for (const key of SEO_KEYS) {
      if (body && body[key] !== undefined) {
        configs.push({ key, value: (body[key] || "").toString().trim() });
      }
    }

    const result = await setConfigValues(configs);

    // 清理缓存
    await clearCacheNitroHandlers("site-seo-data");

    return result;
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
