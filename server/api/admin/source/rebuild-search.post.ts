import { Pool } from "pg";
import { buildTokens } from "#server/utils/jieba";
import { clearTreeSymbols } from "#server/utils/source";
import { setRedisCache } from "#server/lib/redis";
import { TREE_MAX_LINE } from "#server/lib/const";

// 🔒 全局互斥状态锁，防止高并发下重复触发运维任务
let isRebuilding = false;

export default defineEventHandler(async (event) => {
  // 1. 拦截并发触发
  if (isRebuilding) {
    throw createError({
      statusCode: 423,
      message: "当前已有资源全文索引重建任务在后台运行中，请勿重复触发",
    });
  }

  const { all } = await readBody(event);

  // 标记加锁
  isRebuilding = true;

  // 2. ⚡ 立即返回响应，转入后台异步执行（防止前端客户端因长连接超时报错）
  // 利用 Node.js 的事件循环，在当前 tick 结束后开始执行后台繁重任务
  setImmediate(async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
    });

    const taskType = all ? "all" : "inc"; // 区分全量还是增量

    try {
      console.log(`[RebuildSearch] 开始重建全文索引...`);

      const CHUNK_SIZE = 200;
      let lastId = "";
      let totalUpdated = 0;
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
        } catch (updateErr) {
          console.error(`[RebuildSearch] 批次更新失败`, updateErr);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // ⚡ 【新增改动点 2】：整个遍历任务圆满结束，将状态标记为 done，保持 60 秒供前端读取最终状态
      await setRedisCache(
        `status:rebuild:source`,
        {
          status: "done",
          current: totalUpdated,
          type: taskType,
          updatedAt: Date.now(),
        },
        60,
      );

      console.log(`[RebuildSearch] 全文索引重建任务成功结束`);
    } catch (globalErr) {
      // ⚡ 【新增改动点 3】：如果中途发生严重崩溃，写入错误状态，防止前端无限等待
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
      await pool.end();
      isRebuilding = false;
    }
  });

  // 立即给管理员反馈，不阻塞 HTTP 请求
  return {
    success: true,
    message: "全文索引重建任务已在后台异步启动，请查看服务器日志关注进度。",
  };
});
