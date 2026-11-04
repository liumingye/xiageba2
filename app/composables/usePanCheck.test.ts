import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectiveBinding, ObjectDirective } from "vue";
import { usePanCheck } from "./usePanCheck";

/**
 * usePanCheck 视口懒检测单测（滚动停止才送检）
 *
 * node 环境无 DOM，用假 IntersectionObserver + fetch stub + 假定时器驱动。
 * 锁定行为：
 * 1. registerItems 只注册不检测，滚动停止后仍在视口内才发起请求
 * 2. 快速滚过（进了又出）的 item 不送检；中途停顿不足 settle 会重置计时
 * 3. 移动端触摸滚动（IO 回调被抑制/延迟）时 scroll 事件兜底重置 settle，
 *    flush 前再做真实位置校验，已滚出视口的不送检
 * 4. flushDelay 聚合 + batchSize 串行分批，在途批次跑完再接续新视口
 * 5. stopPanCheck 中断未发出的批次并清空状态
 * 6. 老浏览器（无 IntersectionObserver）退化为注册即检测
 * 7. enabled=false 全程静默
 */

const FLUSH_DELAY = 150;
const SETTLE_DELAY = 300;
const VIEWPORT_HEIGHT = 800;

/** 推进到「滚动停止 + 队列聚合」之后 */
const advancePastSettle = () =>
  vi.advanceTimersByTimeAsync(SETTLE_DELAY + FLUSH_DELAY + 20);

type ServerStatus = "valid" | "invalid" | "pending" | "unknown";

/** 假 IntersectionObserver：记录观察目标，支持手动触发交叉回调 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed = new Set<Element>();

  constructor(
    public callback: (entries: IntersectionObserverEntry[]) => void,
    public init?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.add(el);
  }

  unobserve(el: Element) {
    this.observed.delete(el);
  }

  disconnect() {
    this.observed.clear();
  }

  /** 模拟元素进入 / 离开视口 */
  fire(el: Element, isIntersecting: boolean) {
    this.callback([
      { target: el, isIntersecting } as IntersectionObserverEntry,
    ]);
  }
}

/** 假 window：支持 scroll 事件监听/触发，供移动端场景用例驱动 */
type ScrollListener = (event?: unknown) => void;
const scrollListeners = new Set<ScrollListener>();
const fakeWindow = {
  innerHeight: VIEWPORT_HEIGHT,
  addEventListener: (type: string, fn: ScrollListener) => {
    if (type === "scroll") scrollListeners.add(fn);
  },
  removeEventListener: (type: string, fn: ScrollListener) => {
    if (type === "scroll") scrollListeners.delete(fn);
  },
};
const fireScroll = () => scrollListeners.forEach((fn) => fn({ type: "scroll" }));

/** 构造带几何信息的假元素 */
const makeElement = (rect: { top: number; bottom: number }) =>
  ({
    getBoundingClientRect: () => ({
      top: rect.top,
      bottom: rect.bottom,
      left: 0,
      right: 0,
      width: 0,
      height: rect.bottom - rect.top,
    }),
  }) as unknown as Element;

let statusOverrides: Record<string, ServerStatus> = {};
let fetchMock: ReturnType<
  typeof vi.fn<
    (_url: string, init?: { body?: string }) => Promise<{ json: () => Promise<unknown> }>
  >
>;

const stubBrowser = () => {
  statusOverrides = {};
  scrollListeners.clear();
  fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const items: string[] = body.ids ?? body.urls ?? [];
    const statuses: Record<string, ServerStatus> = {};
    for (const item of items) {
      statuses[item] = statusOverrides[item] ?? "valid";
    }
    return { json: async () => ({ success: true, statuses }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  FakeIntersectionObserver.instances = [];
};

/** 实际发给 /api/source/check 的每批 item */
const sentBatches = () =>
  fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).ids);

const makeBinding = (value: string, oldValue?: string) =>
  ({
    value,
    oldValue,
    arg: undefined,
    modifiers: {},
    dir: {},
    instance: null,
  }) as unknown as DirectiveBinding<string>;

type PanCheckDirective = ObjectDirective<Element, string>;

const mountItem = (d: PanCheckDirective, el: Element, value: string) =>
  d.mounted!(el, makeBinding(value), null as never, null);

const updateItem = (
  d: PanCheckDirective,
  el: Element,
  value: string,
  oldValue: string,
) => d.updated!(el, makeBinding(value, oldValue), null as never, null as never);

