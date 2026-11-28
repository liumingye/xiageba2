import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * ADMIN_SECRET 读取入口测试
 *
 * 覆盖历史 Bug：只检查「有没有值」，照抄 .env.example 的占位值部署时，
 * 密钥是公开的，任何人都能伪造后台令牌与验证码通行令牌。
 */

import { readAdminSecret } from "./adminSecret";

let original: string | undefined;

beforeEach(() => {
  original = process.env.ADMIN_SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = original;
});

describe("readAdminSecret", () => {
  it("返回配置的原值（不做裁剪，避免悄悄改变签名密钥）", () => {
    process.env.ADMIN_SECRET = "  s3cret-value  ";
    expect(readAdminSecret("auth")).toBe("  s3cret-value  ");
  });

  it("未设置时抛错", () => {
    delete process.env.ADMIN_SECRET;
    expect(() => readAdminSecret("auth")).toThrow(/ADMIN_SECRET 环境变量未设置/);
  });

  it("只有空白时视为未设置", () => {
    process.env.ADMIN_SECRET = "   ";
    expect(() => readAdminSecret("auth")).toThrow(/未设置/);
  });

  it(".env.example 的占位值被拒绝", () => {
    process.env.ADMIN_SECRET = "change-me-in-production";
    expect(() => readAdminSecret("auth")).toThrow(/占位值/);
  });

  it("占位值的大小写、首尾空白变体同样被拒绝", () => {
    for (const variant of [
      "Change-Me-In-Production",
      "CHANGE-ME-IN-PRODUCTION",
      "  change-me-in-production\n",
    ]) {
      process.env.ADMIN_SECRET = variant;
      expect(() => readAdminSecret("auth"), variant).toThrow(/占位值/);
    }
  });

  it("仅在开头或结尾包含占位值的自定义密钥可以正常使用", () => {
    process.env.ADMIN_SECRET = "change-me-in-production-9f2c71";
    expect(readAdminSecret("auth")).toBe("change-me-in-production-9f2c71");
  });

  it("错误信息带上调用方传入的链路标识", () => {
    process.env.ADMIN_SECRET = "change-me-in-production";
    expect(() => readAdminSecret("bot-defense")).toThrow(/^\[bot-defense\]/);
    expect(() => readAdminSecret("auth")).toThrow(/^\[auth\]/);
  });
});
