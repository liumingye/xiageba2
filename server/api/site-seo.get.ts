import { getConfigValues } from "#server/lib/configCache";

const DEFAULT_TITLE = "全盘搜 - 免费网盘资源搜索引擎";
const DEFAULT_SHORT_TITLE = "全盘搜";
const DEFAULT_DESCRIPTION =
  "全盘搜是一个快捷便利的公开网盘搜索引擎，为您提供各类网盘资源的在线搜索、精准筛选服务。";

export default defineEventHandler(async () => {
  const values = await getConfigValues([
    "site_seo_title",
    "site_seo_short_title",
    "site_seo_description",
  ]);

  return {
    title: values.site_seo_title || DEFAULT_TITLE,
    shortTitle: values.site_seo_short_title || DEFAULT_SHORT_TITLE,
    description: values.site_seo_description || DEFAULT_DESCRIPTION,
  };
});
