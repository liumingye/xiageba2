import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 令牌吊销校验测试
 * 对应源码：server/lib/adminToken.ts
 *
 * 锁定：管理员被删除、或签发后改过密码的令牌必须失效；
 * 没有 uid / pv 的旧版令牌一律视为失效。
 */

const h = vi.hoisted(() => ({
  /** 库里的当前管理员记录；null 表示已被删除 */
  admin: null as null | {
    id: string;
    username: string;
    password: string;
  },
  dbError: null as null | Error,
  queries: [] as any[],
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    admin: {
      findUnique: async (args: any) => {
        h.queries.push(args);
        if (h.dbError) throw h.dbError;
        // 按主键查询：记录不存在或 ID 对不上都返回 null
        return h.admin?.id === args.where.id ? h.admin : null;
      },
    },
  },
}));

process.env.ADMIN_SECRET = "test-admin-secret-not-for-production-use-only";

const { resolveTokenAdmin } = await import("./adminToken");
const { issueTokens, verifyTokenDetailed } = await import("#server/utils/auth");

const ORIGINAL_PASSWORD = "salt$original-hash";
const NEW_PASSWORD = "salt$new-hash";

/** 用当前库里的管理员记录签一枚 access token 并解出载荷 */
const mintToken = (admin = h.admin!) =>
  verifyTokenDetailed(issueTokens(admin).accessToken, "access")!;

describe("resolveTokenAdmin（吊销校验）", () => {
  beforeEach(() => {
    h.admin = { id: "adm_1", username: "admin", password: ORIGINAL_PASSWORD };
    h.dbError = null;
    h.queries = [];
  });

  it("管理员存在且密码未变 → 返回管理员", async () => {
    const token = mintToken();
    await expect(resolveTokenAdmin(token)).resolves.toEqual({
      id: "adm_1",
      username: "admin",
    });
  });

  it("管理员被删除 → 令牌失效", async () => {
    const token = mintToken();
    h.admin = null;
    await expect(resolveTokenAdmin(token)).resolves.toBeNull();
  });

  it("签发后改了密码 → 该管理员所有旧令牌失效；新登录签出的令牌有效", async () => {
    const oldToken = mintToken();
    h.admin = { ...h.admin!, password: NEW_PASSWORD };

    await expect(resolveTokenAdmin(oldToken)).resolves.toBeNull();
    await expect(resolveTokenAdmin(mintToken())).resolves.toEqual({
      id: "adm_1",
      username: "admin",
    });
  });

  it("只改用户名 → 令牌仍有效，用户名以库里为准", async () => {
    const token = mintToken();
    h.admin = { ...h.admin!, username: "renamed" };

    await expect(resolveTokenAdmin(token)).resolves.toEqual({
      id: "adm_1",
      username: "renamed",
    });
  });

  it("删掉后重建同名管理员（不同 ID）→ 旧令牌不会复活", async () => {
    const token = mintToken();
    h.admin = { id: "adm_2", username: "admin", password: ORIGINAL_PASSWORD };

    await expect(resolveTokenAdmin(token)).resolves.toBeNull();
  });

  it("旧版令牌（无 uid / pv）→ 直接失效，不查库", async () => {
    // 由不传凭据的签发函数得到旧版形态的令牌
    const { generateAccessToken } = await import("#server/utils/auth");
    const legacy = verifyTokenDetailed(
      generateAccessToken("admin"),
      "access",
    )!;
    expect(legacy.uid).toBe("");

    await expect(resolveTokenAdmin(legacy)).resolves.toBeNull();
    expect(h.queries).toHaveLength(0);
  });

  it("按令牌里的 uid 走主键查询，只取 id / username / password", async () => {
    await resolveTokenAdmin(mintToken());
    expect(h.queries).toHaveLength(1);
    expect(h.queries[0]).toEqual({
      where: { id: "adm_1" },
      select: { id: true, username: true, password: true },
    });
  });

  it("数据库查询出错 → 异常原样抛出，不降级成有效也不伪装成失效", async () => {
    const token = mintToken();
    h.dbError = new Error("connection refused");
    await expect(resolveTokenAdmin(token)).rejects.toBe(h.dbError);
  });
});
