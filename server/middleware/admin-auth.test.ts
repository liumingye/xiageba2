import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 后台鉴权中间件测试
 * 对应源码：server/middleware/admin-auth.ts
 *
 * 锁定：/api/admin/** 必须带有效的 access token；管理员被删除或改过密码后
 * 令牌立即失效；登录与刷新端点不要求已登录。
 */

const h = vi.hoisted(() => ({
  admin: null as null | {
    id: string;
    username: string;
    password: string;
  },
  authorization: undefined as string | undefined,
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    admin: {
      findUnique: async () => h.admin,
    },
  },
}));

vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("createError", (options: any) =>
  Object.assign(new Error(options?.message ?? "error"), options),
);
vi.stubGlobal("getHeader", (_event: any, name: string) =>
  name === "authorization" ? h.authorization : undefined,
);

process.env.ADMIN_SECRET = "test-admin-secret-not-for-production-use-only";

const middleware = (await import("./admin-auth")).default;
const { issueTokens } = await import("#server/utils/auth");

const ADMIN = {
  id: "adm_1",
  username: "admin",
  password: "salt$original-hash",
};

// 测试里没有真实的 H3Event，按 any 构造最小事件对象
// eslint 的 no-explicit-any 不适用于本项目（未配置 eslint）
const makeEvent = (path: string): any => ({ path, context: {} });

const run = (path: string) => middleware(makeEvent(path));

describe("admin-auth 中间件", () => {
  let tokens: ReturnType<typeof issueTokens>;

  beforeEach(() => {
    h.admin = { ...ADMIN };
    tokens = issueTokens(ADMIN);
    h.authorization = `Bearer ${tokens.accessToken}`;
  });

  afterEach(() => {
    h.authorization = undefined;
  });

  it("合法 access token → 放行，并把当前用户名挂到 event.context.user", async () => {
    const event = makeEvent("/api/admin/music?page=1");
    await middleware(event);
    expect(event.context.user).toEqual({ username: "admin" });
  });

  it("没有 token → 401", async () => {
    h.authorization = undefined;
    await expect(run("/api/admin/music")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("签名无效的 token → 401", async () => {
    h.authorization = `Bearer ${tokens.accessToken.slice(0, -2)}xx`;
    await expect(run("/api/admin/music")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("refresh token 不能当 access token 用 → 401", async () => {
    h.authorization = `Bearer ${tokens.refreshToken}`;
    await expect(run("/api/admin/music")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("管理员被删除 → 令牌立即失效", async () => {
    h.admin = null;
    await expect(run("/api/admin/music")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("签发后改了密码 → 令牌立即失效", async () => {
    h.admin = { ...ADMIN, password: "salt$new-hash" };
    await expect(run("/api/admin/music")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("管理员改名 → 令牌仍有效，上下文里是新用户名", async () => {
    h.admin = { ...ADMIN, username: "renamed" };
    const event = makeEvent("/api/admin/music");
    await middleware(event);
    expect(event.context.user).toEqual({ username: "renamed" });
  });

  it("旧版令牌（无 uid / pv）→ 401", async () => {
    const { generateAccessToken } = await import("#server/utils/auth");
    h.authorization = `Bearer ${generateAccessToken("admin")}`;
    await expect(run("/api/admin/music")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("登录与刷新端点不要求已登录", async () => {
    h.authorization = undefined;
    await expect(run("/api/admin/login")).resolves.toBeUndefined();
    await expect(run("/api/admin/refresh")).resolves.toBeUndefined();
  });

  it("带 query 的登录路径同样放行", async () => {
    h.authorization = undefined;
    await expect(run("/api/admin/login?x=1")).resolves.toBeUndefined();
  });

  it("登录路径的变体不享受白名单（防止 /api/admin/login/.. 之类绕过）", async () => {
    h.authorization = undefined;
    await expect(run("/api/admin/login/../music")).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(run("/api/admin/loginx")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("非 /api/admin 路径不拦截", async () => {
    h.authorization = undefined;
    await expect(run("/api/music/search")).resolves.toBeUndefined();
    await expect(run("/api/source/geturl")).resolves.toBeUndefined();
  });
});
