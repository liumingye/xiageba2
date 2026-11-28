import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 全网搜索（webSearch）测试
 *
 * 覆盖三类历史 Bug：
 * 1. 用户搜索词被当作 String.replace 的替换串：`$&` `$'` `` $` `` `$1` `$$` 会被展开，
 *    请求 URL / 参数被改坏
 * 2. fillParams 走 JSON.stringify → replace → JSON.parse：关键词含引号、反斜杠、换行时
 *    JSON.parse 直接抛错
 * 3. 关键词没有长度上限，会无界地进入请求 URL、Redis 缓存键与并发锁键
 *
 * 用真实本地 HTTP 服务接收请求，断言 axios 实际发出的内容（可验证没有被二次编码）。
 */

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  getRedisCache: vi.fn(),
  setRedisCache: vi.fn(),
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: { apiList: { findMany: h.findMany } },
}));
vi.mock("#server/lib/redis", () => ({
  getRedisCache: h.getRedisCache,
  setRedisCache: h.setRedisCache,
}));
vi.mock("#server/lib/crypto", () => ({
  encryptUrl: async (url: string) => url,
}));
vi.mock("#server/utils/source", () => ({
  getRandomIp: () => "1.2.3.4",
  getRandomUA: () => "ua/1.0",
  removeUrlsStrict: (str: string) => str,
  limitUnicodeString: (str: string) => str,
}));

import {
  isSearchKeywordTooLong,
  MAX_SEARCH_KEYWORD_LENGTH,
  normalizeSearchKeyword,
  testWebSearchConfig,
  webSearchConcurrent,
} from "./webSearch";

interface SeenRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const seen: SeenRequest[] = [];

/** 取本轮唯一捕获到的请求 */
const onlyRequest = (): SeenRequest => {
  const req = seen.at(0);
  if (!req) throw new Error("没有捕获到请求");
  return req;
};
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      seen.push({ method: req.method || "", url: req.url || "", headers: req.headers, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          list: [{ title: "标题", url: "https://pan.quark.cn/s/abc" }],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen.length = 0;
  h.findMany.mockReset();
  h.getRedisCache.mockReset().mockResolvedValue(null);
  h.setRedisCache.mockReset().mockResolvedValue(undefined);
});

const apiConfig = (overrides: Record<string, unknown> = {}) => ({
  type: "api",
  name: "测试源",
  url: `${base}/s?wd={keyword}&p=1`,
  count: 10,
  field_map: JSON.stringify({ list_path: "list" }),
  ...overrides,
});

/** 同时含全部替换串特殊模式与 URL 结构字符的关键词 */
const hostile = `a$&b$'c$\`d$1e$$f 中 %20 +&x#y`;

