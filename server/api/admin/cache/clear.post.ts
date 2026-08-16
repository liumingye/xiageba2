/**
 * 清理Nitro缓存（POST /api/admin/cache/clear）
 * https://nitro.net.cn/docs/cache
 */
export default defineEventHandler(async (event) => {
  const storage = useStorage("cache:");

  let total = 0;

  // 全量清理
  const keys = await storage.getKeys();
  for (const k of keys) {
    await storage.removeItem(k);
    total++;
  }

  return { success: true, total };
});
