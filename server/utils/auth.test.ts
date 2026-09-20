// JWT Token 工具测试：覆盖 generateToken / verifyToken
// 对应源码：server/utils/auth.ts
//
// 注意：源码顶层 import "dotenv/config" 会读 .env，但 dotenv 默认不覆盖
// 已存在的 env 变量。这里在测试 setup 阶段先设置 ADMIN_SECRET。
// getTokenFromEvent 依赖 Nitro 全局 getHeader，vitest 中未定义，跳过测试。

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_SECRET = "test-admin-secret-not-for-production-use-only";

describe("auth token（generateToken / verifyToken）", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    // 备份原值并设置测试 secret（在 import 模块前设置，
    // dotenv/config 加载时不会覆盖已存在的 env 变量）
    originalSecret = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
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

  describe("generateToken", () => {
    it("返回三段式 JWT（header.payload.signature）", async () => {
      const { generateToken } = await importAuth();
      const token = generateToken("admin");
      expect(token.split(".")).toHaveLength(3);
    });

    it("header 解码后 alg=HS256, typ=JWT", async () => {
      const { generateToken } = await importAuth();
      const token = generateToken("admin");
      const header = JSON.parse(
        Buffer.from(token.split(".")[0]!, "base64url").toString(),
      );
      expect(header.alg).toBe("HS256");
      expect(header.typ).toBe("JWT");
    });

    it("payload 含 sub=用户名、iat、exp、jti", async () => {
      const { generateToken } = await importAuth();
      const token = generateToken("user1");
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1]!, "base64url").toString(),
      );
      expect(payload.sub).toBe("user1");
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
      expect(payload.exp).toBeGreaterThan(payload.iat);
      expect(payload.exp - payload.iat).toBe(60 * 60 * 24 * 7); // 7 天
      expect(typeof payload.jti).toBe("string");
      expect(payload.jti.length).toBe(32); // 16 bytes hex
    });

    it("不同用户名生成不同 token", async () => {
      const { generateToken } = await importAuth();
      const a = generateToken("user-a");
      const b = generateToken("user-b");
      expect(a).not.toBe(b);
    });

    it("同一用户多次生成不同 token（jti 随机）", async () => {
      const { generateToken } = await importAuth();
      const a = generateToken("same");
      const b = generateToken("same");
      expect(a).not.toBe(b);
    });
  });

  describe("verifyToken", () => {
    it("正确 token 返回 { username }", async () => {
      const { generateToken, verifyToken } = await importAuth();
      const token = generateToken("admin-user");
      expect(verifyToken(token)).toEqual({ username: "admin-user" });
    });

    it("篡改 signature 后验证失败", async () => {
      const { generateToken, verifyToken } = await importAuth();
      const token = generateToken("admin");
      const [header, payload, signature] = token.split(".");
      // 把 signature 末位字符翻转
      const tamperedSig =
        signature!.slice(0, -1) +
        (signature!.slice(-1) === "a" ? "b" : "a");
      expect(verifyToken(`${header}.${payload}.${tamperedSig}`)).toBeNull();
    });

    it("篡改 payload 后验证失败（signature 不匹配）", async () => {
      const { generateToken, verifyToken } = await importAuth();
      const token = generateToken("admin");
      const [header, , signature] = token.split(".");
      // 把 payload 替换为另一个用户的 payload
      const fakePayload = Buffer.from(
        JSON.stringify({ sub: "hacker", iat: 1, exp: 9999999999, jti: "x" }),
      ).toString("base64url");
      expect(verifyToken(`${header}.${fakePayload}.${signature}`)).toBeNull();
    });

    it("alg≠HS256 时验证失败（防御 alg:none 攻击）", async () => {
      const { verifyToken } = await importAuth();
      const header = Buffer.from(
        JSON.stringify({ alg: "none", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ sub: "hacker", iat: 1, exp: 9999999999 }),
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
      const { generateToken, verifyToken } = await importAuth();
      const token = generateToken("admin");
      const [header, payload, signature] = token.split(".");
      expect(verifyToken(`.${payload}.${signature}`)).toBeNull();
      expect(verifyToken(`${header}..${signature}`)).toBeNull();
      expect(verifyToken(`${header}.${payload}.`)).toBeNull();
    });

    it("非 base64url 的 header/payload 返回 null（JSON.parse 抛错被兜底）", async () => {
      const { verifyToken } = await importAuth();
      expect(verifyToken("@@@.@@@.@@@")).toBeNull();
    });

    it("使用不同 ADMIN_SECRET 签发的 token 验证失败", async () => {
      // 用 TEST_SECRET 签发
      const { generateToken } = await importAuth();
      const token = generateToken("admin");
      // 临时换 secret 后再 verify
      process.env.ADMIN_SECRET = "different-secret";
      const { verifyToken } = await importAuth();
      expect(verifyToken(token)).toBeNull();
      // 还原以便后续用例
      process.env.ADMIN_SECRET = TEST_SECRET;
    });
  });

  describe("ADMIN_SECRET 缺失场景", () => {
    it("generateToken 在未设置 ADMIN_SECRET 时抛错", async () => {
      delete process.env.ADMIN_SECRET;
      const { generateToken } = await importAuth();
      expect(() => generateToken("admin")).toThrow(/ADMIN_SECRET/);
    });

    it("verifyToken 在未设置 ADMIN_SECRET 时返回 null（getSecret 抛错被 try/catch 兜底）", async () => {
      delete process.env.ADMIN_SECRET;
      const { verifyToken } = await importAuth();
      // 构造一个结构合法的 token 触发 getSecret()
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ sub: "x", iat: 1, exp: 9999999999 }),
      ).toString("base64url");
      // 源码中 getSecret() 抛错被外层 try/catch 捕获，最终返回 null
      expect(verifyToken(`${header}.${payload}.abc`)).toBeNull();
    });
  });
});
