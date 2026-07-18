import { describe, expect, it } from "vitest";
import {
  buildSearchWebQuery,
  cutForSearch,
  prioritizeSearchTokens,
} from "./jieba";

describe("cutForSearch", () => {
  it("removes duplicate and synthetic tokens", () => {
    const input = "a林俊杰林俊杰林俊杰林俊杰";
    const tokens = cutForSearch(input);

    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens).toContain("a");
    expect(tokens).toContain("林俊杰");
    expect(tokens).not.toContain("1");
    expect(tokens.every((token) => input.includes(token))).toBe(true);
  });

  it("drops weak single-character ASCII tokens from mixed OR searches", () => {
    expect(prioritizeSearchTokens(["a", "俊杰", "林俊杰", "1"])).toEqual([
      "林俊杰",
    ]);
    expect(prioritizeSearchTokens(["a"])).toEqual(["a"]);
    expect(prioritizeSearchTokens(["a", "林"])).toEqual(["a", "林"]);
  });

  it("removes redundant tokens and random numeric suffixes", () => {
    expect(
      prioritizeSearchTokens([
        "第四",
        "四季",
        "第四季",
        "开始",
        "推理",
        "吧",
        "31251254",
      ]),
    ).toEqual(["第四季", "开始", "推理"]);
  });

  it("builds an anchored fuzzy query", () => {
    expect(buildSearchWebQuery(["第四季", "开始", "推理"], false)).toBe(
      "第四季 (开始 OR 推理)",
    );
    expect(buildSearchWebQuery(["周杰伦", "晴天"], false)).toBe(
      "周杰伦 晴天",
    );
    expect(buildSearchWebQuery(["周杰伦", "晴天"], true)).toBe(
      "周杰伦 晴天",
    );
    expect(
      buildSearchWebQuery(
        prioritizeSearchTokens(["欠", "你", "的", "那场", "婚礼"]),
        false,
      ),
    ).toBe("那场 婚礼");
  });
});
