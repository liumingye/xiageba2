import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Redis 客户端生命周期测试
 *
 * 覆盖三类历史 Bug：
 * 1. retryStrategy 在 times > 3 返回 null → ioredis 停止重连、status 置 "end"，
 *    而复用分支只比配置签名不看 status → 死客户端被永久复用，只能重启进程恢复
 * 2. await client.connect() 在重试期间永不 settle → 请求挂死
 * 3. 未接管 error 事件 → 连接故障在监控上完全不可见
 */

const h = vi.hoisted(() => {
  class FakeRedis {
    status = "wait";
    options: any;
    listeners: Record<string, Function[]> = {};
    disconnectCalled = false;
    store = new Map<string, string>();

    constructor(options: any) {
      this.options = options;
      (globalThis as any).__redisInstances.push(this);
    }
    async connect() {
      const s = (globalThis as any).__redisMode;
      if (s === "fail") throw new Error("ECONNREFUSED");
      if (s === "hang") return new Promise<void>(() => {}); // 永不 settle
      this.status = "ready";
    }
    disconnect() {
      this.disconnectCalled = true;
      this.status = "end";
    }
    on(ev: string, fn: Function) {
      (this.listeners[ev] ||= []).push(fn);
    }
    async get(k: string) {
      return this.store.get(k) ?? null;
    }
    async set(k: string, v: string) {
      this.store.set(k, v);
      return "OK";
    }
    async del(k: string) {
      return this.store.delete(k) ? 1 : 0;
    }
    async mget(...keys: string[]) {
      return keys.map((k) => this.store.get(k) ?? null);
    }
    pipeline() {
      (globalThis as any).__pipelineCount++;
      const self = this;
      const cmds: string[][] = [];
      const api = {
        set(...args: string[]) {
          cmds.push(args);
          return api;
        },
        async exec() {
          for (const [k, v] of cmds) self.store.set(k, v);
          return cmds.map(() => [null, "OK"]);
        },
      };
      return api;
    }
  }

  return {
    FakeRedis,
    cfg: {} as Record<string, string>,
  };
});

(globalThis as any).__redisInstances = [];
(globalThis as any).__redisMode = "ok";
(globalThis as any).__pipelineCount = 0;

vi.mock("ioredis", () => ({ Redis: h.FakeRedis }));

vi.mock("#server/lib/configCache", () => ({
  getConfigValues: async (keys: string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = h.cfg[k] ?? "";
    return out;
  },
}));

/** 每次拿一个全新的模块实例，重置内部的 redis / initPromise 状态 */
const fresh = async () => {
  vi.resetModules();
  return await import("./redis");
};

const instances = () => (globalThis as any).__redisInstances as any[];

beforeEach(() => {
  (globalThis as any).__redisInstances = [];
  (globalThis as any).__redisMode = "ok";
  (globalThis as any).__pipelineCount = 0;
  h.cfg = {
    redis_host: "127.0.0.1",
    redis_port: "6379",
    redis_db: "0",
    redis_password: "",
  };
});

describe("连接复用与自愈", () => {
  it("正常连接被复用，不会重复建连", async () => {
    const m = await fresh();
    const c1 = await m.getRedis();
    const c2 = await m.getRedis();

    expect(c1).not.toBeNull();
    expect(c2).toBe(c1);
    expect(instances()).toHaveLength(1);
  });

  it("status 为 end 的死连接会被丢弃重建，而不是永久复用", async () => {
    const m = await fresh();
    const c1 = (await m.getRedis()) as any;

    // 模拟 ioredis 放弃重连（旧 retryStrategy 返回 null 后的真实状态）
    c1.status = "end";

    const c2 = (await m.getRedis()) as any;

    expect(c2).not.toBe(c1); // 换了新实例
    expect(c1.disconnectCalled).toBe(true); // 旧的被显式关闭
    expect(instances()).toHaveLength(2);
  });

  it("正在重连中的连接（reconnecting）不会被误判为死连接", async () => {
    const m = await fresh();
    const c1 = (await m.getRedis()) as any;
    c1.status = "reconnecting"; // ioredis 正在自愈

    const c2 = await m.getRedis();

    expect(c2).toBe(c1); // 复用，交给 ioredis 自己重连
    expect(instances()).toHaveLength(1);
  });
});

