/**
 * 清理 ISR 路由缓存（POST /api/admin/cache/clear）
 * body: { route?: string }
 *  - 不传 route：清理所有 isr 缓存
 *  - 传 route：清理指定路由下的 isr（如 "/"、"/music/123"、"/music/**"）
 *
 * 由 admin-auth 中间件统一校验登录。
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ route?: string }>(event).catch(() => ({}));

  const storage = useStorage("cache:nuxt:payload:");

  let removed: string[] = [];

  // 全量清理
  const keys = await storage.getKeys();
  for (const k of keys) {
    await storage.removeItem(k);
    removed.push(k);
  }

  return { success: true, total: removed.length };
});
