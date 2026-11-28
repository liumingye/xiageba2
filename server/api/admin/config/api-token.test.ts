import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stored: "stored-token-0123456789abcdef",
  writes: [] as { key: string; value: string }[],
  body: {} as any,
}));

vi.mock("#server/lib/configCache", () => ({
  getConfigValues: async (keys: string[]) => ({ [String(keys[0])]: h.stored }),
  setConfigValues: async (configs: { key: string; value: string }[]) => {
    h.writes.push(...configs);
    return { success: true };
  },
}));

// Nitro 自动导入
vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("readBody", async () => h.body);
vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));

const { default: handler } = await import("./api-token");

const run = async (method: string, body: any = {}) => {
  h.body = body;
  try {
    return await handler({ method } as any);
  } catch (e) {
    return e as any;
  }
};

beforeEach(() => {
  h.writes = [];
});

describe("admin config api-token", () => {
  it("GET 明文返回当前 Token", async () => {
    expect(await run("GET")).toEqual({ data: { api_token: h.stored } });
  });

  it("POST 写入 trim 后的值，空串表示关闭", async () => {
    const value = "a".repeat(64);
    expect(await run("POST", { api_token: `  ${value}  ` })).toEqual({ success: true });
    expect(await run("POST", { api_token: "   " })).toEqual({ success: true });
    expect(h.writes).toEqual([
      { key: "api_token", value },
      { key: "api_token", value: "" },
    ]);
  });

  it("过短或含非法字符的 Token 返回 400 且不写入", async () => {
    const short = await run("POST", { api_token: "short-token" });
    expect(short).toMatchObject({ statusCode: 400 });

    const illegal = await run("POST", { api_token: "has space in it 0123456789" });
    expect(illegal).toMatchObject({ statusCode: 400 });

    expect(h.writes).toHaveLength(0);
  });

  it("不支持的方法返回 405", async () => {
    expect(await run("DELETE")).toMatchObject({ statusCode: 405 });
  });
});