describe("建连失败的处理", () => {
  it("失败后进入冷却期，冷却期内不再重复建连（不阻塞请求）", async () => {
    (globalThis as any).__redisMode = "fail";
    const m = await fresh();

    expect(await m.getRedis()).toBeNull();
    const afterFirst = instances().length;

    // 第二次调用：冷却期内，应立刻返回 null 且不再 new Redis
    expect(await m.getRedis()).toBeNull();
    expect(instances().length).toBe(afterFirst);

    // 失败的客户端必须被关闭，否则 socket / 重试定时器泄漏
    expect(instances().at(-1).disconnectCalled).toBe(true);
  });

  it(
    "connect 永不 settle 时，在超时窗口内返回 null 而不是永久挂起",
    async () => {
      (globalThis as any).__redisMode = "hang";
      const m = await fresh();

      const start = Date.now();
      const result = await m.getRedis();
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
      // 5s 硬超时兜底；没有它会一直挂到调用方超时
      expect(elapsed).toBeGreaterThanOrEqual(4_000);
      expect(elapsed).toBeLessThan(12_000);
    },
    20_000,
  );
});

describe("客户端配置", () => {
  it("retryStrategy 永不返回 null，保证 Redis 恢复后能自动重连", async () => {
    const m = await fresh();
    await m.getRedis();

    const { retryStrategy } = instances()[0].options;
    for (const times of [1, 3, 4, 10, 100]) {
      expect(retryStrategy(times)).not.toBeNull();
      expect(typeof retryStrategy(times)).toBe("number");
    }
  });

  it("接管了 error 事件，避免故障静默", async () => {
    const m = await fresh();
    await m.getRedis();
    expect(instances()[0].listeners["error"]?.length).toBe(1);
  });

  it("设置了命令级超时与重试上限", async () => {
    const m = await fresh();
    await m.getRedis();

    const o = instances()[0].options;
    expect(o.commandTimeout).toBeGreaterThan(0);
    expect(o.connectTimeout).toBeGreaterThan(0);
    expect(o.maxRetriesPerRequest).toBeGreaterThan(0);
  });
});

describe("未配置 Redis", () => {
  it("host 为空时返回 null 且不建连", async () => {
    h.cfg.redis_host = "";
    const m = await fresh();

    expect(await m.getRedis()).toBeNull();
    expect(instances()).toHaveLength(0);
  });
});

describe("批量读写（供链接检测等场景使用）", () => {
  it("mget 一次 RTT 读完，并按入参顺序返回", async () => {
    const m = await fresh();
    const c = (await m.getRedis()) as any;
    c.store.set("k1", JSON.stringify("v1"));
    c.store.set("k3", JSON.stringify("v3"));

    const res = await m.getRedisCacheMany<string>(["k1", "k2", "k3"]);

    expect(res).toEqual(["v1", null, "v3"]);
  });

  it("单个坏 value 只影响自己，不拖累整批", async () => {
    const m = await fresh();
    const c = (await m.getRedis()) as any;
    c.store.set("bad", "这不是 JSON");
    c.store.set("good", JSON.stringify({ a: 1 }));

    const res = await m.getRedisCacheMany<any>(["bad", "good"]);

    expect(res[0]).toBeNull();
    expect(res[1]).toEqual({ a: 1 });
  });

  it("Redis 不可用时返回全 null，不抛错", async () => {
    h.cfg.redis_host = "";
    const m = await fresh();

    expect(await m.getRedisCacheMany<string>(["a", "b"])).toEqual([null, null]);
  });

  it("批量写入走 pipeline，一次提交而非 N 次", async () => {
    const m = await fresh();
    await m.setRedisCacheMany([
      { key: "a", value: 1, ttlSeconds: 60 },
      { key: "b", value: 2, ttlSeconds: 60 },
      { key: "c", value: 3, ttlSeconds: 60 },
    ]);

    expect((globalThis as any).__pipelineCount).toBe(1);
  });

  it("空数组不发起任何命令", async () => {
    const m = await fresh();
    await m.setRedisCacheMany([]);
    await m.getRedisCacheMany<string>([]);

    expect((globalThis as any).__pipelineCount).toBe(0);
  });
});
