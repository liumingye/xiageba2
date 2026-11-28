import { prisma } from "#server/lib/prisma";
import { getAccountById } from "#server/lib/accountCache";
import { getClientByAccount } from "#server/lib/pan-instance";
import { getAdapterByClient } from "#server/lib/pan/adapters";
import { acquireLock } from "#server/lib/lock";
import { THIRTY_MINUTES } from "#server/lib/const";

const ONE_DAY = 24 * 60 * 60 * 1000; // ⚡ 1天的毫秒数
const PAN_BATCH_LIMIT = 100;
const LOCK_KEY = "lock:cron:clean-temp-sources";
/** 锁 TTL 小于任务周期（10 分钟），持有期间会自动续期；持有者崩溃时最多 540s 后自动释放 */
const LOCK_TTL = 540;

function safeParseFid(fidStr: string): string[] {
  if (!fidStr) return [];
  try {
    const parsed = JSON.parse(fidStr);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [fidStr];
  }
}

export default defineTask({
  meta: {
    name: "source:clean_temp",
    description: "清理临时资源",
  },
  async run(): Promise<{
    result: {
      success: boolean;
      message?: string;
      results?: {
        total: number;
        successCount: number;
        forceDeletedCount: number;
        errors: string[];
      };
      deletedIds?: number[];
    };
  }> {
    console.log("开始清理临时资源...");
    // 1. 🔒 抢占分布式锁（SET NX 原子抢占，多实例下只有一个能拿到）
    const lockRes = await acquireLock(LOCK_KEY, { ttlSeconds: LOCK_TTL });
    if (!lockRes.acquired) {
      const message =
        lockRes.reason === "locked"
          ? "已有相同的清理任务在后台运行中，本次触发跳过。"
          : "Redis 不可用，无法协调多实例，本次清理跳过以避免并发删除网盘文件。";
      console.log(`[clean_temp] ${message}`);
      return {
        result: {
          success: false,
          message,
        },
      };
    }

    try {
      const now = Date.now();
      const cutoffNormal = new Date(now - THIRTY_MINUTES * 1000);
      const cutoffForce = new Date(now - ONE_DAY); // ⚡ 超过1天的临界线

      // 捞出所有超过对应过期时间的临时资源
      const sources = await prisma.sourceTemp.findMany({
        where: {
          createdAt: { lt: cutoffNormal },
        },
        select: {
          id: true,
          url: true,
          fid: true,
          accountId: true,
          createdAt: true,
        },
      });

      const results = {
        total: sources.length,
        successCount: 0,
        forceDeletedCount: 0,
        errors: [] as string[],
      };

      if (sources.length === 0) {
        return {
          result: {
            success: true,
            results,
          },
        };
      }

      const forceDeleteDbIds: number[] = [];
      const successfullyDeletedDbIds: number[] = [];
      const noAccountDbIds: number[] = [];

      // 按 accountId 分组（跳过超过1天的强删数据和无 accountId 的旧数据）
      const accountGroups = new Map<
        number,
        Array<{ id: number; url: string; fids: string[] }>
      >();

      for (const source of sources) {
        // 超过1天，直接强删
        if (source.createdAt.getTime() < cutoffForce.getTime()) {
          forceDeleteDbIds.push(source.id);
          continue;
        }

        // 无 accountId 的旧数据，无法调用网盘 API 删除文件，仅删 DB 记录
        if (!source.accountId) {
          noAccountDbIds.push(source.id);
          continue;
        }

        if (!source.fid) continue;

        const fids = safeParseFid(source.fid);
        if (fids.length === 0) continue;

        const group = accountGroups.get(source.accountId) || [];
        group.push({ id: source.id, url: source.url, fids });
        accountGroups.set(source.accountId, group);
      }

      // 按账号分组删除网盘文件
      for (const [accountId, items] of accountGroups) {
        const account = await getAccountById(accountId);
        if (!account || account.status !== 1) {
          // 账号不存在或已停用，仅删 DB 记录
          noAccountDbIds.push(...items.map((i) => i.id));
          continue;
        }

        try {
          const client = await getClientByAccount(account);
          const adapter = getAdapterByClient(client);
          if (!adapter) continue;

          // 厂商差异收进 adapter.deleteFiles，这里只做统一分批
          for (let i = 0; i < items.length; i += PAN_BATCH_LIMIT) {
            const chunk = items.slice(i, i + PAN_BATCH_LIMIT);
            const deletedIds = await adapter.deleteFiles(client, chunk, account);
            successfullyDeletedDbIds.push(...deletedIds);
          }
        } catch (e: any) {
          results.errors.push(
            `账号 ${accountId} 删除失败: ${e.message || "未知错误"}`,
          );
        }
      }

      // 最终同步更新数据库
      const finalDeleteDbIds = [
        ...successfullyDeletedDbIds,
        ...forceDeleteDbIds,
        ...noAccountDbIds,
      ];

      if (finalDeleteDbIds.length > 0) {
        await prisma.sourceTemp.deleteMany({
          where: { id: { in: finalDeleteDbIds } },
        });
        results.successCount = successfullyDeletedDbIds.length;
        results.forceDeletedCount =
          forceDeleteDbIds.length + noAccountDbIds.length;
      }

      console.log(
        `清理临时资源完成，共删除 ${results.successCount} 条成功，${results.forceDeletedCount} 条强制/无账号删除`,
      );
      return {
        result: {
          success: results.errors.length === 0,
          results,
          deletedIds: finalDeleteDbIds,
        },
      };
    } finally {
      // 只释放自己仍持有的锁（token 校验），不会误删他人新抢到的锁
      await lockRes.lock.release();
    }
  },
});
