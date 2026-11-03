import { createSearchRebuildTask } from "#server/lib/rebuild-search";

const rebuildTask = createSearchRebuildTask("source");

export default defineEventHandler(async (event) => {
  // 先解析请求体；start 内部同步完成检查与置锁，避免并发任务同时启动。
  const { all } = await readBody(event);

  if (!rebuildTask.start(all)) {
    throw createError({
      statusCode: 423,
      message: "当前已有资源全文索引重建任务在后台运行中，请勿重复触发",
    });
  }

  return {
    success: true,
    message: "全文索引重建任务已在后台异步启动，请查看服务器日志关注进度。",
  };
});
