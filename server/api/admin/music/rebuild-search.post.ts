import { Pool } from "pg";
import { buildTokens } from "#server/utils/jieba";
import { setRedisCache } from "#server/lib/redis"; // 确保引入你的 Redis 设置函数

// 🔒 全局互斥状态锁，防止多处或重复触发导致数据库崩溃
let isRebuilding = false;

export default defineEventHandler(async (event) => {
  // 先解析请求体，再检查并置锁；检查与置锁之间不能有 await，
  // 否则并发触发会同时通过检查，各自启动一套重建任务。
  const { all } = await readBody(event);

  if (isRebuilding) {
    throw createError({
      statusCode: 423,
      message: "当前已有音乐全文索引重建任务在后台运行中，请勿重复触发",
    });
  }

  isRebuilding = true;

  // ⚡ 立即返回响应，转入后台异步执行，防客户端 HTTP 超时
  setImmediate(async () => {
    let pool: Pool | null = null;

    const taskType = all ? "all" : "inc";

    try {
      // 独立轻量连接池，把常规通道留给前端在线用户
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 15,
      });

      console.log(
        `[RebuildMusicSearch] 开始重建音乐全文索引... 模式: ${all ? "全量" : "仅增量"}`,
      );

      const CHUNK_SIZE = 500; // ⚡ 音乐的数据一般比带有大文件树的 Source 小，批次大小可适当调大到 500
      let lastId = ""; // 基于 ID 游标分页，避开低效的 OFFSET
      let totalUpdated = 0;
      let failedBatches = 0;
      let lastBatchError = "";
      let hasMore = true;

      // 基础查询条件
      const baseWhere = all
        ? `WHERE id > $1`
        : `WHERE id > $1 AND ("searchVector" IS NULL OR "searchVector" = '')`;

      while (hasMore) {
        // 3. 游标分批拉取数据，控死内存开销
        const { rows } = await pool.query(
          `SELECT id, title, artist, album 
           FROM "Music" 
           ${baseWhere} 
           ORDER BY id ASC 
           LIMIT ${CHUNK_SIZE};`,
          [lastId],
        );

        if (rows.length === 0) {
          hasMore = false;
          break;
        }

        const ids: string[] = [];
        const tokenStrings: string[] = [];

        // 4. 内存中高速分词
        for (const m of rows) {
          const tokens = buildTokens(
            m.title || "",
            m.artist || "",
            m.album || "",
          );
          ids.push(m.id);
          tokenStrings.push(tokens);
          lastId = m.id; // 推进游标
        }

        // 5. 🚀 核心优化：利用 UNNEST 特性将 500 次 UPDATE 聚合成 1 条 SQL 批量提交
        try {
          await pool.query(
            `UPDATE "Music" as m
             SET "searchVector" = to_tsvector('simple', t.tokens)
             FROM (
               SELECT unnest($1::text[]) as id, unnest($2::text[]) as tokens
             ) as t
             WHERE m.id = t.id;`,
            [ids, tokenStrings],
          );
          totalUpdated += rows.length;

          // ⚡ 【新增进度同步】：实时上报进度到 Redis，供前端状态接口轮询（缓存5分钟）
          await setRedisCache(
            "status:rebuild:music",
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
          console.error(
            `[RebuildMusicSearch] 批次更新失败，范围: ${ids[0]} ~ ${ids[ids.length - 1]}`,
            updateErr,
          );
        }

        // 6. 给主线程事件循环留出喘息空隙
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // 7. 有失败批次时不能报 done，否则全量重建会被误判为完整。
      await setRedisCache(
        "status:rebuild:music",
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
        `[RebuildMusicSearch] 音乐全文索引重建结束，共处理 ${totalUpdated} 条记录，失败批次 ${failedBatches}。`,
      );
    } catch (globalErr) {
      // 8. 异常兜底，防止前端状态卡死在 running
      await setRedisCache(
        "status:rebuild:music",
        {
          status: "error",
          message: "服务器后台任务异常中断",
        },
        60,
      );
      console.error(
        "[RebuildMusicSearch] 索引重建后台任务发生严重异常:",
        globalErr,
      );
    } finally {
      isRebuilding = false; // 🔓 解除原子锁
      await pool?.end().catch((err) => {
        console.error("[RebuildMusicSearch] 关闭连接池失败:", err);
      });
    }
  });

  // 响应秒回前端
  return {
    success: true,
    message:
      "音乐全文索引重建任务已在后台异步启动，请通过状态接口或服务器日志关注进度。",
  };
});
