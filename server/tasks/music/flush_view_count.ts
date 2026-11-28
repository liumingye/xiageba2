import { prisma } from "#server/lib/prisma";
import { getRedis } from "#server/lib/redis";
import { acquireLock } from "#server/lib/lock";
import { VIEW_COUNT_KEY_PREFIX } from "#server/lib/view-count";

const LOCK_KEY = "lock:cron:flush-music-view-count";
/** 锁 TTL 小于任务周期（5 分钟），持有期间自动续期 */
const LOCK_TTL = 240;
/** 单轮 SCAN 的 COUNT 提示值 */
const SCAN_COUNT = 200;

export default defineTask({
  meta: {
    name: "music:flush_view_count",
    description: "将 Redis 中的音乐浏览量批量回写数据库",
  },
  async run() {
    // 🔒 分布式锁：多实例下只有一个执行回写
    const lockRes = await acquireLock(LOCK_KEY, { ttlSeconds: LOCK_TTL });
    if (!lockRes.acquired) {
      const message =
        lockRes.reason === "locked"
          ? "已有回写任务在运行，本次跳过。"
          : "Redis 不可用，本次回写跳过（计数仍缓存在 Redis，下轮重试）。";
      console.log(`[flush_view_count] ${message}`);
      return { result: { success: false, message } };
    }

    try {
      const redis = await getRedis();
      if (!redis) {
        return {
          result: { success: false, message: "Redis 不可用，本次回写跳过。" },
        };
      }

      let cursor = "0";
      let flushed = 0;
      let failed = 0;

      do {
        const [next, keys] = await redis.scan(
          cursor,
          "MATCH",
          `${VIEW_COUNT_KEY_PREFIX}*`,
          "COUNT",
          SCAN_COUNT,
        );
        cursor = next;

        for (const key of keys) {
          const id = key.slice(VIEW_COUNT_KEY_PREFIX.length);
          if (!id) continue;

          const raw = await redis.get(key);
          const count = parseInt(raw || "0", 10);
          if (!Number.isFinite(count) || count <= 0) {
            // 脏数据直接清掉，避免每轮空转
            await redis.del(key);
            continue;
          }

          try {
            // updateMany：音乐已被删除时不抛错，直接丢弃计数
            await prisma.music.updateMany({
              where: { id },
              data: { viewCount: { increment: count } },
            });
            // 先回写成功再扣减：DECRBY 保留回写期间新增的并发计数
            const remain = await redis.decrby(key, count);
            if (remain <= 0) await redis.del(key);
            flushed++;
          } catch (err: any) {
            // 回写失败保留 key，下一轮重试
            failed++;
            console.error(`[flush_view_count] 回写失败 [${id}]:`, err?.message || err);
          }
        }
      } while (cursor !== "0");

      console.log(`[flush_view_count] 回写完成：成功 ${flushed} 首，失败 ${failed} 首`);
      return { result: { success: failed === 0, flushed, failed } };
    } finally {
      await lockRes.lock.release();
    }
  },
});
