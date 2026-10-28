import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/source/tree 的入口行为测试。
 *
 * 背景：tree.get.ts 原本 652 行里塞了 5 份递归渲染拷贝，重构后渲染骨架收敛到
 * lib/pan/tree.ts（已有独立单测），本文件只锁两件事：
 * 1. 模块能正常加载（catch 循环依赖、导出缺失这类只在运行期爆炸的问题）
 * 2. 缓存短路与参数校验不被重构破坏 —— 一级 Redis 命中时绝不触发网盘请求
 */

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  redisValue: null as string | null,
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    source: { findUnique: async () => null },
    // simpleAC 在模块加载时会读 Config 表初始化广告/搜索词自动机
    config: { findMany: async () => [] },
    $executeRaw: async () => 0,
  },
}));

vi.mock("#server/lib/redis", () => ({
  getRedisCache: async () => h.redisValue,
  setRedisCache: async () => {},
}));

vi.mock("#server/utils/bot-defense", () => ({
  assertBotDefense: async () => {},
}));

// 网盘账号查询一旦被调用就说明缓存短路失效了，这里直接炸出来
vi.mock("#server/lib/accountCache", () => ({
  getRandomAccountByType: async () => {
    throw new Error("缓存未命中时才会走到这里");
  },
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("getQuery", () => h.query);
vi.stubGlobal("createError", (options: any) =>
  Object.assign(new Error(options?.message ?? "error"), options),
);

const handler = (await import("./tree.get")).default;

const event = { context: {}, method: "GET" } as any;

describe("/api/source/tree", () => {
  beforeEach(() => {
    h.query = {};
    h.redisValue = null;
  });

  it("默认导出是事件处理器", () => {
    expect(typeof handler).toBe("function");
  });

  it("缺少 url 与 id 时返回 400", async () => {
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      message: "缺少参数 url 或 id",
    });
  });

  it("url 与 id 同时存在时返回 400", async () => {
    h.query = { url: "enc:abc", id: "1" };
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      message: "id 和 url 不能同时存在",
    });
  });

  it("Redis 命中时直接返回缓存树，不触发网盘鉴权", async () => {
    h.query = { id: "1" };
    h.redisValue = "已缓存的目录树";

    await expect(handler(event)).resolves.toEqual({
      tree: "已缓存的目录树",
      success: true,
      cache: "redis",
    });
  });
});
