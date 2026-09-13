import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import {
  resolveLinkStatus,
  submitCheckRequest,
  type PanCheckLinkStatus,
} from "#server/lib/pan-check";

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

  // PanCheck 现在同步返回检测结果，无需异步任务与轮询
  const result = await submitCheckRequest(linksAndKey.map(([url]) => url));
  if (!result) {
    return { success: false, message: "检测失败或未配置 PanCheck 服务" };
  }

  // 按原始标识回填检测状态，前端可直接按 id/url 取值
  const statuses: Record<string, PanCheckLinkStatus> = {};
  for (const [link, key] of linksAndKey) {
    statuses[key] = resolveLinkStatus(link, result);
  }

  event.headers.set("cache-control", "no-cache");

  return {
    success: true,
    statuses,
    server_id: result.server_id,
    // submission_id: result.submission_id,
    // total_duration: result.total_duration,
    // invalid_format_count: result.invalid_format_count,
    // duplicate_count: result.duplicate_count,
  };
});
