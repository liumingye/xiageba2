import { Pool } from "pg";
import { buildTokens } from "#server/utils/jieba";
import { clearTreeSymbols } from "#server/utils/source";
import { setRedisCache } from "#server/lib/redis";
import { TREE_MAX_LINE } from "#server/lib/const";

// 🔒 全局互斥状态锁，防止高并发下重复触发运维任务
let isRebuilding = false;

export default defineEventHandler(async (event) => {
  // 先解析请求体，再置锁；否则 readBody 抛错会绕过 setImmediate 的 finally，
  // 让 isRebuilding 永久为 true。
  const { all } = await readBody(event);

  // 检查与置锁之间不能有 await，否则并发请求会同时通过检查。
  if (isRebuilding) {
    throw createError({
      statusCode: 423,
      message: "当前已有资源全文索引重建任务在后台运行中，请勿重复触发",
    });
  }

  isRebuilding = true;

  // ⚡ 立即返回响应，转入后台异步执行（防止前端客户端因长连接超时报错）
  // 利用 Node.js 的事件循环，在当前 tick 结束后开始执行后台繁重任务
  setImmediate(async () => {
    let pool: Pool | null = null;

    const taskType = all ? "all" : "inc"; // 区分全量还是增量

    try {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 15,
      });

      console.log(`[RebuildSearch] 开始重建全文索引...`);

      const CHUNK_SIZE = 200;
      let lastId = "";
      let totalUpdated = 0;
      let failedBatches = 0;
      let lastBatchError = "";
      let hasMore = true;

      const baseWhere = all
        ? `WHERE id > $1`
        : `WHERE id > $1 AND ("searchVector" IS NULL OR "searchVector" = '')`;

      while (hasMore) {
        const { rows } = await pool.query(
          `SELECT id, title, description, menu FROM "Source" ${baseWhere} ORDER BY id ASC LIMIT ${CHUNK_SIZE};`,
          [lastId],
        );

        if (rows.length === 0) {
          hasMore = false;
          break;
        }

        const ids: string[] = [];
        const tokenStrings: string[] = [];

        for (const s of rows) {
          const tokens = buildTokens(
            s.title || "",
            s.description || "",
            truncateString(clearTreeSymbols(s.menu || ""), TREE_MAX_LINE),
          );
          ids.push(s.id);
          tokenStrings.push(tokens);
          lastId = s.id;
        }

        try {
          await pool.query(
            `UPDATE "Source" as s SET "searchVector" = to_tsvector('simple', t.tokens) FROM (SELECT unnest($1::text[]) as id, unnest($2::text[]) as tokens) as t WHERE s.id = t.id;`,
            [ids, tokenStrings],
          );
          totalUpdated += rows.length;

          // ⚡ 【新增改动点 1】：每处理完一批，把进度写入 Redis，过期时间设为 5 分钟
          await setRedisCache(
            `status:rebuild:source`,
            {
              status: "running",
              current: totalUpdated,
              type: taskType,
              updatedAt: Date.now(),
            },
            300,
          );
        } catch (updateErr: any) {
          // 单批失败不应让状态显示 done：否则管理员会误以为全量索引已完整。
          failedBatches += 1;
          lastBatchError = updateErr?.message || String(updateErr);
          console.error(`[RebuildSearch] 批次更新失败`, updateErr);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await setRedisCache(
        `status:rebuild:source`,
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

      console.log(
        `[RebuildSearch] 全文索引重建结束，已处理 ${totalUpdated} 条，失败批次 ${failedBatches}`,
      );
    } catch (globalErr) {
      await setRedisCache(
        `status:rebuild:source`,
        {
          status: "error",
          message: "服务器后台任务异常中断",
        },
        60,
      );
      console.error("[RebuildSearch] 严重异常:", globalErr);
    } finally {
      isRebuilding = false;
      await pool?.end().catch((err) => {
        console.error("[RebuildSearch] 关闭连接池失败:", err);
      });
    }
  });

  // 立即给管理员反馈，不阻塞 HTTP 请求
  return {
    success: true,
    message: "全文索引重建任务已在后台异步启动，请查看服务器日志关注进度。",
  };
});
