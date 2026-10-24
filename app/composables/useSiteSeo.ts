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
 * 跨路由导航、hydration 均不再请求；新页面加载（刷新/新会话）时才重新获取。
 * key 固定为 "site-seo-data"，多处调用共享同一次请求（dedupe: defer）。
 *
 * 返回的是取值快照而非 ref——站点 SEO 配置在单次会话内不会变更，
 * 解构成字符串直接用于模板拼接 / useSeoMeta 即可，无需 .value。
 * 如确需响应式订阅，请自行 `useFetch` 同一个 key。
 */
export async function useSiteSeo(): Promise<SiteSeoConfig> {
  const { data } = await useFetch<SiteSeoConfig>("/api/site-seo", {
    default: (): SiteSeoConfig => ({
      siteTitle: "",
      siteShortTitle: "",
      siteDescription: "",
      icpLicence: "",
    }),
    dedupe: "defer",
    key: "site-seo-data",
    cache: "default",
  });

  return data.value as SiteSeoConfig;
}