const unmountItem = (d: PanCheckDirective, el: Element) =>
  d.unmounted!(el, makeBinding(""), null as never, null);

describe("usePanCheck（视口懒检测 · 滚动停止才送检）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // onBeforeUnmount 在无组件实例时会 warn，测试中屏蔽
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registerItems 只注册不检测，滚动停止才发起请求", async () => {
    const { registerItems, vPanCheck, itemStatusMap } = usePanCheck();
    registerItems(["a", "b", "c"]);
    // 注册不等于检测：未进入视口前没有任何状态与请求
    expect(itemStatusMap.size).toBe(0);

    const elA = {} as Element;
    const elB = {} as Element;
    mountItem(vPanCheck, elA, "a");
    mountItem(vPanCheck, elB, "b");

    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.observed.size).toBe(2);

    // a 进入视口但滚动未停：不发请求，观察保持
    observer.fire(elA, true);
    await vi.advanceTimersByTimeAsync(SETTLE_DELAY - 50);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(observer.observed.has(elA)).toBe(true);

    // 滚动停下：送检
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 70);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatches()).toEqual([["a"]]);
    expect(itemStatusMap.get("a")).toBe("valid");
    expect(itemStatusMap.get("b")).toBeUndefined();
    expect(itemStatusMap.get("c")).toBeUndefined();
    // 送检后解绑，滚回去不重复检测
    expect(observer.observed.has(elA)).toBe(false);
  });

  it("快速滚过（进了又出视口）的 item 不送检", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a", "b"]);
    const elA = {} as Element;
    const elB = {} as Element;
    mountItem(vPanCheck, elA, "a");
    mountItem(vPanCheck, elB, "b");
    const observer = FakeIntersectionObserver.instances[0]!;

    // 一路滚到底：a 瞬间进入又离开，b 停在视口内
    observer.fire(elA, true);
    observer.fire(elA, false);
    observer.fire(elB, true);
    await advancePastSettle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatches()).toEqual([["b"]]);
  });

  it("滚动中途停顿不足 settle 会重置计时，不停不送检", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");
    const observer = FakeIntersectionObserver.instances[0]!;

    observer.fire(elA, true);
    await vi.advanceTimersByTimeAsync(SETTLE_DELAY - 100);
    // 又滚动了：离开视口，计时重置
    observer.fire(elA, false);
    await vi.advanceTimersByTimeAsync(SETTLE_DELAY + FLUSH_DELAY + 20);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("移动端：IO 回调被抑制时 scroll 事件兜底，滑动停后才送检", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");
    const observer = FakeIntersectionObserver.instances[0]!;

    // 首屏进入视口
    observer.fire(elA, true);

    // 模拟移动端触摸滚动：惯性滑动期间 IO 回调被浏览器抑制，
    // 只有 scroll 事件在持续触发
    fireScroll();
    await vi.advanceTimersByTimeAsync(SETTLE_DELAY - 50);
    fireScroll();
    await vi.advanceTimersByTimeAsync(SETTLE_DELAY - 50);
    expect(fetchMock).not.toHaveBeenCalled();

    // 惯性停住：300ms 后送检
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 70);
    expect(sentBatches()).toEqual([["a"]]);
  });

  it("移动端：IO 报了 enter 但已滚出视口的项，flush 前位置校验滤除", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a", "b"]);
    // a 此刻真在视口内；b 的 exit 回调还没到（IO 延迟），但实际已滚出视口
    const elA = makeElement({ top: 100, bottom: 400 });
    const elB = makeElement({ top: -2000, bottom: -1600 });
    mountItem(vPanCheck, elA, "a");
    mountItem(vPanCheck, elB, "b");
    const observer = FakeIntersectionObserver.instances[0]!;

    observer.fire(elA, true);
    observer.fire(elB, true);
    await advancePastSettle();

    expect(sentBatches()).toEqual([["a"]]);
  });

  it("stopPanCheck 解绑 scroll 监听，stop 后滚动不再触发送检", async () => {
    const { registerItems, vPanCheck, stopPanCheck } = usePanCheck();
    registerItems(["a"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");
    expect(scrollListeners.size).toBe(1);

    stopPanCheck();
    expect(scrollListeners.size).toBe(0);

    fireScroll();
    await advancePastSettle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("中途停顿达标即送检，在途批次跑完再接续新视口", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a", "b"]);
    const elA = {} as Element;
    const elB = {} as Element;
    mountItem(vPanCheck, elA, "a");
    mountItem(vPanCheck, elB, "b");
    const observer = FakeIntersectionObserver.instances[0]!;

    // 第一波：a 停住 → 送检
    observer.fire(elA, true);
    await advancePastSettle();
    expect(sentBatches()).toEqual([["a"]]);

    // 继续滚动，b 进入视口 → 排到队尾，前一批已完成后自然接续
    observer.fire(elB, true);
    await advancePastSettle();
    expect(sentBatches()).toEqual([["a"], ["b"]]);
  });

  it("batchSize 内合并、超量串行排队", async () => {
    const { registerItems, vPanCheck } = usePanCheck({ batchSize: 2 });
    registerItems(["a", "b", "c", "d", "e"]);
    const els = ["a", "b", "c", "d", "e"].map((id) => {
      const el = {} as Element;
      mountItem(vPanCheck, el, id);
      return el;
    });
    const observer = FakeIntersectionObserver.instances[0]!;
    els.forEach((el) => observer.fire(el, true));

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentBatches()).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  it("stopPanCheck 中断未发出的批次并清空状态", async () => {
    const { registerItems, vPanCheck, stopPanCheck, itemStatusMap, checking } =
      usePanCheck();
    registerItems(["a", "b"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");
    const observer = FakeIntersectionObserver.instances[0]!;
    observer.fire(elA, true);

    // 在 settle 定时器触发前中止
    stopPanCheck();
    await advancePastSettle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(itemStatusMap.size).toBe(0);
    expect(checking.value).toBe(false);
  });

  it("stop 后重新注册可恢复正常检测", async () => {
    const { registerItems, vPanCheck, stopPanCheck } = usePanCheck();
    registerItems(["a"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");
    stopPanCheck();

    registerItems(["a"]);
    mountItem(vPanCheck, elA, "a");
    // stop 后旧 observer 已 disconnect，重新 observe 会创建新实例
    const observer = FakeIntersectionObserver.instances[1]!;
    observer.fire(elA, true);
    await advancePastSettle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatches()).toEqual([["a"]]);
  });

  it("invalid / 未知状态分别映射为 invalid / failed", async () => {
    statusOverrides = { b: "invalid", c: "pending" };
    const { registerItems, vPanCheck, itemStatusMap, validItems } =
      usePanCheck({ batchSize: 3 });
    registerItems(["a", "b", "c"]);
    const els = ["a", "b", "c"].map((id) => {
      const el = {} as Element;
      mountItem(vPanCheck, el, id);
      return el;
    });
    const observer = FakeIntersectionObserver.instances[0]!;
    els.forEach((el) => observer.fire(el, true));
    await advancePastSettle();

    expect(itemStatusMap.get("a")).toBe("valid");
    expect(itemStatusMap.get("b")).toBe("invalid");
    expect(itemStatusMap.get("c")).toBe("failed");
    expect([...validItems.value]).toEqual(["a"]);
  });

  it("老浏览器（无 IntersectionObserver）退化为注册即检测", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { registerItems, itemStatusMap } = usePanCheck({ batchSize: 2 });
    registerItems(["a", "b", "c"]);

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBatches()).toEqual([["a", "b"], ["c"]]);
    expect(itemStatusMap.get("c")).toBe("valid");
  });

  it("enabled=false 时注册与指令均不生效", async () => {
    const { registerItems, vPanCheck, getCheckStatus } = usePanCheck({
      enabled: false,
    });
    registerItems(["a"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");
    await advancePastSettle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances.length).toBe(0);
    expect(getCheckStatus("a")).toBeUndefined();
  });

  it("指令 updated 仅在绑定值变化时重新观察", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a", "b"]);
    const el = {} as Element;
    mountItem(vPanCheck, el, "a");
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.observed.size).toBe(1);

    // 同值更新：不重复 observe
    updateItem(vPanCheck, el, "a", "a");
    expect(observer.observed.size).toBe(1);

    // 绑定值变化（筛选后元素复用）：按新 item 重新观察
    updateItem(vPanCheck, el, "b", "a");
    expect(observer.observed.size).toBe(1);

    observer.fire(el, true);
    await advancePastSettle();
    expect(sentBatches()).toEqual([["b"]]);
  });

  it("元素卸载时解绑观察，settle 后也不送检", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a"]);
    const el = {} as Element;
    mountItem(vPanCheck, el, "a");
    const observer = FakeIntersectionObserver.instances[0]!;

    // 进入视口后、settle 触发前元素被卸载
    observer.fire(el, true);
    unmountItem(vPanCheck, el);
    expect(observer.observed.size).toBe(0);

    await advancePastSettle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
