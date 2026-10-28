/**
 * 导航栏溢出计算
 *
 * 后台顶部导航放不下时要把尾部菜单收进「更多」。这个决策只取决于
 * 容器宽度、每个菜单的实测宽度、以及「更多」按钮宽度，与路由、
 * 菜单数据本身无关，因此单独拎成纯函数：
 *
 * - 组件那边只管量 DOM、订阅 resize
 * - 这里只管算「能放几个」
 *
 * 抽出来的直接收益是这段逻辑可以被单测覆盖 —— 之前它埋在 156 行的
 * async 函数里，依赖 ResizeObserver 和 nextTick，几乎无法验证。
 */

/** Tailwind gap-1 = 0.25rem = 4px，「更多」按钮与菜单之间的间距 */
export const NAV_GAP = 4;

export interface NavOverflowInput {
  /** 导航容器可用宽度 */
  containerWidth: number;
  /** 每个菜单的实测宽度，顺序与菜单数据一致 */
  itemWidths: number[];
  /** 「更多」按钮宽度 */
  moreWidth: number;
  /** 菜单间距，默认 4px */
  gap?: number;
}

/**
 * 计算不用折叠时可以显示多少个菜单。
 *
 * 全部放得下 → 返回总数；否则预留「更多」按钮的位置，按顺序贪心塞入，
 * 最少保留 1 个（否则「更多」按钮会孤零零挂在最左侧，看起来像坏掉）。
 */
export function computeVisibleNavCount({
  containerWidth,
  itemWidths,
  moreWidth,
  gap = NAV_GAP,
}: NavOverflowInput): number {
  const total = itemWidths.length;
  if (total === 0) return 0;

  // 宽度还没量出来（隐藏状态、首帧）时先当作全部可见，避免菜单凭空消失
  if (containerWidth <= 0) return total;

  const totalWidth =
    itemWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(total - 1, 0) * gap;

  if (totalWidth <= containerWidth) return total;

  // 要显示「更多」，先扣掉它自己的宽度和与它相邻的一个 gap
  const availableForItems = containerWidth - moreWidth - gap;
  if (availableForItems <= 0) return 1;

  let count = 0;
  let usedWidth = 0;

  for (const itemWidth of itemWidths) {
    // 宽度为 0 的项（未渲染/隐藏）不占位，直接跳过不计入
    if (!itemWidth) continue;

    const nextWidth = count === 0 ? itemWidth : usedWidth + gap + itemWidth;
    if (nextWidth > availableForItems) break;

    usedWidth = nextWidth;
    count++;
  }

  return Math.min(Math.max(count, 1), total);
}

/**
 * 生成布局缓存 key。
 *
 * 宽度没变化时没必要重算 —— ResizeObserver 在滚动、动画里触发得非常密。
 */
export function buildNavLayoutKey({
  containerWidth,
  itemWidths,
  moreWidth,
}: Omit<NavOverflowInput, "gap">): string {
  return [Math.round(containerWidth), ...itemWidths.map((w) => Math.round(w)), Math.round(moreWidth)].join(
    "|",
  );
}
