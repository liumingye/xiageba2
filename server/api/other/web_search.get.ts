import { webSearchConcurrent } from "#server/lib/webSearch";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const title = query.title as string;

  if (!title?.trim()) {
    throw createError({ statusCode: 400, message: "缺少 title 参数" });
  }

  const keyword = title.replace(/"/g, "").trim();

  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");

  const nodeRes = event.node.res;
  nodeRes.statusCode = 200;

  const send = (data: any) => {
    nodeRes.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "start", keyword });

  try {
    // 使用并发搜索，实时返回结果
    const totalCount = await webSearchConcurrent(keyword, (results) => {
      // 每个搜索源完成后立即发送结果
      for (const item of results) {
        send({ type: "result", data: item });
      }
    });

    send({ type: "done", count: totalCount });
  } catch (err: any) {
    send({ type: "error", message: err.message || "搜索失败" });
  } finally {
    nodeRes.end();
  }
});
