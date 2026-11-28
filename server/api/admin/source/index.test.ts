import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 后台资源接口契约测试：改为调用共享服务后，响应结构与 409 透传必须保持不变。
 */

const h = vi.hoisted(() => ({
  query: {} as Record<string, any>,
  body: {} as any,
  searchArgs: [] as any[],
  createArgs: [] as any[],
}));

vi.mock("#server/lib/sourceService", () => ({
  searchSourcesByKeyword: async (args: any) => {
    h.searchArgs.push(args);
    return { data: [{ id: "s1" }], total: 41 };
  },
  createSources: async (args: any) => {
    h.createArgs.push(args);
    if (args?.dup) {
      return Promise.reject({ statusCode: 409, data: { duplicates: [{ id: "s1" }] } });
    }
    return { success: true, inserted: 1, updated: 0, duplicate: 0, failed: 0 };
  },
}));

vi.mock("#server/lib/categoryCache", () => ({
  getCategoryList: async () => [{ id: 1, name: "分类" }],
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {},
}));

// Nitro 自动导入
vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("getQuery", () => h.query);
vi.stubGlobal("readBody", async () => h.body);
vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));

const { default: handler } = await import("./index");

const run = async (method: string) => {
  try {
    return await handler({ method } as any);
  } catch (e) {
    return e as any;
  }
};

beforeEach(() => {
  h.query = {};
  h.searchArgs = [];
  h.createArgs = [];
});

describe("admin source index", () => {
  it("关键词搜索返回分页信封并附带 categories", async () => {
    h.query = { keyword: "  mp3 ", cid: "2", page: "2", pageSize: "10" };

    const res: any = await run("GET");

    expect(res).toEqual({
      data: [{ id: "s1" }],
      total: 41,
      page: 2,
      pageSize: 10,
      totalPages: 5,
      categories: [{ id: 1, name: "分类" }],
    });
    // 后台搜索不过滤状态
    expect(h.searchArgs[0]).toEqual({
      keyword: "mp3",
      cid: 2,
      pagination: { page: 2, pageSize: 10, skip: 10 },
    });
  });

  it("POST 把请求体原样交给服务并返回结果", async () => {
    h.body = { title: "t", urls: ["a"], skipDuplicates: true };

    expect(await run("POST")).toEqual({
      success: true,
      inserted: 1,
      updated: 0,
      duplicate: 0,
      failed: 0,
    });
    expect(h.createArgs[0]).toEqual(h.body);
  });

  it("服务抛出的 409（含 duplicates）原样透传给前端", async () => {
    h.body = { title: "t", urls: ["a"], dup: true };

    const res: any = await run("POST");

    expect(res.statusCode).toBe(409);
    expect(res.data).toEqual({ duplicates: [{ id: "s1" }] });
  });

  it("不支持的方法返回 405", async () => {
    expect(await run("PATCH")).toMatchObject({ statusCode: 405 });
  });
});
