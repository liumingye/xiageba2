// 回归：请求体解析失败不得污染 isRebuilding 锁。
// 旧实现先置锁再 await readBody，一次畸形请求会让后续重建永久返回 423。

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  body: { all: false } as any,
  bodyError: null as Error | null,
  redisWrites: [] as any[],
  poolEndCalls: 0,
}));

// 重建任务用的是进程共享的 dbPool（lib/prisma 导出），不再每次 new Pool()
vi.mock("#server/lib/prisma", () => ({
  dbPool: {
    async query() {
      return { rows: [] };
    },
    end() {
      h.poolEndCalls++;
    },
  },
}));

vi.mock("#server/utils/jieba", () => ({
  buildTokens: () => "tokens",
}));

vi.mock("#server/utils/source", () => ({
  buildSourceSearchTokens: (s: any) => `tokens:${s.title ?? ""}`,
}));

vi.mock("#server/lib/redis", () => ({
  setRedisCache: async (key: string, value: any) => {
    h.redisWrites.push({ key, value });
  },
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async () => {
  if (h.bodyError) throw h.bodyError;
  return h.body;
});
vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));

const { default: handler } = await import("./rebuild-search.post");

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("重建索引锁", () => {
  beforeEach(() => {
    h.body = { all: false };
    h.bodyError = null;
    h.redisWrites = [];
    h.poolEndCalls = 0;
  });

  it("任务结束后不会关闭共享连接池", async () => {
    await expect(handler({} as any)).resolves.toMatchObject({ success: true });

    await tick();
    expect(h.redisWrites.at(-1)?.value?.status).toBe("done");
    // dbPool 是整个进程在用的池，旧实现每轮结束都 end() 一次；换成共享池后绝不能再关
    expect(h.poolEndCalls).toBe(0);
  });

  it("readBody 抛错后锁保持可用，后续请求仍能启动", async () => {
    h.bodyError = new Error("invalid json");
    await expect(handler({} as any)).rejects.toThrow("invalid json");

    h.bodyError = null;
    await expect(handler({} as any)).resolves.toMatchObject({ success: true });

    await tick();
    expect(h.redisWrites.at(-1)?.value?.status).toBe("done");
  });

  it("并发触发只有一个能启动", async () => {
    const [first, second] = await Promise.allSettled([
      handler({} as any),
      handler({} as any),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
    const rejected = [first, second].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.statusCode).toBe(423);

    await tick();
  });
});
