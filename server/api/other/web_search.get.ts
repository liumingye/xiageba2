import { webSearch } from "#server/lib/webSearch";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const title = query.title as string;

  if (!title?.trim()) {
    throw createError({ statusCode: 400, message: "缺少 title 参数" });
  }

  const keyword = title.trim();

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
    let count = 0;

    for await (const item of webSearch(keyword)) {
      send({ type: "result", data: item });
      count++;
    }

    send({ type: "done", count });
  } catch (err: any) {
    send({ type: "error", message: err.message || "搜索失败" });
  } finally {
    nodeRes.end();
  }
});
