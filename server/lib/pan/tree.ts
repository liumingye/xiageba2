import { TREE_MAX_LINE } from "#server/lib/const";
import type { PanFile } from "./types";

/**
 * 网盘目录树的通用渲染。
 *
 * 重构前：tree.get.ts 里 5 个 walkXxx 各自实现了一遍「连接符 + 缩进 + 深度限制 +
 * 行数截断 + 递归」，那段 for 循环被逐字复制了 5 份，只有取名字段的写法不同。
 * 现在渲染骨架只此一份，各网盘只需回答一个问题：**给我某个目录 id 的子项**。
 */

const DEFAULT_MAX_DEPTH = 5;

/** 行数截断的余量：允许略微超出上限，避免刚好卡在边界把整棵子目录丢掉 */
const LINE_LIMIT_SLACK = 5;

/**
 * 目录排在前面，同类型按文件名自然序排序（原地排序，与既有行为一致）
 */
export function sortEntries<T extends { name: string; isDir: boolean }>(
  items: T[],
): T[] {
  return items.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export interface RenderTreeOptions {
  /**
   * 根节点 id。各网盘语义不同：夸克 "0"、百度 "/"、光鸭 ""、139 "root"。
   * 由调用方给出，渲染层不关心。
   */
  rootId: string;
  /** 列出某个目录的直接子项，网盘适配器负责分页、排序与广告过滤 */
  listChildren: (parentId: string) => Promise<PanFile[]>;
  maxLines?: number;
  maxDepth?: number;
}

async function walk(
  listChildren: (parentId: string) => Promise<PanFile[]>,
  parentId: string,
  prefix: string,
  depth: number,
  lines: string[],
  maxLines: number,
  maxDepth: number,
): Promise<void> {
  if (depth >= maxDepth) return;

  const items = await listChildren(parentId);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    const isLast = i === items.length - 1;
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${item.name}`);

    if (lines.length >= maxLines + LINE_LIMIT_SLACK) break;

    if (item.isDir) {
      const extension = depth === 0 ? "" : isLast ? "  " : "│  ";
      await walk(
        listChildren,
        item.id,
        prefix + extension,
        depth + 1,
        lines,
        maxLines,
        maxDepth,
      );
    }
  }
}

/**
 * 递归生成缩进式目录树文本
 */
export async function renderTree(options: RenderTreeOptions): Promise<string> {
  const { rootId, listChildren } = options;
  const maxLines = options.maxLines ?? TREE_MAX_LINE;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const lines: string[] = [];
  await walk(listChildren, rootId, "", 0, lines, maxLines, maxDepth);
  return lines.join("\n");
}
