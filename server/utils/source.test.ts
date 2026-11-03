import { describe, expect, it, vi } from "vitest";

/**
 * buildSourceSearchTokens 测试
 *
 * 锁定 Source 全文索引分词的权威语义：标题 + 描述 + 清树形符号、
 * 按 TREE_MAX_LINE(150) 截断后的目录。重构前 import.post.ts 漏了截断，
 * source/[id].ts 靠自动导入隐式拿 truncateString，这里把语义钉死。
 */

const h = vi.hoisted(() => ({
  buildTokensCalls: [] as string[][],
}));

vi.mock("#server/lib/prisma", () => ({ prisma: {} }));
vi.mock("#server/lib/accountCache", () => ({ clearAccountCache: () => {} }));
vi.mock("#server/utils/jieba", () => ({
  buildTokens: (...terms: string[]) => {
    h.buildTokensCalls.push(terms);
    return terms.filter(Boolean).join(" ");
  },
}));

const { buildSourceSearchTokens } = await import("./source");

describe("buildSourceSearchTokens", () => {
  it("按 (标题, 描述, 目录) 三段组词", () => {
    const tokens = buildSourceSearchTokens({
      title: "标题",
      description: "描述",
      menu: "目录",
    });

    expect(h.buildTokensCalls.at(-1)).toEqual(["标题", "描述", "目录"]);
    expect(tokens).toBe("标题 描述 目录");
  });

  it("null 字段按空串处理", () => {
    buildSourceSearchTokens({ title: null, description: null, menu: null });
    expect(h.buildTokensCalls.at(-1)).toEqual(["", "", ""]);
  });

  it("目录中的树形符号（├ └ ─）被清除", () => {
    buildSourceSearchTokens({ menu: "├─ 专辑A\n└─ 01.mp3" });
    expect(h.buildTokensCalls.at(-1)?.[2]).toBe(" 专辑A\n 01.mp3");
  });

  it("目录超过 150 行被截断到 150 行（与全量重建语义一致）", () => {
    const longMenu = Array.from({ length: 300 }, (_, i) => `line${i}`).join(
      "\n",
    );
    buildSourceSearchTokens({ menu: longMenu });

    const menuArg = h.buildTokensCalls.at(-1)?.[2] ?? "";
    expect(menuArg.split("\n")).toHaveLength(150);
    expect(menuArg.startsWith("line0\n")).toBe(true);
    expect(menuArg.endsWith("line149")).toBe(true);
    expect(menuArg).not.toContain("line150");
  });

  it("150 行整不截断", () => {
    const menu = Array.from({ length: 150 }, (_, i) => `line${i}`).join("\n");
    buildSourceSearchTokens({ menu });
    expect((h.buildTokensCalls.at(-1)?.[2] ?? "").split("\n")).toHaveLength(
      150,
    );
  });
});
