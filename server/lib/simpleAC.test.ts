// SimpleAC 多模式匹配自动机测试
// 对应源码：server/lib/simpleAC.ts
//
// 注意：源码顶层调用 initAutomaton_websearch_filter_keywords()，触发
// #server/lib/configCache 的 getConfigValue（依赖 Prisma）。
// 这里用 vi.mock 在模块加载前替换 configCache，避免数据库依赖。

import { describe, expect, it, vi } from "vitest";

// mock 必须在 import 之前；vi.mock 会被提升到文件顶部执行
vi.mock("#server/lib/configCache", () => ({
  getConfigValue: vi.fn().mockResolvedValue(""),
}));

import {
  SimpleAC,
  initAutomaton_websearch_filter_keywords,
  automaton_websearch_filter_keywords,
  websearch_filter_keywords_list,
} from "./simpleAC";
import { getConfigValue } from "#server/lib/configCache";

describe("SimpleAC", () => {
  describe("构造与边界", () => {
    it("空 keywords 数组也能正常构造", () => {
      const ac = new SimpleAC([]);
      expect(ac.hasMatch("any text")).toBe(false);
      expect(ac.hasFullMatch("any text")).toBe(false);
    });

    it("含空字符串的 keywords 被自动过滤", () => {
      const ac = new SimpleAC(["", "hello", ""]);
      expect(ac.hasMatch("hello world")).toBe(true);
      expect(ac.hasFullMatch("hello")).toBe(true);
    });

    it("单个关键词也能正常构造", () => {
      const ac = new SimpleAC(["独自"]);
      expect(ac.hasMatch("独自")).toBe(true);
      expect(ac.hasMatch("独自一人")).toBe(true);
      expect(ac.hasMatch("别的话")).toBe(false);
    });
  });

  describe("hasMatch - 子串匹配", () => {
    const ac = new SimpleAC(["激情", "暴力", "色情"]);

    it("text 整体等于关键词时命中", () => {
      expect(ac.hasMatch("激情")).toBe(true);
    });

    it("text 包含关键词作为子串时命中", () => {
      expect(ac.hasMatch("激情演唱会")).toBe(true);
      expect(ac.hasMatch("激情电影")).toBe(true);
    });

    it("text 在中间包含关键词也命中", () => {
      expect(ac.hasMatch("一段激情视频")).toBe(true);
    });

    it("多个关键词任一命中即返回 true", () => {
      expect(ac.hasMatch("电影里有暴力")).toBe(true);
      expect(ac.hasMatch("色情内容")).toBe(true);
    });

    it("text 不含任何关键词返回 false", () => {
      expect(ac.hasMatch("正常文本")).toBe(false);
      expect(ac.hasMatch("音乐分享")).toBe(false);
    });

    it("空 text 返回 false", () => {
      expect(ac.hasMatch("")).toBe(false);
    });

    it("大小写敏感（英文 ASCII 区分大小写）", () => {
      const acEn = new SimpleAC(["Porn"]);
      expect(acEn.hasMatch("Porn")).toBe(true);
      expect(acEn.hasMatch("porn")).toBe(false);
      expect(acEn.hasMatch("PORN")).toBe(false);
    });
  });

  describe("hasFullMatch - 完整匹配", () => {
    const ac = new SimpleAC(["激情", "暴力"]);

    it("text 整体等于关键词时返回 true", () => {
      expect(ac.hasFullMatch("激情")).toBe(true);
      expect(ac.hasFullMatch("暴力")).toBe(true);
    });

    it("text 是关键词的超集（含子串）时返回 false", () => {
      // 关键测试：避免误伤"激情演唱会"（AGENTS.md 明确要求）
      expect(ac.hasFullMatch("激情演唱会")).toBe(false);
      expect(ac.hasFullMatch("激情电影")).toBe(false);
      expect(ac.hasFullMatch("一段激情")).toBe(false);
    });

    it("text 与任何关键词都无关时返回 false", () => {
      expect(ac.hasFullMatch("正常")).toBe(false);
      expect(ac.hasFullMatch("")).toBe(false);
    });
  });

  describe("AC 自动机算法特性", () => {
    it("fail 指针正确传播（重叠关键词）", () => {
      // "abc" 与 "bcd" 共享后缀 "bc"
      const ac = new SimpleAC(["abc", "bcd"]);
      expect(ac.hasMatch("abc")).toBe(true);
      expect(ac.hasMatch("bcd")).toBe(true);
      expect(ac.hasMatch("abcd")).toBe(true);
      expect(ac.hasMatch("abcbcd")).toBe(true);
      expect(ac.hasMatch("xyzbcd123")).toBe(true);
      expect(ac.hasMatch("xyz")).toBe(false);
    });

    it("长前缀的关键词正确匹配", () => {
      const ac = new SimpleAC(["周杰伦", "周杰"]);
      expect(ac.hasMatch("周杰伦演唱会")).toBe(true);
      expect(ac.hasMatch("周杰")).toBe(true);
      expect(ac.hasMatch("周")).toBe(false);
    });

    it("单字符关键词也能正常匹配", () => {
      const ac = new SimpleAC(["x"]);
      expect(ac.hasMatch("x")).toBe(true);
      expect(ac.hasMatch("axb")).toBe(true);
      expect(ac.hasMatch("ab")).toBe(false);
    });

    it("重复关键词去重不影响匹配", () => {
      const ac = new SimpleAC(["激情", "激情", "激情"]);
      expect(ac.hasMatch("激情")).toBe(true);
      expect(ac.hasFullMatch("激情")).toBe(true);
    });
  });
});

describe("initAutomaton_websearch_filter_keywords", () => {
  it("getConfigValue 返回空串时仅使用默认关键词", async () => {
    vi.mocked(getConfigValue).mockResolvedValue("");
    await initAutomaton_websearch_filter_keywords();

    expect(automaton_websearch_filter_keywords).toBeInstanceOf(SimpleAC);
    // 默认关键词包含在自动机中
    expect(automaton_websearch_filter_keywords!.hasFullMatch("激情")).toBe(true);
    expect(automaton_websearch_filter_keywords!.hasFullMatch("强奸")).toBe(true);
    expect(automaton_websearch_filter_keywords!.hasFullMatch("正常词汇")).toBe(false);

    // 配置关键词列表为空（getConfigValue 返回空）
    expect(websearch_filter_keywords_list).toEqual([]);
  });

  it("getConfigValue 返回配置词时合并默认 + 配置词", async () => {
    vi.mocked(getConfigValue).mockResolvedValue("测试词1, 测试词2 ,测试词3");
    await initAutomaton_websearch_filter_keywords();

    // 默认关键词仍在
    expect(automaton_websearch_filter_keywords!.hasFullMatch("激情")).toBe(true);
    // 配置关键词也加入（小写化）
    expect(automaton_websearch_filter_keywords!.hasFullMatch("测试词1")).toBe(true);
    expect(automaton_websearch_filter_keywords!.hasFullMatch("测试词3")).toBe(true);

    // 配置关键词列表被正确解析（trim + 过滤空项）
    expect(websearch_filter_keywords_list).toEqual([
      "测试词1",
      "测试词2",
      "测试词3",
    ]);
  });

  it("getConfigValue 仅含分隔符时配置词列表为空", async () => {
    vi.mocked(getConfigValue).mockResolvedValue(",, ,,");
    await initAutomaton_websearch_filter_keywords();
    expect(websearch_filter_keywords_list).toEqual([]);
  });
});
