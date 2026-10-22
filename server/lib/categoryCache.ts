import { prisma } from "#server/lib/prisma";
import { delRedisCache, getRedisCache, setRedisCache } from "#server/lib/redis";

/** 分类名映射缓存 Key（id -> name） */
const CATEGORY_MAP_CACHE_KEY = "category:name:map";
/** 缓存 TTL：分类变更会主动清理，TTL 只是兜底 */
const CATEGORY_MAP_TTL = 30 * 60;

/**
 * 获取全量分类名映射（id -> name），带 Redis 缓存。
 * 分类数据量小（百行以内），一次性全量缓存比逐 cid 查询更划算。
 */
export const getCategoryNameMap = async (): Promise<Record<number, string>> => {
  const cached = await getRedisCache<Record<number, string>>(
    CATEGORY_MAP_CACHE_KEY,
  );
  if (cached) return cached;

  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
  });
  const map: Record<number, string> = {};
  for (const c of categories) map[c.id] = c.name;

  await setRedisCache(CATEGORY_MAP_CACHE_KEY, map, CATEGORY_MAP_TTL);
  return map;
};

/**
 * 清理分类名映射缓存。
 * ⚠️ 分类的新增 / 修改 / 删除必须调用此函数，否则搜索接口会拿到旧分类名。
 */
export const clearCategoryNameMapCache = async (): Promise<void> => {
  await delRedisCache(CATEGORY_MAP_CACHE_KEY);
};

/**
 * 获取分类列表（数组形态：{ id, name }），带 Redis 缓存。
 * 与 getCategoryNameMap 共用同一份缓存，只是消费形态不同；
 * Redis 不可用时自动降级查库，行为与原来一致。
 */
export const getCategoryList = async (): Promise<
  { id: number; name: string }[]
> => {
  const map = await getCategoryNameMap();
  return Object.entries(map)
    .map(([id, name]) => ({ id: Number(id), name }))
    .sort((a, b) => a.id - b.id);
};
