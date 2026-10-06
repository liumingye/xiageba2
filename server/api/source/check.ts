import { prisma } from "#server/lib/prisma";
import { decryptUrls } from "#server/lib/crypto";
import {
  getRedisCacheMany,
  setRedisCacheMany,
} from "#server/lib/redis";
import {
  resolveLinkStatus,
  submitCheckRequest,
  type PanCheckLinkStatus,
} from "#server/lib/pan-check";

// 有效链接状态缓存 24 小时（key 为前端传入的原始标识：id 或加密后的 url）
const LINK_STATUS_CACHE_TTL = 60 * 60 * 24;
/** 单次请求允许检测的最大链接数 */
const MAX_CHECK_LINKS = 20;
const idCacheKey = (id: string) => `pancheck:status:id:${id}`;
const urlCacheKey = (url: string) => `pancheck:status:url:${url}`;

/** 取出数组中的字符串项，过滤掉 null / 对象等脏数据并去重 */
const sanitizeInputs = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((v): v is string => typeof v === "string" && v.length > 0))];
};

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({ statusCode: 405, message: "不支持的请求方法" });
  }

  const body = await readBody(event);
  const { ids, urls } = body || {};

  const idInputs = sanitizeInputs(ids);
  const urlInputs = sanitizeInputs(urls);

  // 🔒 数量上限必须在任何昂贵操作（读缓存 / 查库 / 解密）之前拦掉。
  // 原实现把校验放在第 80 行，即先跑完 N 次 Redis GET + 一条 N 元素的 IN 查询
  // + N 次 AES 解密之后，攻击者 POST 一万个 id 就能打出上万次上游开销。
  const input = idInputs.length > 0 ? idInputs : urlInputs;
  if (input.length > MAX_CHECK_LINKS) {
    return {
      success: false,
      message: `请求检测链接过多，单次最多 ${MAX_CHECK_LINKS} 个`,
    };
  }

  // 按原始标识回填检测状态，前端可直接按 id/url 取值
  const statuses: Record<string, PanCheckLinkStatus> = {};

  // 待检测的链接：[真实网盘链接, 前端传入的原始标识（id 或加密后的 url）, 缓存 key]
  const pendingCheck: [string, string, string][] = [];

  if (idInputs.length > 0) {
    // 一次 mget 读全部缓存，命中 valid 的 id 无需查库
    const cachedList = await getRedisCacheMany<PanCheckLinkStatus>(
      idInputs.map(idCacheKey),
    );
    const missedIds = idInputs.filter((id, i) => {
      if (cachedList[i] === "valid") {
        statuses[id] = "valid";
        return false;
      }
      return true;
    });

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
  } else if (urlInputs.length > 0) {
    // 一次 mget 读全部缓存，命中 valid 的 url 无需解密
    const cachedList = await getRedisCacheMany<PanCheckLinkStatus>(
      urlInputs.map(urlCacheKey),
    );
    const missedUrls = urlInputs.filter((u, i) => {
      if (cachedList[i] === "valid") {
        statuses[u] = "valid";
        return false;
      }
      return true;
    });

    if (missedUrls.length > 0) {
      // 解密 URL，原始加密串作为回填标识。
      // 批量解密只准备一次 AES 密钥材料，逐个 decryptUrl 会重复 N 次 importKey。
      const decryptedList = await decryptUrls(missedUrls);
      missedUrls.forEach((u, i) => {
        const decrypted = decryptedList[i];
        if (decrypted) {
          pendingCheck.push([decrypted, u, urlCacheKey(u)]);
        }
      });
    }
  }

  // 兜底校验（上面已按输入量拦截，正常不会触发）
  if (Object.keys(statuses).length + pendingCheck.length > MAX_CHECK_LINKS) {
    return { success: false, message: "请求检测链接过多" };
  }

  if (Object.keys(statuses).length === 0 && pendingCheck.length === 0) {
    return { success: false, message: "没有有效的链接" };
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

    // 仅缓存有效链接，失效链接不缓存以便下次重新检测
    const cacheEntries: {
      key: string;
      value: PanCheckLinkStatus;
      ttlSeconds: number;
    }[] = [];

    for (const [link, key, cacheKey] of pendingCheck) {
      const status = resolveLinkStatus(link, result);
      statuses[key] = status;
      if (status === "valid") {
        cacheEntries.push({
          key: cacheKey,
          value: status,
          ttlSeconds: LINK_STATUS_CACHE_TTL,
        });
      }
    }

    // 一次 pipeline 提交，避免逐个 setRedisCache 的 N 次 RTT
    if (cacheEntries.length > 0) {
      await setRedisCacheMany(cacheEntries);
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
