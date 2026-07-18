import { describe, expect, it } from "vitest";
import { cutForSearch } from "./jieba";

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
});
