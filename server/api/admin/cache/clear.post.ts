/**
 * 清理 ISR 路由缓存（POST /api/admin/cache/clear）
 */
export default defineEventHandler(async (event) => {
  const storage = useStorage("cache:nuxt:payload:");

  let total = 0;

  // 全量清理
  const keys = await storage.getKeys();
  for (const k of keys) {
    await storage.removeItem(k);
    total++;
  }

  return { success: true, total };
});
