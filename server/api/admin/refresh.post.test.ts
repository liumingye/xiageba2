import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 刷新令牌接口测试
 * 对应源码：server/api/admin/refresh.post.ts
 *
 * 锁定：管理员被删除或改过密码后，手里的 refresh token 不能再续期
 * （否则旧令牌可以一直续到 7 天到期）。
 */

const h = vi.hoisted(() => ({
  admin: null as null | {
    id: string;
    username: string;
    password: string;
  },
  body: {} as any,
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
vi.stubGlobal("readBody", async () => h.body);

process.env.ADMIN_SECRET = "test-admin-secret-not-for-production-use-only";

const handler = (await import("./refresh.post")).default;
const { issueTokens, verifyTokenDetailed } = await import("#server/utils/auth");

const ADMIN = {
  id: "adm_1",
  username: "admin",
  password: "salt$original-hash",
};

const call = (refreshToken: unknown) => {
  h.body = { refreshToken };
  return handler({} as any);
};

describe("POST /api/admin/refresh", () => {
  let tokens: ReturnType<typeof issueTokens>;

  beforeEach(() => {
    h.admin = { ...ADMIN };
    tokens = issueTokens(ADMIN);
    h.body = { refreshToken: tokens.refreshToken };
  });

  afterEach(() => {
    h.body = {};
  });

  it("合法 refresh token → 换出新令牌组，新令牌仍带 uid / pv", async () => {
    const result = await call(tokens.refreshToken);

    expect(result.expiresIn).toBe(60 * 60);
    expect(result.refreshToken).not.toBe(tokens.refreshToken);
    expect(verifyTokenDetailed(result.accessToken, "access")).toMatchObject({
      uid: ADMIN.id,
    });
    expect(verifyTokenDetailed(result.refreshToken, "refresh")).toMatchObject({
      uid: ADMIN.id,
    });
  });

  it("缺少 refreshToken → 401", async () => {
    h.body = {};
    await expect(call(undefined)).rejects.toMatchObject({ statusCode: 401 });
    await expect(call(123)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("access token 不能用来刷新 → 401", async () => {
    await expect(call(tokens.accessToken)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("管理员被删除 → 不能续期", async () => {
    h.admin = null;
    await expect(call(tokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("签发后改了密码 → 不能续期", async () => {
    h.admin = { ...ADMIN, password: "salt$new-hash" };
    await expect(call(tokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("旧版 refresh token（无 uid / pv）→ 不能续期", async () => {
    const { generateRefreshToken } = await import("#server/utils/auth");
    await expect(call(generateRefreshToken("admin"))).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
