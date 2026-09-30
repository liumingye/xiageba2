import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import {
  resolveLinkStatus,
  submitCheckRequest,
  type PanCheckLinkStatus,
} from "#server/lib/pan-check";

// 有效链接状态缓存 24 小时（key 为前端传入的原始标识：id 或加密后的 url）
const LINK_STATUS_CACHE_TTL = 60 * 60 * 24;
const idCacheKey = (id: string) => `pancheck:status:id:${id}`;
const urlCacheKey = (url: string) => `pancheck:status:url:${url}`;

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 405, message: "不支持的请求方法" });
  }

  const body = await readBody(event);
  const { ids, urls } = body || {};

  // 按原始标识回填检测状态，前端可直接按 id/url 取值
  const statuses: Record<string, PanCheckLinkStatus> = {};

  // 待检测的链接：[真实网盘链接, 前端传入的原始标识（id 或加密后的 url）, 缓存 key]
  const pendingCheck: [string, string, string][] = [];

  if (Array.isArray(ids) && ids.length > 0) {
    // 先读 Redis 缓存：命中 valid 的 id 无需查库
    const missedIds: string[] = [];
    for (const id of ids) {
      const cached = await getRedisCache<PanCheckLinkStatus>(idCacheKey(id));
      if (cached === "valid") {
        statuses[id] = "valid";
      } else {
        missedIds.push(id);
      }
    }

    if (missedIds.length > 0) {
      // 从数据库查询 URL
      const sources = await prisma.source.findMany({
        where: { id: { in: missedIds } },
        select: { id: true, url: true },
      });
      for (const s of sources) {
        if (s.url) {
          pendingCheck.push([s.url, s.id, idCacheKey(s.id)]);
        }
      }
    }
  } else if (Array.isArray(urls) && urls.length > 0) {
    // 先读 Redis 缓存：命中 valid 的 url 无需解密
    const missedUrls: string[] = [];
    for (const u of urls) {
      const cached = await getRedisCache<PanCheckLinkStatus>(urlCacheKey(u));
      if (cached === "valid") {
        statuses[u] = "valid";
      } else {
        missedUrls.push(u);
      }
    }

    if (missedUrls.length > 0) {
      // 解密 URL，原始加密串作为回填标识
      for (const u of missedUrls) {
        const decrypted = await decryptUrl(u);
        if (decrypted) {
          pendingCheck.push([decrypted, u, urlCacheKey(u)]);
        }
      }
    }
  }

  if (Object.keys(statuses).length === 0 && pendingCheck.length === 0) {
    return { success: false, message: "没有有效的链接" };
  }

  if (Object.keys(statuses).length + pendingCheck.length > 20) {
    return { success: false, message: "请求检测链接过多" };
  }

  let serverId: number | undefined;

  if (pendingCheck.length > 0) {
    // PanCheck 现在同步返回检测结果，无需异步任务与轮询
    const result = await submitCheckRequest(pendingCheck.map(([url]) => url));
    if (!result) {
      // 缓存未命中的部分检测失败；若全部命中缓存则仍返回成功
      if (Object.keys(statuses).length === 0) {
        return { success: false, message: "检测失败或未配置 PanCheck 服务" };
      }
      return {
        success: true,
        statuses,
        message: "部分链接检测失败或未配置 PanCheck 服务",
      };
    }

    serverId = result.server_id;

    for (const [link, key, cacheKey] of pendingCheck) {
      const status = resolveLinkStatus(link, result);
      statuses[key] = status;
      // 仅缓存有效链接，失效链接不缓存以便下次重新检测
      if (status === "valid") {
        await setRedisCache(cacheKey, status, LINK_STATUS_CACHE_TTL);
      }
    }
  }

  event.headers.set("cache-control", "no-cache");

  return {
    success: true,
    statuses,
    server_id: serverId,
    // submission_id: result.submission_id,
    // total_duration: result.total_duration,
    // invalid_format_count: result.invalid_format_count,
    // duplicate_count: result.duplicate_count,
  };
});
