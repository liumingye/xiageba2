import { getRedisCache } from "#server/lib/redis";

/**
 * 获取当前后台全文索引的重建进度
 * GET /api/admin/source/rebuild-status
 */
export default defineEventHandler(async (event) => {
  // 从高速 Redis 缓存中获取状态，完全不碰数据库，高并发下性能极高
  const cachedStatus = await getRedisCache<{
    status: "running" | "done" | "error";
    current?: number;
    message?: string;
  }>("status:rebuild:source");

  // 如果缓存里什么都没有，说明当前根本没有任务在跑
  if (!cachedStatus) {
    return { status: "idle", current: 0 };
  }

  return cachedStatus;
});
