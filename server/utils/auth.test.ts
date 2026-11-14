// JWT Token 工具测试：覆盖 access/refresh 双 token 的签发、校验与轮转
// 对应源码：server/utils/auth.ts
//
// 注意：源码顶层 import "dotenv/config" 会读 .env，但 dotenv 默认不覆盖
// 已存在的 env 变量。这里在测试 setup 阶段先设置 ADMIN_SECRET。
// getTokenFromEvent 依赖 Nitro 全局 getHeader，vitest 中未定义，跳过测试。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_SECRET = "test-admin-secret-not-for-production-use-only";

const decodePart = (part: string): any =>
  JSON.parse(Buffer.from(part, "base64url").toString());

describe("auth token（双 token）", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    // 备份原值并设置测试 secret（在 import 模块前设置，
    // dotenv/config 加载时不会覆盖已存在的 env 变量）
    originalSecret = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalSecret;
    }
  });

  // 延迟 import：确保 beforeEach 已设置 env，再触发模块加载
  async function importAuth() {
    return await import("./auth");
  }

  describe("generateAccessToken", () => {
    it("返回三段式 JWT（header.payload.signature）", async () => {
      const { generateAccessToken } = await importAuth();
      const token = generateAccessToken("admin");
      expect(token.split(".")).toHaveLength(3);
    });

    it("header 解码后 alg=HS256, typ=JWT", async () => {
      const { generateAccessToken } = await importAuth();
      const token = generateAccessToken("admin");
      const header = decodePart(token.split(".")[0]!);
      expect(header.alg).toBe("HS256");
      expect(header.typ).toBe("JWT");
    });

    it("payload 含 sub/typ=access/iat/exp/jti，有效期 1 小时", async () => {
      const { generateAccessToken, ACCESS_TOKEN_TTL } = await importAuth();
      const token = generateAccessToken("user1");
      const payload = decodePart(token.split(".")[1]!);

      expect(payload.sub).toBe("user1");
      expect(payload.typ).toBe("access");
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
      expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL);
      expect(ACCESS_TOKEN_TTL).toBe(60 * 60); // 1 小时
      expect(typeof payload.jti).toBe("string");
      expect(payload.jti.length).toBe(32); // 16 bytes hex
    });

    it("不同用户名生成不同 token", async () => {
      const { generateAccessToken } = await importAuth();
      expect(generateAccessToken("user-a")).not.toBe(
        generateAccessToken("user-b"),
      );
    });

    it("同一用户多次生成不同 token（jti 随机）", async () => {
      const { generateAccessToken } = await importAuth();
      expect(generateAccessToken("same")).not.toBe(generateAccessToken("same"));
    });
  });

  describe("generateRefreshToken", () => {
    it("typ=refresh，有效期 7 天", async () => {
      const { generateRefreshToken, REFRESH_TOKEN_TTL } = await importAuth();
      const payload = decodePart(generateRefreshToken("admin").split(".")[1]!);
      expect(payload.typ).toBe("refresh");
      expect(payload.exp - payload.iat).toBe(REFRESH_TOKEN_TTL);
      expect(REFRESH_TOKEN_TTL).toBe(60 * 60 * 24 * 7); // 7 天
    });

    it("与同用户 access token 内容不同", async () => {
      const { generateAccessToken, generateRefreshToken } = await importAuth();
      const at = generateAccessToken("admin");
      const rt = generateRefreshToken("admin");
      expect(at).not.toBe(rt);
      expect(decodePart(at.split(".")[1]!).typ).toBe("access");
      expect(decodePart(rt.split(".")[1]!).typ).toBe("refresh");
    });
  });

  describe("verifyToken", () => {
    it("正确 access token 返回 { username }", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin-user");
      expect(verifyToken(token, "access")).toEqual({ username: "admin-user" });
    });

    it("不传类型时默认按 access 校验", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin-user");
      expect(verifyToken(token)).toEqual({ username: "admin-user" });
    });

    it("refresh token 不能当 access token 用", async () => {
      const { generateRefreshToken, verifyToken } = await importAuth();
      const rt = generateRefreshToken("admin");
      expect(verifyToken(rt, "access")).toBeNull();
      expect(verifyToken(rt)).toBeNull();
    });

    it("access token 不能当 refresh token 用", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const at = generateAccessToken("admin");
      expect(verifyToken(at, "refresh")).toBeNull();
    });

    it("篡改 signature 后验证失败", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin");
      const [header, payload, signature] = token.split(".");
      const tamperedSig =
        signature!.slice(0, -1) +
        (signature!.slice(-1) === "a" ? "b" : "a");
      expect(verifyToken(`${header}.${payload}.${tamperedSig}`)).toBeNull();
    });

    it("篡改 payload 后验证失败（signature 不匹配）", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin");
      const [header, , signature] = token.split(".");
      const fakePayload = Buffer.from(
        JSON.stringify({
          sub: "hacker",
          typ: "access",
          iat: 1,
          exp: 9999999999,
          jti: "x",
        }),
      ).toString("base64url");
      expect(verifyToken(`${header}.${fakePayload}.${signature}`)).toBeNull();
    });

    it("把 access 的 typ 改成 refresh 且沿用 access 签名 → 失败", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin");
      const [header, payload, signature] = token.split(".");
      const decoded = decodePart(payload!);
      const forged = Buffer.from(
        JSON.stringify({ ...decoded, typ: "refresh" }),
      ).toString("base64url");
      // 密钥不同，签名对不上
      expect(verifyToken(`${header}.${forged}.${signature}`, "refresh")).toBeNull();
    });

    it("alg≠HS256 时验证失败（防御 alg:none 攻击）", async () => {
      const { verifyToken } = await importAuth();
      const header = Buffer.from(
        JSON.stringify({ alg: "none", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ sub: "hacker", typ: "access", iat: 1, exp: 9999999999 }),
      ).toString("base64url");
      expect(verifyToken(`${header}.${payload}.`)).toBeNull();
    });

    it("空 token 返回 null", async () => {
      const { verifyToken } = await importAuth();
      expect(verifyToken("")).toBeNull();
    });

    it("非三段式格式返回 null", async () => {
      const { verifyToken } = await importAuth();
      expect(verifyToken("not.a.jwt.extra")).toBeNull();
      expect(verifyToken("onlyonepart")).toBeNull();
      expect(verifyToken("two.parts")).toBeNull();
    });

    it("缺 header/payload/signature 任一返回 null", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin");
      const [header, payload, signature] = token.split(".");
      expect(verifyToken(`.${payload}.${signature}`)).toBeNull();
      expect(verifyToken(`${header}..${signature}`)).toBeNull();
      expect(verifyToken(`${header}.${payload}.`)).toBeNull();
    });

    it("非 base64url 的 header/payload 返回 null（JSON.parse 抛错被兜底）", async () => {
      const { verifyToken } = await importAuth();
      expect(verifyToken("@@@.@@@.@@@")).toBeNull();
    });

    it("过期 access token 验证失败", async () => {
      const { generateAccessToken, verifyToken } = await importAuth();
      const token = generateAccessToken("admin");
      vi.useFakeTimers();
      // 超过 1 小时 + 60 秒时钟漂移
      vi.setSystemTime(Date.now() + (60 * 60 + 120) * 1000);
      expect(verifyToken(token, "access")).toBeNull();
    });

    it("使用不同 ADMIN_SECRET 签发的 token 验证失败", async () => {
      const { generateAccessToken } = await importAuth();
      const token = generateAccessToken("admin");
      process.env.ADMIN_SECRET = "different-secret";
      const { verifyToken } = await importAuth();
      expect(verifyToken(token)).toBeNull();
      process.env.ADMIN_SECRET = TEST_SECRET;
    });
  });

  describe("issueTokens", () => {
    it("返回 access + refresh 及各自有效期", async () => {
      const { issueTokens, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } =
        await importAuth();
      const tokens = issueTokens("admin");

      expect(tokens.expiresIn).toBe(ACCESS_TOKEN_TTL);
      expect(tokens.refreshExpiresIn).toBe(REFRESH_TOKEN_TTL);
      expect(decodePart(tokens.accessToken.split(".")[1]!).typ).toBe("access");
      expect(decodePart(tokens.refreshToken.split(".")[1]!).typ).toBe("refresh");
    });
  });

  describe("rotateTokens", () => {
    it("用合法 refresh token 换出新令牌", async () => {
      const { issueTokens, rotateTokens, verifyToken } = await importAuth();
      const { refreshToken } = issueTokens("admin");

      const next = rotateTokens(refreshToken);
      expect(next).not.toBeNull();
      expect(verifyToken(next!.accessToken, "access")).toEqual({
        username: "admin",
      });
      expect(verifyToken(next!.refreshToken, "refresh")).toEqual({
        username: "admin",
      });
      expect(next!.expiresIn).toBe(60 * 60);
      // 轮转出来的 refresh 是新签的（jti 不同）
      expect(next!.refreshToken).not.toBe(refreshToken);
    });

    it("新 refresh token 继承原会话的绝对过期点，不延长", async () => {
      const { issueTokens, rotateTokens } = await importAuth();
      const { refreshToken } = issueTokens("admin");
      const originalExp = decodePart(refreshToken.split(".")[1]!).exp;

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 6 * 24 * 60 * 60 * 1000); // 6 天后
      const next = rotateTokens(refreshToken);
      expect(next).not.toBeNull();

      const rotatedExp = decodePart(next!.refreshToken.split(".")[1]!).exp;
      expect(rotatedExp).toBe(originalExp);
      // 剩余有效期应当只剩约 1 天
      expect(next!.refreshExpiresIn).toBeGreaterThan(23 * 60 * 60);
      expect(next!.refreshExpiresIn).toBeLessThanOrEqual(25 * 60 * 60);
    });

    it("超过 7 天的 refresh token 无法再续", async () => {
      const { issueTokens, rotateTokens } = await importAuth();
      const { refreshToken } = issueTokens("admin");

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
      expect(rotateTokens(refreshToken)).toBeNull();
    });

    it("access token 不能用来刷新", async () => {
      const { issueTokens, rotateTokens } = await importAuth();
      const { accessToken } = issueTokens("admin");
      expect(rotateTokens(accessToken)).toBeNull();
    });

    it("伪造 / 空 refresh token 返回 null", async () => {
      const { rotateTokens } = await importAuth();
      expect(rotateTokens("")).toBeNull();
      expect(rotateTokens("not.a.token")).toBeNull();
      expect(
        rotateTokens(
          `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(
            JSON.stringify({ sub: "hacker", typ: "refresh", exp: 9999999999 }),
          ).toString("base64url")}.forged`,
        ),
      ).toBeNull();
    });
  });

  describe("ADMIN_SECRET 缺失场景", () => {
    it("generateAccessToken 在未设置 ADMIN_SECRET 时抛错", async () => {
      delete process.env.ADMIN_SECRET;
      const { generateAccessToken } = await importAuth();
      expect(() => generateAccessToken("admin")).toThrow(/ADMIN_SECRET/);
    });

    it("verifyToken 在未设置 ADMIN_SECRET 时返回 null（getSecret 抛错被 try/catch 兜底）", async () => {
      delete process.env.ADMIN_SECRET;
      const { verifyToken } = await importAuth();
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ sub: "x", typ: "access", iat: 1, exp: 9999999999 }),
      ).toString("base64url");
      // 源码中 getSecret() 抛错被外层 try/catch 捕获，最终返回 null
      expect(verifyToken(`${header}.${payload}.abc`)).toBeNull();
    });
  });
});
