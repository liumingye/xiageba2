import { ref, reactive, onBeforeUnmount, type ObjectDirective } from "vue";

export type CheckStatus = "checking" | "valid" | "invalid" | "failed";

/** /api/source/check 返回的单项检测结果 */
type ServerCheckStatus = "valid" | "invalid" | "pending" | "unknown";

interface UsePanCheckOptions {
  enabled?: boolean;
  mode?: "ids" | "urls";
  /** 单次请求批量大小（服务端上限 20），默认 10 */
  batchSize?: number;
  /** 视口预检边距：链接距视口还有多远就视为进入（预检）区域，默认 "200px" */
  rootMargin?: string;
  /** 视口条目聚合延迟（ms）：把同一批入队的多个链接合并发出，默认 150 */
  flushDelay?: number;
  /**
   * 滚动停止判定延时（ms）：视口组成一变化就重置计时，滚动停下这么久
   * 之后才把当前仍在视口内的 item 送入检测队列。默认 300。
   * 直接一路滚到底时，中途「进了又出」的 item 不会送检。
   */
  scrollSettleDelay?: number;
}

/** 浏览器环境才允许发起检测（SSR / 无 fetch 时静默跳过） */
const isBrowser = () =>
  typeof window !== "undefined" && typeof fetch === "function";

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const {
    enabled = true,
    mode = "ids",
    batchSize = 15,
    rootMargin = "200px",
    flushDelay = 100,
    scrollSettleDelay = 100,
  } = options;

  const checking = ref(false);
  // 用 Map 统一管理每一个 item (URL/ID) 的状态：checking | valid | invalid | failed
  const itemStatusMap = reactive<Map<string, CheckStatus>>(new Map());
  // 仅存放检测为有效的 item，方便外部快速获取结果集
  const validItems = ref<Set<string>>(new Set());

  // 进行中的检测请求，用于组件销毁或 stop 时中断
  const controllers = new Set<AbortController>();

  // 已注册但尚未检测的 item（等待绑定元素进入视口）
  const pendingItems = new Set<string>();
  // 已进入（预检）视口、等待「滚动停止」判定后送检的 item ↔ 元素
  const inViewMap = new Map<string, Element>();
  // 已入队、等待检测的 item
  const visibleQueue: string[] = [];
  const queuedItems = new Set<string>();

  // item ↔ 被观察元素 的双向映射，供指令绑定 / 解绑时维护
  const itemToEl = new Map<string, Element>();
  const elToItem = new Map<Element, string>();

  let observer: IntersectionObserver | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollBound = false;

  /**
   * 滚动信号监听。移动端触摸滚动（含惯性滑动）期间 IO 回调会被浏览器
   * 抑制 / 延迟，光靠回调驱动 settle 不可靠；scroll 事件在整个滚动
   * 过程中持续触发，是「还没停」的可靠信号。capture 才能收到内部
   * 滚动容器的 scroll（scroll 不冒泡），passive 保证不卡滚动。
   */
  const handleScroll = () => scheduleViewportFlush();

  const bindScrollListener = () => {
    if (scrollBound) return;
    if (typeof window === "undefined") return;
    if (typeof window.addEventListener !== "function") return;
    window.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    scrollBound = true;
  };

  const unbindScrollListener = () => {
    if (!scrollBound) return;
    if (typeof window !== "undefined" &&
      typeof window.removeEventListener === "function") {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    }
    scrollBound = false;
  };

  /**
   * 注册待检测的 item。
   * 不再一次性全部提交：只有通过 vPanCheck 绑定的元素在「滚动停止」
   * 后仍处于视口内，才会真正发起检测请求。
   */
  const registerItems = (items: string[]) => {
    if (!enabled || !isBrowser() || items.length === 0) return;

    const fresh = items.filter(
      (item) =>
        typeof item === "string" &&
        item.length > 0 &&
        !itemStatusMap.has(item) &&
        !pendingItems.has(item),
    );
    if (fresh.length === 0) return;

    fresh.forEach((item) => pendingItems.add(item));

    // 老浏览器没有 IntersectionObserver：退化为注册后立即分批检测
    if (typeof IntersectionObserver !== "function") {
      enqueueItems(fresh);
    }
  };

  const enqueueItems = (items: string[]) => {
    let added = false;
    for (const item of items) {
      if (!pendingItems.has(item) || queuedItems.has(item)) continue;
      pendingItems.delete(item);
      queuedItems.add(item);
      visibleQueue.push(item);
      added = true;
    }
    if (added) scheduleFlush();
  };

  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushVisible();
    }, flushDelay);
  };

  /** 从队列取一批（≤ batchSize）串行提交，剩余项继续排批 */
  const flushVisible = async () => {
    if (visibleQueue.length === 0) return;

    const batch = visibleQueue.splice(0, batchSize);
    batch.forEach((item) => queuedItems.delete(item));
    batch.forEach((item) => itemStatusMap.set(item, "checking"));
    checking.value = true;

    await submitBatch(batch);

    // 一屏放不下（或滚动中持续进入）的剩余项继续排下一批
    if (visibleQueue.length > 0) scheduleFlush();
  };

  const submitBatch = async (items: string[]) => {
    const controller = new AbortController();
    controllers.add(controller);

    try {
      const body = mode === "ids" ? { ids: items } : { urls: items };
      const res = await fetch("/api/source/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();

      if (!data.success || !data.statuses) {
        // 请求失败，标记该批次全部失败
        markItemsStatus(items, "failed");
        return;
      }

      const statuses = data.statuses as Record<string, ServerCheckStatus>;
      for (const item of items) {
        const status = statuses[item];
        if (status === "valid") {
          validItems.value.add(item);
          itemStatusMap.set(item, "valid");
        } else if (status === "invalid") {
          itemStatusMap.set(item, "invalid");
        } else {
          // pending / unknown / 未返回：无法确认，标记为 failed（不展示有效性标记）
          itemStatusMap.set(item, "failed");
        }
      }
    } catch (e) {
      // 主动中断，直接退出
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("PanCheck batch failed:", e);
      markItemsStatus(items, "failed");
    } finally {
      controllers.delete(controller);
      if (controllers.size === 0 && visibleQueue.length === 0) {
        checking.value = false;
      }
    }
  };

  const markItemsStatus = (items: string[], status: CheckStatus) => {
    items.forEach((item) => itemStatusMap.set(item, status));
  };

  const handleIntersect = (entries: IntersectionObserverEntry[]) => {
    let viewportChanged = false;
    for (const entry of entries) {
      const item = elToItem.get(entry.target);
      if (!item) continue;
      if (entry.isIntersecting) {
        // 只记录「当前在视口内」，不立即送检
        if (!inViewMap.has(item)) {
          inViewMap.set(item, entry.target);
          viewportChanged = true;
        }
      } else if (inViewMap.delete(item)) {
        // 已经离开视口（含快速滚过）：不再送检
        viewportChanged = true;
      }
    }
    // 视口组成一变化就重置计时：滚动不停，始终不送检
    if (viewportChanged) scheduleViewportFlush();
  };

  /** 滚动停止判定：停下 scrollSettleDelay 后，把当前仍在视口内的 item 送入队列 */
  const scheduleViewportFlush = () => {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      flushViewport();
    }, scrollSettleDelay);
  };

  const flushViewport = () => {
    if (inViewMap.size === 0) return;
    const ready: string[] = [];
    for (const [item, el] of inViewMap) {
      // 已检测过 / 已在队列中的 item 不重复送检
      if (!pendingItems.has(item) || queuedItems.has(item)) continue;
      // 双保险：移动端 IO 回调可能延迟，「进了又出」的项此时实际已离开
      // 视口。IO 说相交（含 rootMargin 预检区）不等于此刻真在视口里。
      if (!isActuallyInViewport(el)) continue;
      ready.push(item);
      // 一次性观察：送检后解绑，滚回去不重复检测
      observer?.unobserve(el);
      elToItem.delete(el);
      itemToEl.delete(item);
      inViewMap.delete(item);
    }
    if (ready.length > 0) enqueueItems(ready);
  };

  /** 送检前的真实位置校验：元素此刻是否与视口本体相交 */
  const isActuallyInViewport = (el: Element) => {
    // 无几何信息的元素（测试 / 异常环境）信任 IO 状态
    if (typeof el.getBoundingClientRect !== "function") return true;
    const vh = window.innerHeight;
    if (!vh) return true;
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < vh;
  };

  const ensureObserver = () => {
    if (!observer) {
      observer = new IntersectionObserver(handleIntersect, { rootMargin });
      bindScrollListener();
    }
    return observer;
  };

  const observeElement = (el: Element, item: string) => {
    if (!enabled || !item) return;

    const prevEl = itemToEl.get(item);
    if (prevEl === el) return;
    if (prevEl) {
      observer?.unobserve(prevEl);
      elToItem.delete(prevEl);
    }
    itemToEl.set(item, el);
    elToItem.set(el, item);

    // 已检测过 / 已在队列中的 item 不重复观察
    if (!pendingItems.has(item)) return;
    ensureObserver().observe(el);
  };

  const releaseElement = (el: Element) => {
    const item = elToItem.get(el);
    if (!item) return;
    observer?.unobserve(el);
    elToItem.delete(el);
    itemToEl.delete(item);
    // 元素卸载时从待送检集合移除，防止 settle 后送检已消失的条目
    inViewMap.delete(item);
  };

  /**
   * O(1) 复杂度直接读取查询状态
   */
  const getCheckStatus = (item: string): CheckStatus | undefined => {
    if (!enabled) return undefined;
    return itemStatusMap.get(item) || undefined;
  };

  /**
   * 重置/停止所有检测
   */
  const stopPanCheck = () => {
    controllers.forEach((controller) => controller.abort());
    controllers.clear();

    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    visibleQueue.length = 0;
    queuedItems.clear();
    pendingItems.clear();
    inViewMap.clear();

    observer?.disconnect();
    observer = null;
    unbindScrollListener();
    itemToEl.clear();
    elToItem.clear();

    checking.value = false;
    itemStatusMap.clear();
    validItems.value.clear();
  };

  onBeforeUnmount(stopPanCheck);

  /**
   * 模板指令：绑在列表项根元素上。元素进入视口不立即检测，
   * 等滚动停止（scrollSettleDelay）后仍留在视口内才送检。
   * 用法：<LocalResourceItem v-for="item in items" v-pan-check="item.id" ... />
   */
  const vPanCheck: ObjectDirective<Element, string> = {
    mounted(el, binding) {
      observeElement(el, binding.value);
    },
    updated(el, binding) {
      if (binding.value !== binding.oldValue) {
        observeElement(el, binding.value);
      }
    },
    unmounted(el) {
      releaseElement(el);
    },
  };

  return {
    checking,
    validItems,
    itemStatusMap,
    registerItems,
    getCheckStatus,
    stopPanCheck,
    vPanCheck,
  };
}
