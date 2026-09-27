interface SiteSeoConfig {
  title: string;
  shortTitle: string;
  description: string;
}

const DEFAULT_TITLE = "全盘搜 - 免费网盘资源搜索引擎";
const DEFAULT_SHORT_TITLE = "全盘搜";
const DEFAULT_DESCRIPTION =
  "全盘搜是一个快捷便利的公开网盘搜索引擎，为您提供各类网盘资源的在线搜索、精准筛选服务。";

const DATA_KEY = "site-seo";

/**
 * 站点 SEO 配置（后台「系统配置 → SEO 配置」）
 * - siteTitle：首页标题
 * - siteShortTitle：短标题，用作内页 title 后缀（「xxx - 短标题」）
 * - siteDescription：全站默认 meta description（页面自身设置的 description 优先）
 *
 * useAsyncData 永久缓存：一旦取到就复用（payload.data 生命周期内），
 * 跨路由导航、hydration 均不再请求；新页面加载（刷新/新会话）时才重新获取
 */
export async function useSiteSeo() {
  return {
    siteTitle: DEFAULT_TITLE,
    siteShortTitle: DEFAULT_SHORT_TITLE,
    siteDescription: DEFAULT_DESCRIPTION,
  };

  const { data } = await useAsyncData(
    DATA_KEY,
    () => $fetch<SiteSeoConfig>("/api/site-seo"),
    {
      default: () => ({
        title: DEFAULT_TITLE,
        shortTitle: DEFAULT_SHORT_TITLE,
        description: DEFAULT_DESCRIPTION,
      }),
      dedupe: "defer",
      // 永久复用：只要缓存中有值（含 SSR 注水）就直接返回，不再重新请求
      getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key],
    },
  );

  const siteTitle = (data.value?.title || "").trim() || DEFAULT_TITLE;

  const siteShortTitle =
    (data.value?.shortTitle || "").trim() || DEFAULT_SHORT_TITLE;

  const siteDescription =
    (data.value?.description || "").trim() || DEFAULT_DESCRIPTION;

  return { siteTitle, siteShortTitle, siteDescription };
}
