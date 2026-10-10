import { describe, expect, it } from "vitest";
import {
  buildSearchWebQuery,
  cutForSearch,
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
  });
});
