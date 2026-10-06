/**
 * 清理Nitro缓存（POST /api/admin/cache/clear）
 * https://nitro.build/docs/cache
 * https://github.com/unjs/unstorage
 */
export default defineEventHandler(async (event) => {
  const storage = useStorage("cache:");

  // 全量清理
  const keys = await storage.getKeys();
  storage.clear();

  // 如果clear无效进行兜底
  for (const k of keys) {
    await storage.removeItem(k);
  }

  return { success: true, total: keys.length };
});
