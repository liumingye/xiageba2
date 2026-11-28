// 回归：服务状态接口对 PG / Redis 的各种探测结果要如实映射到 status，
// 故障不能抛 5xx（页面要靠 status 字段显示异常）。

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pgRows: [
    {
      version:
        "PostgreSQL 16.4 (Debian 16.4-1.pgdg120+1) on x86_64-pc-linux-gnu, compiled by gcc 12.2.0, 64-bit",
    },
  ] as { version: string }[],
  pgError: null as Error | null,
  configError: null as Error | null,
  redisHost: "127.0.0.1",
  redisClient: {
    ping: async () => "PONG",
    info: async () => "# Server\r\nredis_version:7.4.1\r\nredis_mode:standalone\r\n",
  },
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    $queryRaw: async () => {
      if (h.pgError) throw h.pgError;
      return h.pgRows;
    },
  },
}));

vi.mock("#server/lib/configCache", () => ({
  getConfigValues: async () => {
    if (h.configError) throw h.configError;
    return { redis_host: h.redisHost };
  },
}));

vi.mock("#server/lib/redis", () => ({
  getRedis: async () => h.redisClient,
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);

// 接口内有模块级 PG 冷却状态，每个用例都要拿到干净的模块实例
const loadHandler = async () => {
  vi.resetModules();
  const { default: handler } = await import("./services.get");
  return handler as unknown as (event: any) => Promise<any>;
};

describe("服务状态接口", () => {
  beforeEach(() => {
    h.pgError = null;
    h.configError = null;
    h.redisHost = "127.0.0.1";
    h.redisClient = {
      ping: async () => "PONG",
      info: async () =>
        "# Server\r\nredis_version:7.4.1\r\nredis_mode:standalone\r\n",
    };
  });

  it("PG 与 Redis 正常时返回版本与延迟", async () => {
    const handler = await loadHandler();
    const res = await handler({});

    expect(res.checkedAt).toEqual(expect.any(String));
    expect(res.postgres.status).toBe("up");
    expect(res.postgres.version).toBe("PostgreSQL 16.4");
    expect(res.postgres.fullVersion).toContain("Debian");
    expect(res.postgres.latencyMs).toEqual(expect.any(Number));

    expect(res.redis.status).toBe("up");
    expect(res.redis.version).toBe("7.4.1");
    expect(res.redis.latencyMs).toEqual(expect.any(Number));
  });

  it("Redis 未配置（host 为空）返回 unconfigured", async () => {
    h.redisHost = "";
    const handler = await loadHandler();
    const res = await handler({});
    expect(res.redis).toMatchObject({ status: "unconfigured" });
  });

  it("Redis 已配置但不可达（getRedis 返回 null）返回 down", async () => {
    (h as any).redisClient = null;
    const handler = await loadHandler();
    const res = await handler({});
    expect(res.redis).toMatchObject({ status: "down", version: null });
  });

  it("读取 Redis 配置失败返回 unknown，不伪装成 down", async () => {
    h.configError = new Error("db down");
    const handler = await loadHandler();
    const res = await handler({});
    expect(res.redis.status).toBe("unknown");
    expect(res.redis.message).toContain("db down");
  });

  it("PG 查询抛错返回 down，并在冷却期内直接沿用上次结论", async () => {
    h.pgError = new Error("Can't reach database server\nsecond line");
    const handler = await loadHandler();

    const first = await handler({});
    expect(first.postgres.status).toBe("down");
    expect(first.postgres.message).toBe("Can't reach database server");

    // 模拟 PG 恢复：冷却期内不应再发起查询
    h.pgError = null;
    const second = await handler({});
    expect(second.postgres.status).toBe("down");
    expect(second.postgres.message).toContain("不再重试");
  });
});
