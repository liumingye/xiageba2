import { prisma } from "#server/lib/prisma";
import { getRedis } from "#server/lib/redis";

export const VIEW_COUNT_KEY_PREFIX = "viewcount:music:";

export const viewCountKey = (id: string) => `${VIEW_COUNT_KEY_PREFIX}${id}`;

/**
 * 浏览量 +1：优先写 Redis（INCR），由定时任务批量回写数据库。
 * Redis 不可用时降级为直接写库，保证计数不丢。
 */
export const incCount = async (id: string) => {
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.incr(viewCountKey(id));
      return;
    }
  } catch (err: any) {
    console.error(`[viewCount] Redis INCR 失败，降级直写数据库 [${id}]:`, err?.message || err);
  }

  await prisma.music.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });
};
