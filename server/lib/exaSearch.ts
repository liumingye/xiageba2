/**
 * Exa 网页搜索 —— 走官方托管 MCP 端点（https://mcp.exa.ai/mcp）
 *
 * 供 AI 搜索的 search_web 工具调用：把用户的问题交给 Exa 做开放网络检索，
 * 返回标题 + 摘要 + 链接，作为大模型回答事实类问题的依据。
 *
 * 为什么走 MCP 而不是 REST（https://api.exa.ai/search）：
 * - REST 端点已启用 x402 付费墙（无 API Key 直接 402），而托管 MCP 端点支持
 *   匿名限流访问，无 Key 也能跑通，降低接入门槛。
 *
 * MCP 协议要点（Streamable HTTP）：
 * 1. POST initialize → 响应头带 mcp-session-id，后续请求需回传
 * 2. POST notifications/initialized
 * 3. POST tools/call { name: "web_search_exa", arguments: { query, numResults } }
 * 响应为 text/event-stream，取 data: 行的 JSON。
 */

export interface ExaWebResult {
  title: string;
  url: string;
  /** 正文摘要（截断后），可能为空 */
  text: string;
  /** 结果发布时间，ISO 字符串，可能为空 */
  publishedDate: string;
}

const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const EXA_TIMEOUT_MS = 20_000;
/** 单条摘要的最大长度：够模型引用事实，又不撑爆上下文 */
const MAX_TEXT_LENGTH = 400;

interface McpContent {
  type: string;
  text?: string;
}

interface McpToolResult {
  content?: McpContent[];
  isError?: boolean;
}

/** 解析 SSE 响应体，取最后一个 data: 行的 JSON-RPC 消息 */
const parseSseJson = (raw: string): any | null => {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      return JSON.parse(payload);
    } catch {
      // 单行解析失败继续找下一条
    }
  }
  return null;
};

/**
 * 解析 web_search_exa 返回的纯文本结果块。
 *
 * Exa MCP 把所有结果拼成一个 text 内容块，条目之间用 `\n---\n` 分隔，
 * 单条结构固定为：
 *   Title: xxx
 *   URL: xxx
 *   Published: xxx | N/A
 *   Author: xxx | N/A
 *   Highlights:
 *   <摘要正文>
 */
export const parseExaTextBlocks = (text: string): ExaWebResult[] => {
  const results: ExaWebResult[] = [];
  for (const block of text.split(/\n---\n/)) {
    const segment = block.trim();
    if (!segment) continue;

    const title = /^Title:\s*(.*)$/m.exec(segment)?.[1]?.trim() || "";
    const url = /^URL:\s*(.*)$/m.exec(segment)?.[1]?.trim() || "";
    const publishedRaw = /^Published:\s*(.*)$/m.exec(segment)?.[1]?.trim() || "";
    if (!title || !url) continue;

    // Highlights: 之后是摘要正文；没有该头则整段去掉头部元数据后兜底
    const highlightsIdx = segment.indexOf("Highlights:");
    const textBody =
      highlightsIdx >= 0
        ? segment.slice(highlightsIdx + "Highlights:".length)
        : segment;

    results.push({
      title,
      url,
      text: textBody.trim().slice(0, MAX_TEXT_LENGTH),
      publishedDate:
        publishedRaw && publishedRaw !== "N/A" ? publishedRaw : "",
    });
  }
  return results;
};

/** 一个 MCP 会话：sessionId + 自增 id，串行复用以省握手 */
interface McpSession {
  sessionId: string;
  nextId: number;
}

let cachedSession: McpSession | null = null;

const mcpHeaders = (sessionId?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return headers;
};

const postMcp = async (body: object, sessionId?: string) => {
  const res = await fetch(EXA_MCP_URL, {
    method: "POST",
    headers: mcpHeaders(sessionId),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
  });
  return res;
};

/** 建立（或复用）MCP 会话；失败时返回 null 由调用方降级 */
const ensureSession = async (): Promise<McpSession | null> => {
  if (cachedSession) return cachedSession;

  try {
    const initRes = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "xiageba-ai-search", version: "1.0" },
      },
    });
    if (!initRes.ok) return null;

    const sid = initRes.headers.get("mcp-session-id") || "";
    await initRes.text(); // 消费响应体，释放连接

    // initialized 通知（无 id，无需读响应体）
    await postMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);

    cachedSession = { sessionId: sid, nextId: 2 };
    return cachedSession;
  } catch {
    return null;
  }
};

/** 会话失效时清缓存，下次调用重连 */
const invalidateSession = () => {
  cachedSession = null;
};

/**
 * 调用 Exa web_search_exa 检索网页。
 *
 * @param query 检索词（由模型给出，自然语言描述目标页面最佳）
 * @param numResults 召回条数，内部夹到 1-10
 */
export async function searchExaWeb(
  query: string,
  numResults = 5,
): Promise<ExaWebResult[]> {
  const term = (query || "").trim();
  if (!term) return [];

  const count = Math.min(Math.max(1, numResults), 10);

  // 会话可能已过期：失败时重连重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await ensureSession();
    if (!session) return [];

    try {
      const res = await postMcp(
        {
          jsonrpc: "2.0",
          id: session.nextId++,
          method: "tools/call",
          params: {
            name: "web_search_exa",
            arguments: { query: term, numResults: count },
          },
        },
        session.sessionId,
      );

      // 会话过期 → 重连
      if (res.status === 404 || res.status === 400) {
        invalidateSession();
        continue;
      }
      if (!res.ok) {
        console.error(`Exa MCP 网页搜索失败: HTTP ${res.status}`);
        return [];
      }

      const raw = await res.text();
      const msg = parseSseJson(raw);
      const result: McpToolResult | undefined = msg?.result;
      if (msg?.error || result?.isError) {
        console.error("Exa MCP 网页搜索返回错误:", msg?.error || result);
        return [];
      }

      const text = (result?.content || [])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");

      return parseExaTextBlocks(text);
    } catch (err) {
      // 会话类错误重连一次，其余直接降级
      invalidateSession();
      if (attempt === 0) continue;
      console.error("Exa MCP 网页搜索异常:", err);
      return [];
    }
  }

  return [];
}
