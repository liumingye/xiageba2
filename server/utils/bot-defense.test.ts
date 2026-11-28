import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BOT 防御闸门测试
 * 对应源码：server/utils/bot-defense.ts
 *
 * 只覆盖「管理员放行」通道：合法后台令牌免验证码；
 * 管理员被删除或改过密码后不再放行，退回验证码判定。
 */

const h = vi.hoisted(() => ({
  admin: null as null | {
    id: string;
    username: string;
    password: string;
  },
  authorization: undefined as string | undefined,
  captchaPass: "",
  evaluateCalls: 0,
}));

vi.mock("#server/lib/bot-defense", () => ({
  getBotDefenseConfig: async () => ({
    captchaType: "cloudflare",
    protectedApis: ["/api/source/geturl"],
    siteKey: "site-key",
  }),
  getBotDefenseSecret: () => "bot-secret",
  evaluateBotDefense: () => {
    h.evaluateCalls++;
    return { ok: false, captchaType: "cloudflare", siteKey: "site-key" };
  },
}));

vi.mock("#server/lib/prisma", () => ({
  prisma: {
    admin: {
      findUnique: async (args: any) =>
        h.admin?.id === args.where.id ? h.admin : null,
    },
  },
}));

vi.stubGlobal("getHeader", (_event: any, name: string) =>
  name === "authorization"
    ? h.authorization
    : name === "x-captcha-pass"
      ? h.captchaPass
      : undefined,
);
vi.stubGlobal("createError", (options: any) =>
  Object.assign(new Error(options?.message ?? "error"), options),
);

process.env.ADMIN_SECRET = "test-admin-secret-not-for-production-use-only";

const { assertBotDefense } = await import("./bot-defense");
const { issueTokens } = await import("#server/utils/auth");

const ADMIN = {
  id: "adm_1",
  username: "admin",
  password: "salt$original-hash",
};

const API = "/api/source/geturl";

describe("assertBotDefense 的管理员放行", () => {
  beforeEach(() => {
    h.admin = { ...ADMIN };
    h.authorization = `Bearer ${issueTokens(ADMIN).accessToken}`;
    h.captchaPass = "";
    h.evaluateCalls = 0;
  });

  afterEach(() => {
    h.authorization = undefined;
  });

  it("合法后台令牌 → 直接放行，不进入验证码判定", async () => {
    await expect(assertBotDefense({} as any, API)).resolves.toBeUndefined();
    expect(h.evaluateCalls).toBe(0);
  });

  it("管理员被删除 → 不再放行，退回验证码判定（403）", async () => {
    h.admin = null;
    await expect(assertBotDefense({} as any, API)).rejects.toMatchObject({
      statusCode: 403,
      data: { code: "CAPTCHA_REQUIRED" },
    });
    expect(h.evaluateCalls).toBe(1);
  });

  it("签发后改了密码 → 不再放行", async () => {
    h.admin = { ...ADMIN, password: "salt$new-hash" };
    await expect(assertBotDefense({} as any, API)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("旧版令牌（无 uid / pv）→ 不再放行", async () => {
    const { generateAccessToken } = await import("#server/utils/auth");
    h.authorization = `Bearer ${generateAccessToken("admin")}`;
    await expect(assertBotDefense({} as any, API)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("没有后台令牌 → 走验证码判定", async () => {
    h.authorization = undefined;
    await expect(assertBotDefense({} as any, API)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(h.evaluateCalls).toBe(1);
  });
});
