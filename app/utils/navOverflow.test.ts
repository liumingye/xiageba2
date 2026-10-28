// 导航溢出计算测试：锁住「放得下 / 收进更多 / 至少留一个」这三条决策
// 对应源码：app/utils/navOverflow.ts

import { describe, expect, it } from "vitest";
import {
  buildNavLayoutKey,
  computeVisibleNavCount,
  NAV_GAP,
} from "./navOverflow";

describe("computeVisibleNavCount", () => {
  it("全部放得下时返回菜单总数", () => {
    // 3 × 100 + 2 × gap = 308，容器 400 足够
    expect(
      computeVisibleNavCount({
        containerWidth: 400,
        itemWidths: [100, 100, 100],
        moreWidth: 88,
      }),
    ).toBe(3);
  });

  it("放不下时先扣掉「更多」按钮宽度与一个 gap", () => {
    // 容器 200，可用 200-88-4=108，只塞得下第一个 100
    expect(
      computeVisibleNavCount({
        containerWidth: 200,
        itemWidths: [100, 100, 100],
        moreWidth: 88,
      }),
    ).toBe(1);
  });

  it("恰好填满可用宽度时仍算放得下，不多不少", () => {
    // 可用宽度 = 148-40-4 = 104，两项 50 加一个 gap 正好 104
    expect(
      computeVisibleNavCount({
        containerWidth: 148,
        itemWidths: [50, 50, 50],
        moreWidth: 40,
      }),
    ).toBe(2);
  });

  it("宽度为 0 的菜单不占位，也不计入数量", () => {
    // 只有第 2、4 项有宽度，容器 200 可用 146，只塞得下第一个 100
    expect(
      computeVisibleNavCount({
        containerWidth: 200,
        itemWidths: [0, 100, 0, 100],
        moreWidth: 50,
      }),
    ).toBe(1);
  });

  it("连一项都放不下时至少保留一个，避免更多按钮孤立在最左", () => {
    expect(
      computeVisibleNavCount({
        containerWidth: 50,
        itemWidths: [200, 200],
        moreWidth: 88,
      }),
    ).toBe(1);
  });

  it("容器宽度还没量出来时视为全部可见，菜单不会凭空消失", () => {
    expect(
      computeVisibleNavCount({
        containerWidth: 0,
        itemWidths: [100, 100, 100],
        moreWidth: 88,
      }),
    ).toBe(3);
  });

  it("空菜单返回 0", () => {
    expect(
      computeVisibleNavCount({
        containerWidth: 500,
        itemWidths: [],
        moreWidth: 88,
      }),
    ).toBe(0);
  });

  it("单个菜单且放不下时不会返回超过总数", () => {
    expect(
      computeVisibleNavCount({
        containerWidth: 60,
        itemWidths: [200],
        moreWidth: 88,
      }),
    ).toBe(1);
  });

  it("gap 可覆盖，默认值随 NAV_GAP", () => {
    // 容器 330：按 gap=4 时 308 放得下三项；改成 gap=20 后总宽 340 放不下，
    // 收进「更多」后可用 330-88-20=222，只塞得下 100+20+100=220 两项
    expect(
      computeVisibleNavCount({
        containerWidth: 330,
        itemWidths: [100, 100, 100],
        moreWidth: 88,
        gap: 20,
      }),
    ).toBe(2);

    // 同样输入用默认 gap=4 则三项全放得下
    expect(
      computeVisibleNavCount({
        containerWidth: 330,
        itemWidths: [100, 100, 100],
        moreWidth: 88,
      }),
    ).toBe(3);

    expect(NAV_GAP).toBe(4);
  });
});

describe("buildNavLayoutKey", () => {
  it("宽度相同则 key 相同，四舍五入抹掉亚像素抖动", () => {
    const a = buildNavLayoutKey({
      containerWidth: 100.4,
      itemWidths: [10.2],
      moreWidth: 88.2,
    });
    const b = buildNavLayoutKey({
      containerWidth: 100.49,
      itemWidths: [10.4],
      moreWidth: 88.4,
    });
    expect(a).toBe("100|10|88");
    expect(a).toBe(b);
  });

  it("任一宽度变化则 key 变化", () => {
    const base = buildNavLayoutKey({
      containerWidth: 100,
      itemWidths: [10, 20],
      moreWidth: 88,
    });
    expect(base).toBe("100|10|20|88");

    const wider = buildNavLayoutKey({
      containerWidth: 100,
      itemWidths: [10, 21],
      moreWidth: 88,
    });
    expect(wider).not.toBe(base);
  });
});
