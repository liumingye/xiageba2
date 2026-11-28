/**
 * 转存编排层：白名单校验 → 厂商分发（PAN_ADAPTERS）→ 选账号/建客户端 →
 * 执行转存 → 失效计数/落库/写缓存。
 * 供 /api/source/geturl 与 wechat 等其他模块复用。
 */
import { prisma } from "#server/lib/prisma";
import { setRedisCache } from "#server/lib/redis";
import { getClientByAccount } from "#server/lib/pan-instance";
import { getRandomAccountByType } from "#server/lib/accountCache";
import { THIRTY_MINUTES } from "#server/lib/const";
import { ALLOWED_HOSTS } from "#server/lib/pan/share-url";
import type { H3Event, EventHandlerRequest } from "h3";
import type { PanType, TransferResult } from "./types";
import { getAdapterByType } from "./adapters";

export interface TransferShareUrlResult {
  url: string;
  transferred: boolean;
  error?: string;
}

/**
 * 核心转存逻辑（可复用，供 wechat 等其他模块调用）
 * 输入原始分享链接，返回转存后的新分享链接（失败时返回原始链接）
 */
export async function transferShareUrl(
  event: H3Event<EventHandlerRequest>,
  sourceUrl: string,
  type: PanType,
  fid: string,
  passcode: string,
  sourceId?: string,
): Promise<TransferShareUrlResult> {
  // 白名单清洗
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(hostname)) {
      return { url: sourceUrl, transferred: false };
    }
  } catch {
    return { url: sourceUrl, transferred: false, error: "链接格式无效" };
  }

  if (type === "unknown" || !fid) {
    return { url: sourceUrl, transferred: false };
  }

  const adapter = getAdapterByType(type);
  if (!adapter) {
    return { url: sourceUrl, transferred: false, error: "未实现的网盘类型" };
  }

  // 随机选取一个该类型的启用账号
  const account = await getRandomAccountByType(type);
  if (!account) {
    return { url: sourceUrl, transferred: false, error: "无可用转存账号" };
  }

  const client = await getClientByAccount(account);

  let data: TransferResult;

  try {
    data = await adapter.transfer(event, account, client, {
      sourceUrl,
      fid,
      passcode,
      sourceId,
    });
  } catch (e: any) {
    // 失效计数
    if (e.statusCode === 404 && sourceId) {
      prisma.source
        .update({
          where: { id: sourceId },
          data: { invalidNum: { increment: 1 } },
        })
        .catch(() => {});
    }

    throw createError({ statusCode: 500, message: e.message || "转存失败" });
  }

  const shareUrl = data.shareUrl;

  // 异步落库
  event.waitUntil(
    prisma.sourceTemp
      .create({
        data: {
          url: shareUrl,
          fid: JSON.stringify(data.fids),
          accountId: account.id,
        },
      })
      .catch((err) => console.error("落库失败", err)),
  );

  // 写入 Redis 缓存
  const cacheKey = sourceId
    ? `source:id:${sourceId}`
    : `source:url:${sourceUrl}`;
  await setRedisCache(cacheKey, shareUrl, Math.max(THIRTY_MINUTES - 300, 60));

  return { url: shareUrl, transferred: true };
}
