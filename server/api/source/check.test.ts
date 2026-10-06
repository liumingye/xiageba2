import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 链接检测接口测试
 *
 * 重点锁定两类历史 Bug：
 * 1. 数量上限校验放在昂贵操作之后 → 攻击者 POST 一万个 id 就能打出
 *    上万次 Redis GET + 一条万元素的 IN 查询 + 上万次 AES 解密
 * 2. 循环内逐个 await → N+1 次 Redis RTT、N 次 importKey
 */

const h = vi.hoisted(() => ({
  body: {} as any,
  redisCalls: 0,
  redisKeyCount: 0,
  findManyCalls: 0,
  decryptCalls: 0,
  submitCalls: 0,
  sources: [] as { id: string; url: string }[],
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    source: {
      findMany: async () => {
        h.findManyCalls++;
        return h.sources;
      },
    },
  },
}));

vi.mock("#server/lib/crypto", () => ({
  decryptUrls: async (list: string[]) => {
    h.decryptCalls++;
    return list.map((u) => `plain:${u}`);
  },
}));

vi.mock("#server/lib/redis", () => ({
  getRedisCacheMany: async (keys: string[]) => {
    h.redisCalls++;
    h.redisKeyCount = keys.length;
    return keys.map(() => null);
  },
  setRedisCacheMany: async () => {},
}));

vi.mock("#server/lib/pan-check", () => ({
  submitCheckRequest: async () => {
    h.submitCalls++;
    return { server_id: 1 };
  },
  resolveLinkStatus: () => "valid" as const,
}));

// Nitro 自动导入：defineEventHandler 直接返回原函数，便于直接调用
vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async () => h.body);
vi.stubGlobal("createError", (o: any) => ({ ...o }));

const { default: handler } = await import("./check");

const fakeEvent = () => ({ method: "POST", headers: { set: () => {} } });

beforeEach(() => {
  h.body = {};
  h.redisCalls = 0;
  h.redisKeyCount = 0;
  h.findManyCalls = 0;
  h.decryptCalls = 0;
  h.submitCalls = 0;
  h.sources = [];
});

describe("数量上限校验", () => {
  it("ids 超量时直接拒绝，且不读缓存、不查库", async () => {
    h.body = { ids: Array.from({ length: 100 }, (_, i) => `id${i}`) };

    const res: any = await handler(fakeEvent() as any);

    expect(res.success).toBe(false);
    // 旧实现会先跑 100 次 getRedisCache 再在这里拒绝
    expect(h.redisCalls).toBe(0);
    expect(h.findManyCalls).toBe(0);
  });

  it("urls 超量时在解密之前拦截，不产生任何 AES 开销", async () => {
    h.body = { urls: Array.from({ length: 100 }, (_, i) => `u${i}`) };

    const res: any = await handler(fakeEvent() as any);

    expect(res.success).toBe(false);
    expect(h.decryptCalls).toBe(0);
    expect(h.redisCalls).toBe(0);
  });

  it("刚好等于上限时放行", async () => {
    h.body = { ids: Array.from({ length: 20 }, (_, i) => `id${i}`) };

    await handler(fakeEvent() as any);

    expect(h.redisCalls).toBe(1); // 走到了批量读缓存
  });
});

describe("批量化", () => {
  it("N 个 id 只发起一次 mget，而不是 N 次", async () => {
    h.body = { ids: ["a", "b", "c"] };
    h.sources = [{ id: "a", url: "https://pan.quark.cn/s/a" }];

    await handler(fakeEvent() as any);

    expect(h.redisCalls).toBe(1);
    expect(h.redisKeyCount).toBe(3);
    expect(h.findManyCalls).toBe(1);
  });

  it("N 个 url 只准备一次密钥材料（一次批量解密）", async () => {
    h.body = { urls: ["x", "y", "z"] };

    await handler(fakeEvent() as any);

    // 旧实现是循环内逐个 decryptUrl，这里是 1 次
    expect(h.decryptCalls).toBe(1);
  });

  it("输入去重后按唯一值处理", async () => {
    h.body = { ids: ["a", "a", "b", "b", "a"] };

    await handler(fakeEvent() as any);

    expect(h.redisKeyCount).toBe(2);
  });

  it("过滤掉非字符串脏数据", async () => {
    h.body = { ids: ["a", null, 123, {}, "b"] };

    await handler(fakeEvent() as any);

    expect(h.redisKeyCount).toBe(2);
  });
});

describe("无有效输入", () => {
  it("空请求返回没有有效的链接", async () => {
    h.body = {};

    const res: any = await handler(fakeEvent() as any);

    expect(res.success).toBe(false);
    expect(h.redisCalls).toBe(0);
  });
});
