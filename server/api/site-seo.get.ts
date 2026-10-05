import { getConfigValues } from "#server/lib/configCache";

export default defineCachedEventHandler(
  async () => {
    const values = await getConfigValues([
      "site_seo_title",
      "site_seo_short_title",
      "site_seo_description",
      "site_icp_licence",
    ]);

    return {
      siteTitle: values.site_seo_title || "全盘搜 - 免费网盘资源搜索引擎",
      siteShortTitle: values.site_seo_short_title || "全盘搜",
      siteDescription:
        values.site_seo_description ||
        "全盘搜是一个快捷便利的公开网盘搜索引擎，为您提供各类网盘资源的在线搜索、精准筛选服务。",
      icpLicence: values.site_icp_licence || "",
    };
  },
  {
    name: "site-seo-data",
    maxAge: 30 * 60,
    staleMaxAge: 2 * 60 * 60, // 强制过期
    swr: true,
  },
);
