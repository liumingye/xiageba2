import { describe, expect, it } from "vitest";
import { highlightTokens } from "./highlight";

describe("highlightTokens", () => {
  it("highlights overlapping tokens once without modifying generated markup", () => {
    const html = highlightTokens("a林俊杰林俊杰", [
      "a",
      "俊杰",
      "林俊杰",
      "俊杰",
      "林俊杰",
      "1",
    ]);

    expect(html).toBe(
      '<mark class="bg-transparent text-primary-400">a</mark>' +
        '<mark class="bg-transparent text-primary-400">林俊杰</mark>' +
        '<mark class="bg-transparent text-primary-400">林俊杰</mark>',
    );
  });

  it("escapes untrusted text before returning HTML", () => {
    expect(highlightTokens("<script>a</script>", ["a"])).toBe(
      '&lt;script&gt;<mark class="bg-transparent text-primary-400">a</mark>&lt;/script&gt;',
    );
  });
});