describe("关键词不会破坏请求", () => {
  it("GET：URL 模板里的关键词被百分号编码，$ 系列字符原样保留，其余参数不受影响", async () => {
    await testWebSearchConfig(apiConfig(), hostile);

    expect(seen).toHaveLength(1);
    // Node 的 URL 解析会把查询串里的 ' 规范化成 %27，其余保持 encodeURIComponent 的结果
    // （关键词里字面的 "%20" 应变成 %2520 且不再被二次编码）
    const encoded = encodeURIComponent(hostile).replaceAll("'", "%27");
    expect(onlyRequest().url).toBe(`/s?wd=${encoded}&p=1`);
    expect(onlyRequest().url).toContain("%2520");
    const query = new URL(onlyRequest().url, base).searchParams;
    expect(query.get("wd")).toBe(hostile);
    expect(query.get("p")).toBe("1");
  });

  it("GET：fixed_params 里的 {keyword} / {kw} 原样替换（含 $& 和 &）", async () => {
    await testWebSearchConfig(
      apiConfig({
        fixed_params: JSON.stringify({
          kw: "{kw}",
          page: 1,
          tag: "x{keyword}y",
          nested: { q: "{keyword}" },
        }),
      }),
      `$&a&b`,
    );

    const query = new URL(onlyRequest().url, base).searchParams;
    expect(query.get("kw")).toBe("$&a&b");
    expect(query.get("page")).toBe("1");
    expect(query.get("tag")).toBe("x$&a&by");
    expect(query.get("nested[q]")).toBe("$&a&b");
  });

  it("POST：关键词含引号、反斜杠、换行时请求体仍是合法 JSON", async () => {
    const keyword = `he said "hi" \\ bye\n$&`;
    await testWebSearchConfig(
      apiConfig({
        method: "post",
        url: `${base}/s`,
        fixed_params: JSON.stringify({
          kw: "{keyword}",
          q: "{kw}",
          note: 'say "hi" \\ ok',
          nested: { list: ["{keyword}", 2, true, null] },
          num: 0,
        }),
      }),
      keyword,
    );

    expect(onlyRequest().method).toBe("POST");
    expect(JSON.parse(onlyRequest().body)).toEqual({
      kw: keyword,
      q: keyword,
      note: 'say "hi" \\ ok',
      nested: { list: [keyword, 2, true, null] },
      num: 0,
    });
  });

  it("HTML 类型：URL 模板里的关键词同样被编码", async () => {
    await testWebSearchConfig(
      {
        type: "html",
        name: "网页源",
        url: `${base}/h?q={keyword}`,
        html_item: "div",
      },
      `a&b#c`,
    );

    expect(onlyRequest().url).toBe(`/h?q=${encodeURIComponent("a&b#c")}`);
  });

  it("请求头里的 {randomip} 占位符仍被替换", async () => {
    await testWebSearchConfig(
      apiConfig({ headers: JSON.stringify({ "X-Forwarded-For": "{randomip}" }) }),
      "test",
    );

    expect(onlyRequest().headers["x-forwarded-for"]).toBe("1.2.3.4");
  });
});

describe("关键词长度有界", () => {
  it("去掉首尾空白", () => {
    expect(normalizeSearchKeyword("  周杰伦 \n")).toBe("周杰伦");
  });

  it(`超过 ${MAX_SEARCH_KEYWORD_LENGTH} 个字符时截断到上限`, () => {
    expect(MAX_SEARCH_KEYWORD_LENGTH).toBe(100);
    expect(normalizeSearchKeyword("x".repeat(150))).toBe("x".repeat(100));
  });

  it("按 Unicode 码点截断，不会切坏代理对", () => {
    const result = normalizeSearchKeyword(`${"中".repeat(99)}😀😀`);
    expect(Array.from(result)).toHaveLength(100);
    expect(result.endsWith("😀")).toBe(true);
  });

  it("空白输入归一为空串", () => {
    expect(normalizeSearchKeyword("   ")).toBe("");
    expect(normalizeSearchKeyword(undefined as unknown as string)).toBe("");
  });

  it("isSearchKeywordTooLong 以同一上限判定", () => {
    expect(isSearchKeywordTooLong("x".repeat(100))).toBe(false);
    expect(isSearchKeywordTooLong("x".repeat(101))).toBe(true);
  });

  it("webSearchConcurrent 用截断后的关键词做缓存键", async () => {
    h.findMany.mockResolvedValue([
      { ...apiConfig({ url: `${base}/s?wd={keyword}` }), status: 1, weight: 1 },
    ]);

    const onResult = vi.fn();
    const count = await webSearchConcurrent("x".repeat(150), onResult);

    expect(count).toBe(1);
    expect(new URL(onlyRequest().url, base).searchParams.get("wd")).toBe("x".repeat(100));
    expect(h.setRedisCache).toHaveBeenCalledWith(
      `webSearch:测试源:${"x".repeat(100)}`,
      expect.any(Array),
      120 * 60,
    );
  });

  it("webSearchConcurrent 收到空关键词时不查库、不发请求", async () => {
    const onResult = vi.fn();
    expect(await webSearchConcurrent("   ", onResult)).toBe(0);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it("testWebSearchConfig 收到空关键词时不发请求", async () => {
    expect(await testWebSearchConfig(apiConfig(), "")).toEqual([]);
    expect(seen).toHaveLength(0);
  });
});
