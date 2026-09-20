// 密码哈希工具测试：覆盖 hashPassword / verifyPassword 的正常路径、边界条件与异常场景
// 对应源码：server/utils/password.ts

import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

// 匹配源码常量：salt 16 字节 → 32 hex 字符；hash 16 字节 → 32 hex 字符
const SALT_HEX_LEN = 32;
const HASH_HEX_LEN = 32;
const HEX_RE = /^[0-9a-f]+$/;

describe("hashPassword", () => {
  it("返回 salt$hash 格式的字符串", () => {
    const hashed = hashPassword("correct horse battery staple");

    expect(typeof hashed).toBe("string");
    expect(hashed.includes("$")).toBe(true);

    const [salt, hash] = hashed.split("$");
    expect(salt).toHaveLength(SALT_HEX_LEN);
    expect(hash).toHaveLength(HASH_HEX_LEN);
    expect(salt).toMatch(HEX_RE);
    expect(hash).toMatch(HEX_RE);
  });

  it("每次调用生成不同的 salt（随机性）", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");

    expect(a).not.toBe(b);
    // salt 段不同，hash 段也不同
    expect(a.split("$")[0]).not.toBe(b.split("$")[0]);
    expect(a.split("$")[1]).not.toBe(b.split("$")[1]);
  });

  it("支持包含中文与特殊字符的密码", () => {
    const hashed = hashPassword("你好，世界！🎉\\$%^&*()");
    expect(hashed.split("$")).toHaveLength(2);
    expect(verifyPassword("你好，世界！🎉\\$%^&*()", hashed)).toEqual({
      ok: true,
    });
  });

  it("支持超长密码", () => {
    const long = "a".repeat(10_000);
    const hashed = hashPassword(long);
    expect(verifyPassword(long, hashed)).toEqual({ ok: true });
  });

  it("空字符串抛出错误", () => {
    expect(() => hashPassword("")).toThrow();
  });
});

describe("verifyPassword", () => {
  it("正确密码返回 ok:true", () => {
    const hashed = hashPassword("my-secret");
    expect(verifyPassword("my-secret", hashed)).toEqual({ ok: true });
  });

  it("错误密码返回 ok:false", () => {
    const hashed = hashPassword("my-secret");
    expect(verifyPassword("wrong-secret", hashed)).toEqual({ ok: false });
  });

  it("大小写敏感", () => {
    const hashed = hashPassword("MySecret");
    expect(verifyPassword("mysecret", hashed)).toEqual({ ok: false });
    expect(verifyPassword("MYSECRET", hashed)).toEqual({ ok: false });
  });

  it("空 plain 返回 ok:false（不抛错）", () => {
    const hashed = hashPassword("anything");
    expect(verifyPassword("", hashed)).toEqual({ ok: false });
  });

  it("空 hashed 返回 ok:false（不抛错）", () => {
    expect(verifyPassword("anything", "")).toEqual({ ok: false });
  });

  it("两参数都空时返回 ok:false", () => {
    expect(verifyPassword("", "")).toEqual({ ok: false });
  });

  it("hashed 不含 $ 分隔符时返回 ok:false", () => {
    expect(verifyPassword("any", "invalidhash")).toEqual({ ok: false });
  });

  it("hashed 含多个 $ 时返回 ok:false（格式不符）", () => {
    const hashed = hashPassword("secret");
    const [salt, hash] = hashed.split("$");
    expect(verifyPassword("secret", `${salt}$${hash}$extra`)).toEqual({
      ok: false,
    });
  });

  it("salt 段缺失时返回 ok:false", () => {
    const hashed = hashPassword("secret");
    expect(verifyPassword("secret", `$${hashed.split("$")[1]}`)).toEqual({
      ok: false,
    });
  });

  it("hash 段缺失时返回 ok:false", () => {
    const hashed = hashPassword("secret");
    expect(verifyPassword("secret", `${hashed.split("$")[0]}$`)).toEqual({
      ok: false,
    });
  });

  it("salt 非法 hex 时返回 ok:false（不抛错，被 try/catch 兜底）", () => {
    const hashed = hashPassword("secret");
    const realHash = hashed.split("$")[1];
    expect(verifyPassword("secret", `zzzz$${realHash}`)).toEqual({ ok: false });
  });

  it("hash 段非法 hex 时返回 ok:false", () => {
    const hashed = hashPassword("secret");
    const realSalt = hashed.split("$")[0];
    expect(verifyPassword("secret", `${realSalt}$zzzz`)).toEqual({ ok: false });
  });

  it("hash 段长度异常时返回 ok:false（长度不一致即判定失败）", () => {
    const hashed = hashPassword("secret");
    const [salt] = hashed.split("$");
    // hash 段只有 30 hex 字符（比预期少 2）
    const shortHash = "ab".repeat(15);
    expect(verifyPassword("secret", `${salt}$${shortHash}`)).toEqual({
      ok: false,
    });
  });
});

describe("hashPassword ↔ verifyPassword 集成", () => {
  it("hash 再 verify 原密码始终通过", () => {
    const samples = ["p@ssw0rd", "123456", "中文密码", "🎮emoji🔑", "a".repeat(500)];
    for (const pw of samples) {
      const hashed = hashPassword(pw);
      expect(verifyPassword(pw, hashed)).toEqual({ ok: true });
    }
  });

  it("同一密码两次哈希都可通过校验（随机 salt 不影响验证）", () => {
    const pw = "stability-check";
    const a = hashPassword(pw);
    const b = hashPassword(pw);
    expect(a).not.toBe(b);
    expect(verifyPassword(pw, a)).toEqual({ ok: true });
    expect(verifyPassword(pw, b)).toEqual({ ok: true });
  });

  it("用 A 的哈希验证 B 的密码一定失败", () => {
    const a = hashPassword("password-a");
    expect(verifyPassword("password-b", a)).toEqual({ ok: false });
  });
});
