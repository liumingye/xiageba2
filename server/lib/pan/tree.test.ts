import { describe, expect, it } from "vitest";
import { renderTree, sortEntries } from "./tree";
import type { PanFile } from "./types";

const file = (id: string, name: string): PanFile => ({ id, name, isDir: false });
const dir = (id: string, name: string): PanFile => ({ id, name, isDir: true });

describe("sortEntries", () => {
  it("目录排在文件前面", () => {
    const result = sortEntries([
      file("1", "a.txt"),
      dir("2", "z-folder"),
      file("3", "b.txt"),
    ]);
    expect(result.map((f) => f.name)).toEqual(["z-folder", "a.txt", "b.txt"]);
  });

  it("同类型按文件名自然序（数字按数值比较）", () => {
    const result = sortEntries([
      file("1", "第10集.mp3"),
      file("2", "第2集.mp3"),
      file("3", "第1集.mp3"),
    ]);
    expect(result.map((f) => f.name)).toEqual([
      "第1集.mp3",
      "第2集.mp3",
      "第10集.mp3",
    ]);
  });

  it("原地排序并返回同一数组引用", () => {
    const input = [file("1", "b"), file("2", "a")];
    expect(sortEntries(input)).toBe(input);
  });
});

describe("renderTree", () => {
  const tree: Record<string, PanFile[]> = {
    "0": [dir("a", "专辑A"), file("b", "说明.txt")],
    a: [file("a1", "01.mp3"), dir("a2", "子目录B")],
    a2: [file("a2x", "深处.flac")],
  };

  const listChildren = async (parentId: string) => tree[parentId] ?? [];

  it("按既有格式输出缩进式目录树", async () => {
    const output = await renderTree({ rootId: "0", listChildren });
    expect(output).toBe(
      [
        "专辑A",
        "├─ 01.mp3",
        "└─ 子目录B",
        "  └─ 深处.flac",
        "说明.txt",
      ].join("\n"),
    );
  });

  it("顶层条目不带连接符，非末项用 ├─ 末项用 └─", async () => {
    const output = await renderTree({ rootId: "0", listChildren });
    const lines = output.split("\n");
    expect(lines[0]).toBe("专辑A");
    expect(lines[1]).toMatch(/^├─ /);
    expect(lines[2]).toMatch(/^└─ /);
  });

  it("顶层目录的子级不带缩进（depth=0 时 extension 恒为空）", async () => {
    const output = await renderTree({
      rootId: "root",
      listChildren: async (id) => {
        if (id === "root") return [dir("d1", "第一个"), dir("d2", "第二个")];
        return [file(`${id}-f`, "x.mp3")];
      },
    });
    // 顶层条目占 0 列，其子级也从 0 列开始；缩进只在第二层及以下产生
    expect(output.split("\n")).toEqual([
      "第一个",
      "└─ x.mp3",
      "第二个",
      "└─ x.mp3",
    ]);
  });

  it("非末项目录的子级用竖线续接", async () => {
    const output = await renderTree({
      rootId: "root",
      listChildren: async (id) => {
        if (id === "root") return [dir("d1", "根")];
        if (id === "d1") return [dir("d1a", "中间"), file("d2b", "末尾")];
        return [file("leaf", "leaf.mp3")];
      },
    });
    expect(output.split("\n")).toEqual([
      "根",
      "├─ 中间",
      "│  └─ leaf.mp3",
      "└─ 末尾",
    ]);
  });

  it("达到 maxDepth 后停止下探", async () => {
    let deepest = 0;
    const output = await renderTree({
      rootId: "0",
      maxDepth: 2,
      listChildren: async (id) => {
        const depth = id === "0" ? 0 : Number(id);
        deepest = Math.max(deepest, depth);
        return [dir(String(depth + 1), `d${depth + 1}`)];
      },
    });
    // maxDepth=2 时只会渲染 d1、d2 两层
    expect(deepest).toBe(1);
    expect(output.split("\n")).toHaveLength(2);
  });

  it("超出 maxLines 后停止收集，保留其前后容差", async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      file(String(i), `第${i}集.mp3`),
    );
    const output = await renderTree({
      rootId: "0",
      maxLines: 10,
      listChildren: async () => many,
    });
    // 上限判定在 push 之后、容差为 5，因此最多收集到 maxLines + 5 行
    expect(output.split("\n").length).toBe(15);
  });

  it("空目录返回空字符串", async () => {
    const output = await renderTree({
      rootId: "0",
      listChildren: async () => [],
    });
    expect(output).toBe("");
  });
});
