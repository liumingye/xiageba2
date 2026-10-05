interface SiteSeoConfig {
  siteTitle: string;
  siteShortTitle: string;
  siteDescription: string;
  icpLicence: string;
}

/**
 * 站点 SEO 配置（后台「系统配置 → SEO 配置」）
 *
 * useAsyncData 永久缓存：一旦取到就复用（payload.data 生命周期内），
 * 跨路由导航、hydration 均不再请求；新页面加载（刷新/新会话）时才重新获取
 */
export async function useSiteSeo() {
  const { data } = await useFetch<SiteSeoConfig>("/api/site-seo", {
    default: () => ({
      siteTitle: "",
      siteShortTitle: "",
      siteDescription: "",
      icpLicence: "",
    }),
    dedupe: "defer",
    key: "site-seo-data",
    cache: "default",
  });

  return data.value;
}
