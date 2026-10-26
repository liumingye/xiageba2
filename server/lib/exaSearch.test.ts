import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exa 网页搜索（MCP 通道）测试
 *
 * 覆盖：
 * 1. parseExaTextBlocks：解析 web_search_exa 的纯文本结果块
 * 2. searchExaWeb：MCP 握手（initialize → initialized → tools/call）与 SSE 解析
 * 3. 会话过期自动重连、网络/协议异常静默降级
 *
 * 走 Exa 托管 MCP 的匿名限流通道，不涉及任何 API Key。
 */

const h = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.stubGlobal("fetch", h.fetchMock);

const load = async () => {
  vi.resetModules();
  return await import("./exaSearch");
};

/** 构造一个 MCP SSE 响应 */
const sse = (payload: object, headers: Record<string, string> = {}) => ({
  ok: true,
  status: 200,
  headers: new Map(
    Object.entries({ "mcp-session-id": "sess-1", ...headers }),
  ) as unknown as Headers,
  text: async () => `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
});

const sampleText = [
  "Title: 七里香(专辑) - 维基百科",
  "URL: https://zh.wikipedia.org/wiki/七里香",
  "Published: 2004-08-03",
  "Author: N/A",
  "Highlights:",
  "《七里香》是周杰伦于2004年发行的专辑。",
  "",
  "---",
  "",
  "Title: 七里香 - 电台介绍",
  "URL: https://kissradio.example.com/album/1040",
  "Published: N/A",
  "Author: N/A",
  "Highlights:",
  "发行时间 2004/08/03。",
].join("\n");

describe("parseExaTextBlocks", () => {
  it("解析多条结果块，N/A 发布时间归一为空串", async () => {
    const { parseExaTextBlocks } = await load();
    const items = parseExaTextBlocks(sampleText);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "七里香(专辑) - 维基百科",
      url: "https://zh.wikipedia.org/wiki/七里香",
      publishedDate: "2004-08-03",
    });
    expect(items[0]!.text).toContain("2004年发行");
    expect(items[1]).toMatchObject({
      title: "七里香 - 电台介绍",
      publishedDate: "",
    });
    expect(items[1]!.text).toBe("发行时间 2004/08/03。");
  });

  it("缺 Title/URL 的块被丢弃，空文本返回空数组", async () => {
    const { parseExaTextBlocks } = await load();
    expect(parseExaTextBlocks("")).toEqual([]);
    expect(
      parseExaTextBlocks("Title: 只有标题没链接\nHighlights: x"),
    ).toEqual([]);
  });

  it("摘要被截断到 MAX_TEXT_LENGTH", async () => {
    const { parseExaTextBlocks } = await load();
    const long = `Title: t\nURL: u\nHighlights:\n${"长".repeat(1000)}`;
    expect(parseExaTextBlocks(long)[0]!.text).toHaveLength(400);
  });
});

describe("searchExaWeb", () => {
  beforeEach(() => {
    h.fetchMock.mockReset();
  });

  /** 布好 MCP 握手 + tools/call 的完整 mock 链 */
  const mockHappyPath = (resultText: string) => {
    h.fetchMock
      .mockResolvedValueOnce(sse({ result: {} })) // initialize
      .mockResolvedValueOnce(sse({ result: {} })) // initialized 通知
      .mockResolvedValueOnce(
        sse({
          result: { content: [{ type: "text", text: resultText }] },
        }),
      ); // tools/call
  };

  it("query 为空时直接返回空数组、不发请求", async () => {
    const { searchExaWeb } = await load();
    await expect(searchExaWeb("   ")).resolves.toEqual([]);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("完成 MCP 握手并调用 web_search_exa，解析结果", async () => {
    mockHappyPath(sampleText);

    const { searchExaWeb } = await load();
    const items = await searchExaWeb("周杰伦 七里香", 5);

    expect(items).toHaveLength(2);
    expect(h.fetchMock).toHaveBeenCalledTimes(3);

    // 第 1 发：initialize
    const initBody = JSON.parse(h.fetchMock.mock.calls[0]![1].body);
    expect(initBody.method).toBe("initialize");

    // 第 3 发：tools/call，带 session id（匿名调用，不带任何鉴权头）
    const [, callInit] = h.fetchMock.mock.calls[2]!;
    expect(callInit.headers["mcp-session-id"]).toBe("sess-1");
    expect(callInit.headers["x-api-key"]).toBeUndefined();
    const callBody = JSON.parse(callInit.body);
    expect(callBody.method).toBe("tools/call");
    expect(callBody.params.name).toBe("web_search_exa");
    expect(callBody.params.arguments).toEqual({
      query: "周杰伦 七里香",
      numResults: 5,
    });
  });

  it("numResults 被夹到 1-10 区间", async () => {
    mockHappyPath("");
    const { searchExaWeb } = await load();
    await searchExaWeb("a", 999);
    const callBody = JSON.parse(h.fetchMock.mock.calls[2]![1].body);
    expect(callBody.params.arguments.numResults).toBe(10);
  });

  it("MCP 返回 isError 时静默降级为空数组", async () => {
    h.fetchMock
      .mockResolvedValueOnce(sse({ result: {} }))
      .mockResolvedValueOnce(sse({ result: {} }))
      .mockResolvedValueOnce(
        sse({ result: { isError: true, content: [{ type: "text", text: "boom" }] } }),
      );
    const { searchExaWeb } = await load();
    await expect(searchExaWeb("x")).resolves.toEqual([]);
  });

  it("会话过期（404）时重连后成功", async () => {
    h.fetchMock
      // 第一轮：initialize + initialized + tools/call(404)
      .mockResolvedValueOnce(sse({ result: {} }))
      .mockResolvedValueOnce(sse({ result: {} }))
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), text: async () => "" })
      // 第二轮：重连 + tools/call 成功
      .mockResolvedValueOnce(sse({ result: {} }, { "mcp-session-id": "sess-2" }))
      .mockResolvedValueOnce(sse({ result: {} }))
      .mockResolvedValueOnce(
        sse({ result: { content: [{ type: "text", text: sampleText }] } }),
      );

    const { searchExaWeb } = await load();
    const items = await searchExaWeb("周杰伦");
    expect(items).toHaveLength(2);
    expect(h.fetchMock).toHaveBeenCalledTimes(6);
  });

  it("网络异常降级返回空数组", async () => {
    h.fetchMock.mockRejectedValue(new Error("network down"));
    const { searchExaWeb } = await load();
    await expect(searchExaWeb("周杰伦")).resolves.toEqual([]);
  });
});
