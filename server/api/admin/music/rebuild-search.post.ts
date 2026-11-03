import {
  createSearchRebuildTask,
  rebuildAlreadyRunning,
} from "#server/lib/rebuild-search";

const rebuildTask = createSearchRebuildTask("music");

export default defineEventHandler(async (event) => {
  // 先解析请求体；start 内部同步完成检查与置锁，避免并发任务同时启动。
  const { all } = await readBody(event);

  if (!rebuildTask.start(all)) {
    throw rebuildAlreadyRunning("音乐");
  }

  return {
    success: true,
    message:
      "音乐全文索引重建任务已在后台异步启动，请通过状态接口或服务器日志关注进度。",
  };
});
