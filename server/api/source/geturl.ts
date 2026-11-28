import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache } from "#server/lib/redis";
import {
  GETURL_DAILY_LIMIT,
  getClientIp,
  getTodayGeturlCount,
  incrementTodayGeturlCount,
} from "#server/lib/geturl-record";
import {
  parseShareUrl,
  normalizeShareUrl,
} from "#server/lib/pan/share-url";
import {
  transferShareUrl,
  type TransferShareUrlResult,
} from "#server/lib/pan/transfer";
import { assertBotDefense } from "#server/utils/bot-defense";

// 🔒 内存进程锁（单实例高效防并发击穿）
const inflightRequests = new Map<string, Promise<TransferShareUrlResult>>();

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 403, message: "请求方法错误" });
  }

  // BOT 防御闸门：未启用时直接放行，启用后需携带有效通行令牌
  await assertBotDefense(event, "/api/source/geturl");

  const body = await readBody(event);
  let inputUrl = body.url as string | undefined;
  let id = body.id as string | undefined;

  if (!inputUrl && !id) {
    throw createError({ statusCode: 400, message: "缺少参数 url 或 id" });
  }

  if (inputUrl && id) {
    throw createError({ statusCode: 400, message: "同时传入 url 和 id 无效" });
  }

  const clientIp = getClientIp(event);
  let sourceUrl = "";

  if (inputUrl) {
    const decryptedUrl = await decryptUrl(inputUrl);
    if (!decryptedUrl)
      throw createError({ statusCode: 400, message: "链接解密失败" });
    sourceUrl = normalizeShareUrl(decryptedUrl);
  }

  const cacheKey = id ? `source:id:${id}` : `source:url:${sourceUrl}`;

  // 🚀 一级防御：读取大并发下的分布式 Redis 缓存
  const redisCache = await getRedisCache<string>(cacheKey);
  if (redisCache !== null) {
    return { url: redisCache, cache: "redis" };
  }

  // 🔒 二级防御：并发互斥单飞锁（防止击穿网盘 SDK 和账号限制）
  if (inflightRequests.has(cacheKey)) {
    // transferShareUrl 解析为 TransferShareUrlResult，必须取出其中的 url 字符串，
    // 否则前端拿到的 data.url 是一个对象，下载弹窗会显示 [object Object]
    const result = await inflightRequests.get(cacheKey);
    if (result) {
      return { url: result.url, cache: "inflight" };
    }
  }

  if (id) {
    const source = await prisma.source.findUnique({
      select: {
        id: true,
        url: true,
        status: true,
        isSelf: true,
      },
      where: { id },
    });
    if (!source || source.status === 0)
      throw createError({ statusCode: 404, message: "文件不存在或已被删除" });
    if (source.isSelf) {
      return { url: source.url };
    }
    sourceUrl = normalizeShareUrl(source.url);
  }

  if (!sourceUrl) throw createError({ statusCode: 400, message: "链接为空" });

  const { type, fid, passcode } = parseShareUrl(sourceUrl);

  // 🛡️ IP 今日 geturl 记录限流：超过上限不再转存，直接返回原始链接
  const todayCount = await getTodayGeturlCount(clientIp, type);
  if (todayCount >= GETURL_DAILY_LIMIT) {
    return { url: sourceUrl };
  }

  // 🔒 三级防御：写入前的二次检查（双检）
  //
  // 为什么必须有这一步：上面的 has() 检查与本处的 set() 之间隔着多个 await
  // （id 分支的 findUnique、以及今天的 geturl 计数查询），每个 await 都会让出
  // 事件循环。并发请求因此会「全部通过上面的检查」，再依次各自上锁，
  // 等于锁完全没生效 —— 同一链接会被并发转存 N 次，白白消耗 N 份网盘 quotas。
  //
  // 二次检查与 set() 之间不允许出现任何 await，靠 JS 单线程的同步执行保证
  // 「检查 + 写入」的原子性；此时若已有在途请求，直接复用它。
  const recheck = inflightRequests.get(cacheKey);
  if (recheck) {
    const result = await recheck;
    if (result) {
      return { url: result.url, cache: "inflight" };
    }
  }

  // 构建核心转存处理链条
  const transferPromise = transferShareUrl(
    event,
    sourceUrl,
    type,
    fid,
    passcode,
    id,
  );

  // 将 Promise 送入全局互斥拦截器（与上面的 recheck 之间无 await）
  inflightRequests.set(cacheKey, transferPromise);

  try {
    const result = await transferPromise;
    // 记录 IP 今日 geturl 次数（异步，不阻塞响应）
    event.waitUntil(incrementTodayGeturlCount(clientIp, type));
    return { url: result.url };
  } finally {
    inflightRequests.delete(cacheKey);
  }
});
