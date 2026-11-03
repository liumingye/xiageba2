import { createConfigKVHandler } from "#server/utils/admin";
import { clearCacheNitroHandlers } from "#server/utils/cache";

const SEO_KEYS = [
  "site_seo_title",
  "site_seo_short_title",
  "site_seo_description",
  "site_icp_licence",
];

// 保存后清理前台 SEO 数据的 Nitro 缓存，否则最长 30 分钟不生效；
// 值与旧实现一致：falsy 统一为空串，其余 trim。
export default createConfigKVHandler(SEO_KEYS, {
  normalizeValue: (v) => (v ? String(v).trim() : ""),
  afterSave: () => clearCacheNitroHandlers("site-seo-data"),
});
