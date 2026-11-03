import { Pool } from "pg";
import { buildSourceSearchTokens } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";
import { setRedisCache, getRedisCache } from "#server/lib/redis";

type RebuildTarget = "music" | "source";

type RebuildRow = {
  id: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  description?: string | null;
  menu?: string | null;
};

type RebuildTargetConfig = {
  batchSize: number;
  cacheKey: string;
  selectSql: (baseWhere: string, batchSize: number) => string;
  updateSql: string;
  buildRowTokens: (row: RebuildRow) => string;
  startLog: (all: boolean) => string;
  batchErrorLog: (ids: string[]) => string;
  successLog: (totalUpdated: number, failedBatches: number) => string;
  fatalErrorLog: string;
  closePoolErrorLog: string;
};

const TARGET_CONFIGS: Record<RebuildTarget, RebuildTargetConfig> = {
  music: {
    batchSize: 500,
    cacheKey: "status:rebuild:music",
    selectSql: (baseWhere, batchSize) => `SELECT id, title, artist, album
       FROM "Music"
       ${baseWhere}
       ORDER BY id ASC
       LIMIT ${batchSize};`,
    updateSql: `UPDATE "Music" as m
       SET "searchVector" = to_tsvector('simple', t.tokens)
       FROM (
         SELECT unnest($1::text[]) as id, unnest($2::text[]) as tokens
       ) as t
       WHERE m.id = t.id;`,
    buildRowTokens: (row) =>
      buildTokens(row.title || "", row.artist || "", row.album || ""),
    startLog: (all) =>
      `[RebuildMusicSearch] 开始重建音乐全文索引... 模式: ${all ? "全量" : "仅增量"}`,
    batchErrorLog: (ids) =>
      `[RebuildMusicSearch] 批次更新失败，范围: ${ids[0]} ~ ${ids[ids.length - 1]}`,
    successLog: (totalUpdated, failedBatches) =>
      `[RebuildMusicSearch] 音乐全文索引重建结束，共处理 ${totalUpdated} 条记录，失败批次 ${failedBatches}。`,
    fatalErrorLog: "[RebuildMusicSearch] 索引重建后台任务发生严重异常:",
    closePoolErrorLog: "[RebuildMusicSearch] 关闭连接池失败:",
  },
  source: {
    batchSize: 200,
    cacheKey: "status:rebuild:source",
    selectSql: (baseWhere, batchSize) =>
      `SELECT id, title, description, menu FROM "Source" ${baseWhere} ORDER BY id ASC LIMIT ${batchSize};`,
    updateSql: `UPDATE "Source" as s SET "searchVector" = to_tsvector('simple', t.tokens) FROM (SELECT unnest($1::text[]) as id, unnest($2::text[]) as tokens) as t WHERE s.id = t.id;`,
    buildRowTokens: (row) =>
      buildSourceSearchTokens({
        title: row.title,
        description: row.description,
        menu: row.menu,
      }),
    startLog: () => `[RebuildSearch] 开始重建全文索引...`,
    batchErrorLog: () => `[RebuildSearch] 批次更新失败`,
    successLog: (totalUpdated, failedBatches) =>
      `[RebuildSearch] 全文索引重建结束，已处理 ${totalUpdated} 条，失败批次 ${failedBatches}`,
    fatalErrorLog: "[RebuildSearch] 严重异常:",
    closePoolErrorLog: "[RebuildSearch] 关闭连接池失败:",
  },
};

/**
 * 重复触发重建时的 423 错误。
 * label 为「音乐」「资源」等业务名，文案与各端点旧实现逐字一致。
 */
export const rebuildAlreadyRunning = (label: string) =>
  createError({
    statusCode: 423,
    message: `当前已有${label}全文索引重建任务在后台运行中，请勿重复触发`,
  });

/**
 * 查询某个目标的重建进度（供 rebuild-status 端点使用）。
 *
 * 从高速 Redis 缓存读取，完全不碰数据库；缓存为空说明当前没有任务，
 * 返回 idle。多副本部署时这段逻辑随 lib 单点维护，端点只做委托。
 */
export const getRebuildStatus = async (target: RebuildTarget) => {
  const cachedStatus = await getRedisCache<{
    status: "running" | "done" | "error";
    current?: number;
    message?: string;
  }>(TARGET_CONFIGS[target].cacheKey);

  if (!cachedStatus) {
    return { status: "idle", current: 0 };
  }

  return cachedStatus;
};

/**
 * 为单个重建入口创建独立任务控制器。
 * start 同步完成检查与置锁，重复触发返回 false；实际工作在后台执行。
 */
export function createSearchRebuildTask(target: RebuildTarget) {
  let isRebuilding = false;
  const config = TARGET_CONFIGS[target];

  return {
    start(all: boolean): boolean {
      if (isRebuilding) return false;
      isRebuilding = true;

      setImmediate(async () => {
        let pool: Pool | null = null;
        const taskType = all ? "all" : "inc";

        try {
          pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 15,
          });

          console.log(config.startLog(all));

          let lastId = "";
          let totalUpdated = 0;
          let failedBatches = 0;
          let lastBatchError = "";
          let hasMore = true;
          const baseWhere = all
            ? `WHERE id > $1`
            : `WHERE id > $1 AND ("searchVector" IS NULL OR "searchVector" = '')`;

          while (hasMore) {
            const { rows } = await pool.query<RebuildRow>(
              config.selectSql(baseWhere, config.batchSize),
              [lastId],
            );

            if (rows.length === 0) {
              hasMore = false;
              break;
            }

            const ids: string[] = [];
            const tokenStrings: string[] = [];
            for (const row of rows) {
              ids.push(row.id);
              tokenStrings.push(config.buildRowTokens(row));
              lastId = row.id;
            }

            try {
              await pool.query(config.updateSql, [ids, tokenStrings]);
              totalUpdated += rows.length;
              await setRedisCache(
                config.cacheKey,
                {
                  status: "running",
                  current: totalUpdated,
                  type: taskType,
                  updatedAt: Date.now(),
                },
                300,
              );
            } catch (updateErr: any) {
              failedBatches += 1;
              lastBatchError = updateErr?.message || String(updateErr);
              console.error(config.batchErrorLog(ids), updateErr);
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          await setRedisCache(
            config.cacheKey,
            {
              status: failedBatches > 0 ? "error" : "done",
              current: totalUpdated,
              type: taskType,
              updatedAt: Date.now(),
              ...(failedBatches > 0
                ? {
                    message: `有 ${failedBatches} 个批次更新失败，最后错误：${lastBatchError}`,
                  }
                : {}),
            },
            60,
          );

          console.log(config.successLog(totalUpdated, failedBatches));
        } catch (globalErr) {
          await setRedisCache(
            config.cacheKey,
            {
              status: "error",
              message: "服务器后台任务异常中断",
            },
            60,
          );
          console.error(config.fatalErrorLog, globalErr);
        } finally {
          isRebuilding = false;
          await pool?.end().catch((err) => {
            console.error(config.closePoolErrorLog, err);
          });
        }
      });

      return true;
    },
  };
}
