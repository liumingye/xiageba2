// 百度网盘小说工具函数测试
// 对应源码：server/utils/novel.ts
//
// 仅测试纯函数：buildQuery / cleanCoverImage / mapBookItem。
// getRandomBaiduCookie 依赖 accountCache，已 mock。
// fetchBaiduNovel 依赖 fetch，用 stubGlobal 替换后测试超时与错误转换。
// parseBaiduNovelResponse 依赖 Nitro createError 全局，未覆盖。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mock #server/lib/accountCache 防止 Prisma 在模块加载时被实例化
vi.mock("#server/lib/accountCache", () => ({
  getRandomAccountByType: vi.fn(),
}));

import {
  BAIDU_BASE,
  BAIDU_HEADERS,
  CHROME_UA,
  buildQuery,
  cleanCoverImage,
  mapBookItem,
  fetchBaiduNovel,
} from "./novel";

describe("常量", () => {
  it("BAIDU_BASE 指向 pan.baidu.com", () => {
    expect(BAIDU_BASE).toBe("https://pan.baidu.com");
  });

  it("CHROME_UA 含 Chrome 标识", () => {
    expect(CHROME_UA).toContain("Chrome");
    expect(CHROME_UA).toContain("Mozilla");
  });

  it("BAIDU_HEADERS 含 UA 与 accept-encoding", () => {
    expect(BAIDU_HEADERS["User-Agent"]).toBe(CHROME_UA);
    expect(BAIDU_HEADERS["accept-encoding"]).toBe("gzip, deflate");
  });
});

describe("buildQuery", () => {
  it("过滤 undefined / null / 空字符串的参数", () => {
    const q = buildQuery({
      a: "1",
      b: undefined,
      c: null,
      d: "",
      e: "2",
    });
    expect(q).toBe("a=1&e=2");
  });

  it("所有参数有效时全部拼接", () => {
    expect(buildQuery({ foo: "bar", x: "y" })).toBe("foo=bar&x=y");
  });

  it("空对象返回空串", () => {
    expect(buildQuery({})).toBe("");
  });

  it("数字与布尔被 String() 转换", () => {
    const q = buildQuery({ n: 123, b: true });
    expect(q).toContain("n=123");
    expect(q).toContain("b=true");
  });

  it("特殊字符被 URLSearchParams 自动编码（空格编码为 +）", () => {
    const q = buildQuery({ k: "中文 & 参数" });
    // URLSearchParams.toString() 用 form-encoding：空格 → "+"
    // encodeURIComponent 用 %20；两者不等价，这里以 URLSearchParams 行为准
    const expected = "k=" + encodeURIComponent("中文 & 参数").replace(/%20/g, "+");
    expect(q).toBe(expected);
  });
});

describe("cleanCoverImage", () => {
  it("剥离首尾成对反引号", () => {
    expect(cleanCoverImage("`http://example.com/a.jpg`")).toBe(
      "http://example.com/a.jpg",
    );
  });

  it("无反引号时原样返回", () => {
    expect(cleanCoverImage("http://example.com/a.jpg")).toBe(
      "http://example.com/a.jpg",
    );
  });

  it("仅首部反引号也被剥离", () => {
    expect(cleanCoverImage("`http://example.com/a.jpg")).toBe(
      "http://example.com/a.jpg",
    );
  });

  it("仅尾部反引号也被剥离", () => {
    expect(cleanCoverImage("http://example.com/a.jpg`")).toBe(
      "http://example.com/a.jpg",
    );
  });

  it("undefined 返回空串", () => {
    expect(cleanCoverImage(undefined)).toBe("");
  });

  it("null 返回空串", () => {
    expect(cleanCoverImage(null)).toBe("");
  });

  it("空串返回空串", () => {
    expect(cleanCoverImage("")).toBe("");
  });

  it("非字符串输入被 String 转换", () => {
    expect(cleanCoverImage(123 as any)).toBe("123");
  });
});

describe("mapBookItem", () => {
  it("完整字段映射", () => {
    const raw = {
      book_id: 123,
      book_name: "测试书名",
      author: "作者",
      cover_image: "`cover.jpg`",
      category: "玄幻",
      book_status: "连载",
      cp_name: "百度",
      tag: "热门",
    };
    const mapped = mapBookItem(raw);
    expect(mapped).toEqual({
      bookId: "123",
      bookName: "测试书名",
      author: "作者",
      coverImage: "cover.jpg",
      category: "玄幻",
      bookStatus: "连载",
      cpName: "百度",
      tag: "热门",
    });
  });

  it("bookId 强制转为字符串", () => {
    expect(mapBookItem({ book_id: 999 }).bookId).toBe("999");
    expect(mapBookItem({ book_id: "abc" }).bookId).toBe("abc");
  });

  it("cover_image 反引号被清理", () => {
    expect(mapBookItem({ book_id: 1, cover_image: "`x.jpg`" }).coverImage).toBe(
      "x.jpg",
    );
  });

  it("cover_image 缺失时返回空串", () => {
    expect(mapBookItem({ book_id: 1 }).coverImage).toBe("");
    expect(
      mapBookItem({ book_id: 1, cover_image: undefined }).coverImage,
    ).toBe("");
  });

  it("缺失字段保留 undefined（不强制默认值）", () => {
    const mapped = mapBookItem({ book_id: 1 });
    expect(mapped.bookName).toBeUndefined();
    expect(mapped.author).toBeUndefined();
  });
});

describe("fetchBaiduNovel 超时与错误转换", () => {
  // Nitro 自动导入的 createError 在 vitest 下不存在，stub 一个最小实现
  beforeEach(() => {
    vi.stubGlobal("createError", (opts: any) => ({ ...opts }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 模拟一个只有 signal abort 才 settle 的挂起请求 */
  const hangingFetch = (abortName: string) =>
    vi.fn((_url: string, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: abortName })),
        );
      }),
    );

  it("上游永不响应时，在 timeout 内中止并抛 504", async () => {
    vi.stubGlobal("fetch", hangingFetch("TimeoutError"));

    const start = Date.now();
    await expect(
      fetchBaiduNovel("/api/x", "cookie", { timeout: 300 }),
    ).rejects.toMatchObject({ statusCode: 504 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(250);
    // 没有超时的话这里会一直挂着直到 vitest 15s testTimeout
    expect(elapsed).toBeLessThan(2000);
  });

  it("网络层错误转换为 502，不再裸抛 fetch failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(fetchBaiduNovel("/api/x", "cookie")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("外部 signal 也能中止请求（不等满 timeout）", async () => {
    vi.stubGlobal("fetch", hangingFetch("AbortError"));

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    await expect(
      fetchBaiduNovel("/api/x", "cookie", {
        timeout: 10_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ statusCode: 504 });
  });

  it("正常响应原样透传", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"errno":0}', { status: 200 })),
    );

    const res = await fetchBaiduNovel("/api/x", "cookie");
    expect(res.status).toBe(200);
  });
});
