import { prisma } from "#server/lib/prisma";
import { decryptUrl } from "#server/lib/crypto";
import { getRedisCache, setRedisCache } from "#server/lib/redis";
import {
  submitCheckRequest,
  getCheckResult,
  getPanCheckServers,
} from "#server/lib/pancheck";

const SUBMISSION_CACHE_TTL = 600; // 10 分钟

export default defineEventHandler(async (event) => {
  const method = event.method;

  // POST: 提交检测请求
  if (method === "POST") {
    const body = await readBody(event);
    const { ids, urls } = body || {};

    // 获取要检测的链接
    let links: [string, string][] = [];

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // 从数据库查询 URL
      const sources = await prisma.source.findMany({
        where: { id: { in: ids } },
        select: { id: true, url: true },
      });
      for (const s of sources) {
        if (s.url) {
          links.push([s.url, s.id]);
        }
      }
    } else if (urls && Array.isArray(urls) && urls.length > 0) {
      // 解密 URL
      for (const u of urls) {
        const decrypted = await decryptUrl(u);
        if (decrypted) {
          links.push([decrypted, u]);
        }
      }
    }

    if (links.length === 0) {
      return { success: false, message: "没有有效的链接" };
    }

    // 提交检测请求，支持指定服务器索引
    const result = await submitCheckRequest(links.map(([url]) => url));
    if (!result) {
      return { success: false, message: "提交检测失败或未配置 PanCheck 服务" };
    }

    await setRedisCache(
      `pancheck:${result.idx}:${result.data.submission_id}`,
      links,
      SUBMISSION_CACHE_TTL,
    );

    return {
      success: true,
      submission_id: result.data.submission_id,
      server_index: result.idx,
      count: links.length,
    };
  }

  // GET: 查询检测结果
  if (method === "GET") {
    const query = getQuery(event);
    const submissionId = Number(query.submission_id);
    const serverIndex = Number(query.server_index);

    if (!submissionId || isNaN(serverIndex)) {
      return { success: false, message: "缺少 submission_id 或 server_index" };
    }

    // 从缓存获取 submission 信息
    let links = await getRedisCache<[string, string][]>(
      `pancheck:${serverIndex}:${submissionId}`,
    );

    if (!links) {
      return { success: false, message: "links 不存在" };
    }

    // 缓存丢失时，通过 server_index 从服务器列表重建
    // if (!submission && serverIndex !== undefined && !isNaN(serverIndex)) {
    const servers = await getPanCheckServers();
    const server = servers[serverIndex];
    if (!server) {
      return { success: false, message: "未配置 PanCheck 服务" };
    }

    // 查询 PanCheck 结果
    const result = await getCheckResult(
      server.url,
      submissionId,
      server.password,
    );
    if (!result) {
      return { success: false, message: "获取检测结果失败" };
    }

    // 将链接映射回 ID（缓存有 links/ids 时才能映射）
    const validIds: string[] = [];
    // const invalidIds: string[] = [];
    const pendingIds: string[] = [];

    if (links.length > 0) {
      for (let i = 0; i < links.length; i++) {
        // @ts-ignore
        const [link, id] = links[i];
        if (result.valid_links.includes(link)) {
          validIds.push(id);
        } else if (result.pending_links.includes(link)) {
          pendingIds.push(id);
        }
      }
    }

    event.headers.set("cache-control", "no-cache");

    return {
      success: true,
      validIds,
      pendingIds,
      total_duration: result.total_duration,
    };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
