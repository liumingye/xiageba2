import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 开放 API 鉴权中间件测试：/api/open/** 必须携带与后台配置一致的 Bearer Token。
 */

const h = vi.hoisted(() => ({
  configured: "secret-token-0123456789abcdef",
  getConfigCalls: 0,
}));

vi.mock("#server/lib/configCache", () => ({
  getConfigValue: async () => {
    h.getConfigCalls++;
    return h.configured;
  },
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("getHeader", (event: any, name: string) => event.headers?.[name]);
vi.stubGlobal("setResponseHeader", (event: any, name: string, value: string) => {
  event.responseHeaders[name] = value;
});
vi.stubGlobal(
  "createError",
  (o: any) => Object.assign(new Error(o.message), o),
);

const { default: middleware } = await import("./open-auth");

const run = async (path: string, headers: Record<string, string> = {}) => {
  const event: any = {
    path,
    headers,
    context: {},
    responseHeaders: {} as Record<string, string>,
  };
  try {
    await middleware(event as any);
    return { ok: true as const, event };
  } catch (e: any) {
    return { ok: false as const, error: e, event };
  }
};

beforeEach(() => {
  h.getConfigCalls = 0;
});

describe("open-auth middleware", () => {
  it("非 /api/open/ 路径直接放行，不读取配置", async () => {
    for (const path of ["/api/source/search", "/api/openxyz", "/api/admin/source"]) {
      const r = await run(path);
      expect(r.ok).toBe(true);
    }
    expect(h.getConfigCalls).toBe(0);
  });

  it("路径比对前剥掉 query", async () => {
    const r = await run("/api/open/music/search?q=a", {
      authorization: `Bearer ${h.configured}`,
    });
    expect(r.ok).toBe(true);
  });

  it("后台未配置 Token 时返回 403", async () => {
    h.configured = "";
    try {
      const r = await run("/api/open/music");
      expect(r.ok).toBe(false);
      expect(r.error).toMatchObject({ statusCode: 403 });
    } finally {
      h.configured = "secret-token-0123456789abcdef";
    }
  });

  it("缺少 Authorization 返回 401 并带 WWW-Authenticate", async () => {
    const r = await run("/api/open/music");
    expect(r.error).toMatchObject({
      statusCode: 401,
      message: "缺少 API Token",
    });
    expect(r.event.responseHeaders["WWW-Authenticate"]).toBe("Bearer");
  });

  it("非 Bearer 方案或空 Token 返回 401", async () => {
    const basic = await run("/api/open/music", { authorization: "Basic abc" });
    expect(basic.error).toMatchObject({ statusCode: 401, message: "缺少 API Token" });

    const empty = await run("/api/open/music", { authorization: "Bearer   " });
    expect(empty.error).toMatchObject({ statusCode: 401, message: "缺少 API Token" });
  });

  it("错误的 Token 返回 401", async () => {
    const r = await run("/api/open/music", { authorization: "Bearer wrong-token-0000000000" });
    expect(r.error).toMatchObject({ statusCode: 401, message: "API Token 无效" });
    expect(r.event.responseHeaders["WWW-Authenticate"]).toBe("Bearer");
  });

  it("正确的 Token 放行并写入 context", async () => {
    const r = await run("/api/open/music", { authorization: `Bearer ${h.configured}` });
    expect(r.ok).toBe(true);
    expect(r.event.context.openApi).toEqual({ auth: "api-token" });
    expect(r.event.responseHeaders).toEqual({});
  });

  it("scheme 大小写不敏感，且容忍首尾空白", async () => {
    expect((await run("/api/open/music", { authorization: `bearer ${h.configured}` })).ok).toBe(true);
    expect((await run("/api/open/music", { authorization: `  BEARER   ${h.configured}  ` })).ok).toBe(true);
  });
});
