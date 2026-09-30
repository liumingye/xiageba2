import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import {
  resolveLinkStatus,
  submitCheckRequest,
  type PanCheckLinkStatus,
} from "#server/lib/pan-check";

// 有效链接状态缓存 24 小时
const LINK_STATUS_CACHE_TTL = 60 * 60 * 24;
const linkStatusCacheKey = (url: string) => `pancheck:status:${url}`;

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 405, message: "不支持的请求方法" });
  }

  const body = await readBody(event);
  const { ids, urls } = body || {};

  // [待检测的真实网盘链接, 前端传入的原始标识（id 或加密后的 url）]
  const linksAndKey: [string, string][] = [];

  if (Array.isArray(ids) && ids.length > 0) {
    // 从数据库查询 URL
    const sources = await prisma.source.findMany({
      where: { id: { in: ids } },
      select: { id: true, url: true },
    });
    for (const s of sources) {
      if (s.url) {
        linksAndKey.push([s.url, s.id]);
      }
    }
  } else if (Array.isArray(urls) && urls.length > 0) {
    // 解密 URL，原始加密串作为回填标识
    for (const u of urls) {
      const decrypted = await decryptUrl(u);
      if (decrypted) {
        linksAndKey.push([decrypted, u]);
      }
    }
  }

  if (linksAndKey.length === 0) {
    return { success: false, message: "没有有效的链接" };
  }

  if (linksAndKey.length > 20) {
    return { success: false, message: "请求检测链接过多" };
  }

  // 按原始标识回填检测状态，前端可直接按 id/url 取值
  const statuses: Record<string, PanCheckLinkStatus> = {};

  // 先读 Redis 缓存：命中 valid 的链接无需再次提交检测
  const pendingCheck: [string, string][] = [];
  for (const [link, key] of linksAndKey) {
    const cached = await getRedisCache<PanCheckLinkStatus>(
      linkStatusCacheKey(link),
    );
    if (cached === "valid") {
      statuses[key] = "valid";
    } else {
      pendingCheck.push([link, key]);
    }
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

    for (const [link, key] of pendingCheck) {
      const status = resolveLinkStatus(link, result);
      statuses[key] = status;
      // 仅缓存有效链接，失效链接不缓存以便下次重新检测
      if (status === "valid") {
        event.waitUntil(
          setRedisCache(
            linkStatusCacheKey(link),
            status,
            LINK_STATUS_CACHE_TTL,
          ),
        );
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
