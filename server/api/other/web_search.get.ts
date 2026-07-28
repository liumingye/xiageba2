import { webSearchConcurrent, WebSearchResult } from "#server/lib/webSearch";
import {
  automaton_websearch_filter_keywords,
  SimpleAC,
} from "#server/lib/simpleAC";

const filterSearchResults = (
  items: WebSearchResult[],
  automaton: SimpleAC | null,
): WebSearchResult[] => {
  if (!automaton) return items;
  return items.filter((item) => {
    const haystack = (item.title || "").toLowerCase();
    return !automaton.hasMatch(haystack);
  });
};

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
      // 应用过滤词过滤（入缓存前过滤，保证缓存干净）
      const filteredItems = filterSearchResults(
        results,
        automaton_websearch_filter_keywords,
      );
      if (filteredItems.length === 0) return [];
      results = filteredItems;

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
