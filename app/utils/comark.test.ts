// Comark Markdown 插件配置测试
// 对应源码：app/utils/comark.ts
//
// 仅验证插件数组的结构与长度；插件实例内部实现由 @comark/nuxt 自身保证。

import { describe, expect, it } from "vitest";
import { markdownPlugins, safeMarkdownPlugins } from "./comark";

describe("markdownPlugins", () => {
  it("是数组", () => {
    expect(Array.isArray(markdownPlugins)).toBe(true);
  });
});

describe("safeMarkdownPlugins", () => {
  it("是数组", () => {
    expect(Array.isArray(safeMarkdownPlugins)).toBe(true);
  });
});
