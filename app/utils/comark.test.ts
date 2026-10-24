// Comark Markdown 插件配置测试
// 对应源码：app/utils/comark.ts（信任内容 + shiki）
//          app/utils/comark-safe.ts（不可信内容，仅 security）
//
// 仅验证插件数组的结构与导出名；插件实例内部实现由 @comark/nuxt 自身保证。
// 另外守住拆分边界：comark-safe 不得重新引入 shiki，否则 543KB 又会回到
// 搜索页 / 资源详情页的首屏 chunk。

import { describe, expect, it } from "vitest";
import { markdownPlugins } from "./comark";
import { safeMarkdownPlugins } from "./comark-safe";

describe("markdownPlugins", () => {
  it("是数组", () => {
    expect(Array.isArray(markdownPlugins)).toBe(true);
  });
});

describe("safeMarkdownPlugins", () => {
  it("是数组", () => {
    expect(Array.isArray(safeMarkdownPlugins)).toBe(true);
  });

  it("不含 shiki 高亮插件", () => {
    for (const plugin of safeMarkdownPlugins) {
      expect((plugin as { name?: string }).name).not.toBe("shiki");
    }
  });
});
