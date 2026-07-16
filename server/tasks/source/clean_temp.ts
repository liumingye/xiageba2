import { prisma } from "#server/lib/prisma";
import { getConfigValues } from "#server/lib/configCache";
import { getStorageType } from "#shared/utils";
import {
  getQuarkClient,
  getUCClient,
  getBaiduClient,
  getXunleiClient,
} from "#server/lib/pan-instance";
import { setRedisCache, getRedisCache, delRedisCache } from "#server/lib/redis";

const THIRTY_MINUTES = 2 * 60 * 60 * 1000; // ⚡ 2小时的毫秒数
const ONE_DAY = 24 * 60 * 60 * 1000; // ⚡ 1天的毫秒数
const PAN_BATCH_LIMIT = 100;
const LOCK_KEY = "lock:cron:clean-temp-sources";
const LOCK_TTL = 600;

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
      deletedIds?: string[];
    };
  }> {
    console.log("开始清理临时资源...");
    // 1. 🔒 抢占 Redis 全局分布式锁
    const isLocked = await getRedisCache(LOCK_KEY);
    if (isLocked) {
      return {
        result: {
          success: false,
          message: "已有相同的清理任务在后台运行中，本次触发跳过。",
        },
      };
    }
    await setRedisCache(LOCK_KEY, { lockedAt: Date.now() }, LOCK_TTL);

    try {
      const now = Date.now();
      const cutoffNormal = new Date(now - THIRTY_MINUTES);
      const cutoffForce = new Date(now - ONE_DAY); // ⚡ 超过1天的临界线

      // 捞出所有超过 THIRTY_MINUTES 分钟的临时资源
      const sources = await prisma.source.findMany({
        where: {
          isTemp: true,
          createdAt: { lt: cutoffNormal },
        },
        select: { id: true, url: true, fid: true, createdAt: true },
      });

      const results = {
        total: sources.length,
        successCount: 0,
        forceDeletedCount: 0, // ⚡ 记录强删的僵尸数据量
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

      // 核心存放桶
      const forceDeleteDbIds: string[] = []; // ⚡ 存放超过1天、准备直接强删的DB ID
      const quarkTasks: Array<{ id: string; fids: string[] }> = [];
      const ucTasks: Array<{ id: string; fids: string[] }> = [];
      const baiduTasks: Array<{ id: string; fids: string[] }> = [];
      const xunleiTasks: Array<{ id: string; fids: string[] }> = [];

      // 2. 归类整理（加入时间判定）
      for (const source of sources) {
        // ⚡ 【核心改动 1】：如果数据已经超过1天，不再调用网盘 API，直接送入强删队列
        if (source.createdAt.getTime() < cutoffForce.getTime()) {
          forceDeleteDbIds.push(source.id);
          continue;
        }

        if (!source.fid) continue;

        const type = getStorageType(source.url);
        const parsedFids = safeParseFid(source.fid);
        if (parsedFids.length === 0) continue;

        const taskItem = { id: source.id, fids: parsedFids };

        if (type === "quark") quarkTasks.push(taskItem);
        else if (type === "uc") ucTasks.push(taskItem);
        else if (type === "baidu") baiduTasks.push(taskItem);
        else if (type === "xunlei") xunleiTasks.push(taskItem);
      }

      const successfullyDeletedDbIds: string[] = [];

      // --- 夸克网盘 ---
      if (quarkTasks.length > 0) {
        try {
          const client = await getQuarkClient();
          for (let i = 0; i < quarkTasks.length; i += PAN_BATCH_LIMIT) {
            const chunk = quarkTasks.slice(i, i + PAN_BATCH_LIMIT);
            await client.fsApi.delete(chunk.flatMap((c) => c.fids));
            successfullyDeletedDbIds.push(...chunk.map((c) => c.id));
          }
        } catch (e: any) {
          results.errors.push(`Quark删除失败: ${e.message || "未知错误"}`);
        }
      }

      // --- UC网盘 ---
      if (ucTasks.length > 0) {
        try {
          const client = await getUCClient();
          for (let i = 0; i < ucTasks.length; i += PAN_BATCH_LIMIT) {
            const chunk = ucTasks.slice(i, i + PAN_BATCH_LIMIT);
            await client.fsApi.delete(chunk.flatMap((c) => c.fids));
            successfullyDeletedDbIds.push(...chunk.map((c) => c.id));
          }
        } catch (e: any) {
          results.errors.push(`UC删除失败: ${e.message || "未知错误"}`);
        }
      }

      // --- 迅雷网盘 ---
      if (xunleiTasks.length > 0) {
        try {
          const client = await getXunleiClient();
          for (let i = 0; i < xunleiTasks.length; i += PAN_BATCH_LIMIT) {
            const chunk = xunleiTasks.slice(i, i + PAN_BATCH_LIMIT);
            await client.fsApi.delete(chunk.flatMap((c) => c.fids));
            successfullyDeletedDbIds.push(...chunk.map((c) => c.id));
          }
        } catch (e: any) {
          results.errors.push(`迅雷删除失败: ${e.message || "未知错误"}`);
        }
      }

      // --- 百度网盘 ---
      if (baiduTasks.length > 0) {
        try {
          const config = await getConfigValues(["baidu_temp_dir"]);
          let tempDir = config.baidu_temp_dir;
          if (!tempDir) throw new Error("未配置 baidu 网盘临时目录");

          if (!tempDir.startsWith("/")) tempDir = `/${tempDir}`;
          tempDir = tempDir.replace(/\/+/g, "/").replace(/\/$/, "");

          const client = await getBaiduClient();

          for (let i = 0; i < baiduTasks.length; i += PAN_BATCH_LIMIT) {
            const chunk = baiduTasks.slice(i, i + PAN_BATCH_LIMIT);
            const validChunkDbIds: string[] = [];
            const allPanPaths: string[] = [];

            for (const item of chunk) {
              let hasValidPath = false;
              for (let path of item.fids) {
                if (!path || typeof path !== "string") continue;
                if (!path.startsWith("/")) path = `/${path}`;
                path = path.replace(/\/+/g, "/");

                const cleanPath = path.replace(/\/$/, "");
                if (
                  path.includes("..") ||
                  path === "/" ||
                  cleanPath === tempDir ||
                  !cleanPath.startsWith(tempDir)
                ) {
                  continue;
                }
                allPanPaths.push(path);
                hasValidPath = true;
              }
              if (hasValidPath) {
                validChunkDbIds.push(item.id);
              }
            }

            if (allPanPaths.length > 0) {
              // 优先使用OpenAPI删除，不需要验证码
              if (client.accessToken) {
                await client.fsOpenApi.filemanager("delete", {
                  filelist: allPanPaths,
                  async: 0,
                });
              } else {
                await client.fsApi.filemanager("delete", {
                  filelist: allPanPaths,
                } as any);
              }
              successfullyDeletedDbIds.push(...validChunkDbIds);
            } else {
              successfullyDeletedDbIds.push(...chunk.map((c) => c.id));
            }
          }
        } catch (e: any) {
          results.errors.push(`百度删除失败: ${e.message || "未知错误"}`);
        }
      }

      // 4. 🔒 【核心改动 2】：最终同步更新数据库
      // 把“网盘正常删除成功的ID”与“超过1天需要强删的ID”合并到一起
      const finalDeleteDbIds = [
        ...successfullyDeletedDbIds,
        ...forceDeleteDbIds,
      ];

      if (finalDeleteDbIds.length > 0) {
        await prisma.source.deleteMany({
          where: { id: { in: finalDeleteDbIds } },
        });
        results.successCount = successfullyDeletedDbIds.length;
        results.forceDeletedCount = forceDeleteDbIds.length;
      }

      console.log(
        `清理临时资源完成，共删除 ${results.successCount} 条成功，${results.forceDeletedCount} 条强制删除`,
      );
      return {
        result: {
          success: results.errors.length === 0,
          results,
          deletedIds: finalDeleteDbIds,
        },
      };
    } finally {
      await delRedisCache(LOCK_KEY);
    }
  },
});
