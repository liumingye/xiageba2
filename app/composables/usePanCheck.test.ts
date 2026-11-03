import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectiveBinding, ObjectDirective } from "vue";
import { usePanCheck } from "./usePanCheck";

/**
 * usePanCheck 视口懒检测单测
 *
 * node 环境无 DOM，用假 IntersectionObserver + fetch stub + 假定时器驱动。
 * 锁定行为：
 * 1. registerItems 只注册不检测，元素进入视口才发起请求（核心重构目标）
 * 2. flushDelay 聚合 + batchSize 串行分批
 * 3. stopPanCheck 中断未发出的批次并清空状态
 * 4. 老浏览器（无 IntersectionObserver）退化为注册即检测
 * 5. enabled=false 全程静默
 */

const FLUSH_DELAY = 150;

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

let statusOverrides: Record<string, ServerStatus> = {};
let fetchMock: ReturnType<
  typeof vi.fn<
    (_url: string, init?: { body?: string }) => Promise<{ json: () => Promise<unknown> }>
  >
>;

const stubBrowser = () => {
  statusOverrides = {};
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
  vi.stubGlobal("window", {});
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

describe("usePanCheck（视口懒检测）", () => {
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

  it("registerItems 只注册不检测，进入视口才发起请求", async () => {
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

    // 只有 a 进入视口
    observer.fire(elA, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatches()).toEqual([["a"]]);
    expect(itemStatusMap.get("a")).toBe("valid");
    expect(itemStatusMap.get("b")).toBeUndefined();
    expect(itemStatusMap.get("c")).toBeUndefined();
    // 一次性观察：进入视口后解绑，滚回去不重复检测
    expect(observer.observed.has(elA)).toBe(false);
  });

  it("后续滚入视口的 item 会补充检测", async () => {
    const { registerItems, vPanCheck, itemStatusMap } = usePanCheck();
    registerItems(["a", "b"]);
    const elA = {} as Element;
    const elB = {} as Element;
    mountItem(vPanCheck, elA, "a");
    mountItem(vPanCheck, elB, "b");
    const observer = FakeIntersectionObserver.instances[0]!;

    observer.fire(elA, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    observer.fire(elB, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBatches()).toEqual([["a"], ["b"]]);
    expect(itemStatusMap.get("b")).toBe("valid");
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

    // 在 flush 定时器触发前中止
    stopPanCheck();
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);

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
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatches()).toEqual([["a"]]);
  });

  it("stop 后重新注册时，被 Vue 复用的元素通过同值 updated 恢复观察", async () => {
    const { registerItems, vPanCheck, stopPanCheck } = usePanCheck();
    registerItems(["a"]);
    const elA = {} as Element;
    mountItem(vPanCheck, elA, "a");

    // 结果重新拉取：watch 里 stopPanCheck + registerItems
    stopPanCheck();
    registerItems(["a"]);

    // 列表重排/筛选后同一 key 的 DOM 被复用，不会重新 mounted，
    // Vue 只会以相同绑定值触发 updated
    updateItem(vPanCheck, elA, "a", "a");

    const observer = FakeIntersectionObserver.instances[1]!;
    expect(observer.observed.has(elA)).toBe(true);

    observer.fire(elA, true);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
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
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);

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
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances.length).toBe(0);
    expect(getCheckStatus("a")).toBeUndefined();
  });

  it("指令 updated 幂等：同值更新不重复 observe，绑定变化时重新观察", async () => {
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
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
    expect(sentBatches()).toEqual([["b"]]);
  });

  it("元素卸载时解绑观察，不再触发检测", async () => {
    const { registerItems, vPanCheck } = usePanCheck();
    registerItems(["a"]);
    const el = {} as Element;
    mountItem(vPanCheck, el, "a");
    const observer = FakeIntersectionObserver.instances[0]!;

    unmountItem(vPanCheck, el);
    expect(observer.observed.size).toBe(0);

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY + 10);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
