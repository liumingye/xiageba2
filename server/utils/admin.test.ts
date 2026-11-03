import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/utils/admin.ts 公共工具测试
 *
 * 覆盖三类横切样板：分页解析、批量入参校验、Config KV 端点工厂。
 * createConfigKVHandler 是 Nitro handler 工厂，用 stubGlobal 模拟
 * defineEventHandler / readBody / createError，与既有 api 测试同套路。
 */

const h = vi.hoisted(() => ({
  body: {} as any,
  getConfigValues: vi.fn(async () => ({}) as Record<string, string>),
  setConfigValues: vi.fn(async () => ({ success: true })),
  afterSaveCalls: 0,
}));

vi.mock("#server/lib/configCache", () => ({
  getConfigValues: h.getConfigValues,
  setConfigValues: h.setConfigValues,
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async () => h.body);
vi.stubGlobal("createError", (o: any) => ({ ...o }));

const {
  parsePagination,
  paginated,
  parseBatchIds,
  createConfigKVHandler,
} = await import("./admin");

const fakeEvent = (method = "GET") => ({ method });

describe("parsePagination", () => {
  it("缺省时 page=1 / pageSize=20", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });

  it("正常解析 page 与 pageSize", () => {
    expect(parsePagination({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
      skip: 100,
    });
  });

  it("非法值回退默认，不抛错", () => {
    expect(parsePagination({ page: "abc", pageSize: "xyz" })).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(parsePagination({ page: "0", pageSize: "-5" })).toEqual({
      page: 1,
      pageSize: 1,
      skip: 0,
    });
  });

  it("pageSize 超过 100 被钳到 100", () => {
    expect(parsePagination({ page: "2", pageSize: "9999" }).pageSize).toBe(100);
  });

  it("数组型 query 值（?page=1&page=2）不炸", () => {
    expect(parsePagination({ page: ["1", "2"] })).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
    });
  });

  it("支持自定义默认页大小", () => {
    expect(parsePagination({}, { defaultPageSize: 10 }).pageSize).toBe(10);
  });
});

describe("paginated", () => {
  it("信封字段与 totalPages 计算", () => {
    const result = paginated([1, 2], 42, { page: 2, pageSize: 20, skip: 20 });
    expect(result).toEqual({
      data: [1, 2],
      total: 42,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it("total=0 时 totalPages=0（与原 music 搜索分支一致）", () => {
    expect(paginated([], 0, { page: 1, pageSize: 20, skip: 0 }).totalPages).toBe(
      0,
    );
  });
});

describe("parseBatchIds", () => {
  it("过滤非法 id 并去重", () => {
    expect(parseBatchIds(["a", "a", null, 123, {}, "b"], "音乐")).toEqual([
      "a",
      "b",
    ]);
  });

  it("空数组拒绝", () => {
    expect(() => parseBatchIds([], "资源")).toThrowError(
      expect.objectContaining({ statusCode: 400, message: "缺少资源ID列表" }),
    );
  });

  it("非数组拒绝", () => {
    expect(() => parseBatchIds("abc", "音乐")).toThrowError(
      expect.objectContaining({ message: "缺少音乐ID列表" }),
    );
  });

  it("超量拒绝（上限 1000）", () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `id${i}`);
    expect(() => parseBatchIds(ids, "音乐")).toThrowError(
      expect.objectContaining({ message: "单次最多操作 1000 条" }),
    );
  });

  it("过滤后为空时拒绝", () => {
    expect(() => parseBatchIds([1, 2, null], "音乐")).toThrowError(
      expect.objectContaining({ message: "音乐ID列表为空" }),
    );
  });
});

describe("createConfigKVHandler", () => {
  beforeEach(() => {
    h.body = {};
    h.getConfigValues.mockClear();
    h.setConfigValues.mockClear();
    h.afterSaveCalls = 0;
  });

  it("GET 返回 { data }，读传入的键", async () => {
    h.getConfigValues.mockResolvedValueOnce({ a: "1", b: "2" });
    const handler = createConfigKVHandler(["a", "b"]);

    const res = await handler(fakeEvent() as any);

    expect(h.getConfigValues).toHaveBeenCalledWith(["a", "b"]);
    expect(res).toEqual({ data: { a: "1", b: "2" } });
  });

  it("POST 只写入 body 中显式出现的键", async () => {
    h.body = { redis_host: "127.0.0.1", redis_password: "" };
    const handler = createConfigKVHandler([
      "redis_host",
      "redis_port",
      "redis_password",
    ]);

    await handler(fakeEvent("POST") as any);

    expect(h.setConfigValues).toHaveBeenCalledWith([
      { key: "redis_host", value: "127.0.0.1" },
      { key: "redis_password", value: "" },
    ]);
  });

  it("POST 后调用 afterSave 钩子", async () => {
    h.body = { aes_key: "k" };
    const handler = createConfigKVHandler(["aes_key"], {
      afterSave: () => {
        h.afterSaveCalls++;
      },
    });

    await handler(fakeEvent("POST") as any);
    expect(h.afterSaveCalls).toBe(1);
  });

  it("normalizeValue 定制序列化（site-seo 的 trim 语义）", async () => {
    h.body = { site_seo_title: "  标题  " };
    const handler = createConfigKVHandler(["site_seo_title"], {
      normalizeValue: (v) => (v ? String(v).trim() : ""),
    });

    await handler(fakeEvent("POST") as any);
    expect(h.setConfigValues).toHaveBeenCalledWith([
      { key: "site_seo_title", value: "标题" },
    ]);
  });

  it("其他方法返回 405", async () => {
    const handler = createConfigKVHandler(["a"]);
    await expect(handler(fakeEvent("DELETE") as any)).rejects.toThrowError(
      expect.objectContaining({ statusCode: 405 }),
    );
  });
});
