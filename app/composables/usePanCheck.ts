import { ref, reactive, onBeforeUnmount, type ObjectDirective } from "vue";

export type CheckStatus = "checking" | "valid" | "invalid" | "failed";

/** /api/source/check 返回的单项检测结果 */
type ServerCheckStatus = "valid" | "invalid" | "pending" | "unknown";

/** flushViewport 逐项决策的跳过原因 */
type SkipReason = "不在 pendingItems" | "已在队列" | "位置校验未过";

/** 三个计时器的名字：队列聚合 / 滚动停止判定 / 位置校验重试 */
type TimerName = "flush" | "settle" | "geomRetry";

interface UsePanCheckOptions {
  enabled?: boolean;
  mode?: "ids" | "urls";
  /** 单次请求批量大小（服务端上限 20），默认 15 */
  batchSize?: number;
  /** 视口预检边距：链接距视口还有多远就视为进入（预检）区域，默认 "200px" */
  rootMargin?: string;
  /** 视口条目聚合延迟（ms）：把同一批入队的多个链接合并发出，默认 100 */
  flushDelay?: number;
  /**
   * 滚动停止判定延时（ms）：视口组成一变化就重置计时，滚动停下这么久
   * 之后才把当前仍在视口内的 item 送入检测队列。默认 100。
   * 直接一路滚到底时，中途「进了又出」的 item 不会送检。
   */
  scrollSettleDelay?: number;
  /**
   * 位置校验失败后的重试延时（ms）：flush 时元素 rect 可能还没稳定
   * （图片/字体加载中、流式卡片持续涌入），校验失败的项在
   * 布局稳定后自动补检。默认 200。
   */
  geomRetryDelay?: number;
}

/** 调试日志：仅 dev 输出，统一前缀便于过滤 */
const debugLog = (...args: unknown[]) => {
  if (import.meta.dev) console.log("[PanCheck]", ...args);
};

/** 位置校验失败最多重试几次，之后放弃（留给后续 scroll / IO 事件恢复） */
const MAX_GEOM_RETRIES = 10;

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
    geomRetryDelay = 200,
  } = options;

  // ---- 对外状态 ----

  const checking = ref(false);
  // 用 Map 统一管理每一个 item (URL/ID) 的状态：checking | valid | invalid | failed
  const itemStatusMap = reactive<Map<string, CheckStatus>>(new Map());
  // 仅存放检测为有效的 item，方便外部快速获取结果集
  const validItems = ref<Set<string>>(new Set());

  // ---- 内部状态 ----

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

  // 位置校验重试的剩余次数，视口组成变化（IO 回调）时重置
  let geomRetriesLeft = MAX_GEOM_RETRIES;

  // ---- 计时器基础设施 ----
  // 三种计时器共用一套「设 / 清 / 全清」，各调度函数只表达自己的语义

  const timers: Record<TimerName, ReturnType<typeof setTimeout> | null> = {
    flush: null,
    settle: null,
    geomRetry: null,
  };

  /**
   * @param mode "once"：已挂起则不动作（队列聚合，首个项触发后计时不重置）；
   *             "reset"：清旧设新（滚动判定 / 重试，来新信号就重新计时）
   */
  const setTimer = (
    name: TimerName,
    fn: () => void,
    delay: number,
    mode: "once" | "reset",
  ) => {
    if (mode === "once" && timers[name] !== null) return;
    if (timers[name] !== null) clearTimeout(timers[name]);
    timers[name] = setTimeout(() => {
      timers[name] = null;
      fn();
    }, delay);
  };

  const clearTimer = (name: TimerName) => {
    if (timers[name] !== null) {
      clearTimeout(timers[name]);
      timers[name] = null;
    }
  };

  const clearAllTimers = () => {
    (Object.keys(timers) as TimerName[]).forEach(clearTimer);
  };

  // ---- 注册 ----

  /**
   * 注册待检测的 item。
   * 不再一次性全部提交：只有通过 vPanCheck 绑定的元素在「滚动停止」
   * 后仍处于视口内，才会真正发起检测请求。
   */
  const registerItems = (items: string[]) => {
    if (!enabled || !isBrowser() || items.length === 0) return;

    // 一遍循环分类：有效待注册 / 已有状态 / 已注册 / 非法值
    const fresh: string[] = [];
    const withStatus: string[] = [];
    const registered: string[] = [];
    for (const item of items) {
      if (typeof item !== "string" || item.length === 0) continue;
      if (itemStatusMap.has(item)) withStatus.push(item);
      else if (pendingItems.has(item)) registered.push(item);
      else fresh.push(item);
    }

    if (fresh.length === 0) {
      debugLog(
        "registerItems: 全部被过滤",
        "已有状态",
        withStatus,
        "已注册",
        registered,
      );
      return;
    }

    fresh.forEach((item) => pendingItems.add(item));
    debugLog("registerItems: 注册", fresh);

    // 老浏览器没有 IntersectionObserver：退化为注册后立即分批检测
    if (typeof IntersectionObserver !== "function") {
      enqueueItems(fresh);
    }
  };

  // ---- 入队与批次提交 ----

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
    setTimer("flush", () => void flushVisible(), flushDelay, "once");
  };

  /** 从队列取一批（≤ batchSize）串行提交，剩余项继续排批 */
  const flushVisible = async () => {
    if (visibleQueue.length === 0) return;

    const batch = visibleQueue.splice(0, batchSize);
    batch.forEach((item) => queuedItems.delete(item));
    batch.forEach((item) => itemStatusMap.set(item, "checking"));
    checking.value = true;
    debugLog("flushVisible: 提交批次", batch, "队列剩余", [...visibleQueue]);

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
      debugLog(
        "submitBatch: 完成",
        items.map((item) => `${item}=${statuses[item] ?? "无返回"}`),
      );
    } catch (e) {
      // 主动中断，直接退出
      if (e instanceof DOMException && e.name === "AbortError") {
        debugLog("submitBatch: 被 abort 中断", items);
        return;
      }
      console.error("PanCheck batch failed:", e);
      debugLog("submitBatch: 请求失败", items, e);
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

  // ---- 视口判定与滚动停止 ----

  const handleIntersect = (entries: IntersectionObserverEntry[]) => {
    let viewportChanged = false;
    for (const entry of entries) {
      const item = elToItem.get(entry.target);
      if (!item) {
        debugLog(
          "handleIntersect: entry.target 无对应 item（已解绑）",
          entry.isIntersecting,
        );
        continue;
      }
      if (entry.isIntersecting) {
        // 只记录「当前在视口内」，不立即送检
        if (!inViewMap.has(item)) {
          inViewMap.set(item, entry.target);
          viewportChanged = true;
          debugLog(`handleIntersect: ${item} 进入视口，加入 inViewMap`);
        }
      } else if (inViewMap.delete(item)) {
        // 已经离开视口（含快速滚过）：不再送检
        viewportChanged = true;
        debugLog(`handleIntersect: ${item} 离开视口，移出 inViewMap`);
      }
    }
    // 视口组成一变化就重置计时：滚动不停，始终不送检
    if (viewportChanged) {
      geomRetriesLeft = MAX_GEOM_RETRIES;
      scheduleViewportFlush();
    }
  };

  const scheduleViewportFlush = () => {
    setTimer("settle", flushViewport, scrollSettleDelay, "reset");
  };

  /**
   * 逐项决策：返回 { ready, skipped }。
   * 送检项同时解绑观察（一次性语义：滚回去不重复检测）并清理映射。
   */
  const collectReadyItems = () => {
    const ready: string[] = [];
    const skipped: { item: string; reason: SkipReason }[] = [];
    for (const [item, el] of inViewMap) {
      // 已检测过 / 已在队列中的 item 不重复送检
      if (!pendingItems.has(item)) {
        skipped.push({ item, reason: "不在 pendingItems" });
        continue;
      }
      if (queuedItems.has(item)) {
        skipped.push({ item, reason: "已在队列" });
        continue;
      }
      // 双保险：移动端 IO 回调可能延迟，「进了又出」的项此时实际已离开
      // 视口。IO 说相交（含 rootMargin 预检区）不等于此刻真在视口里。
      if (!isActuallyInViewport(el)) {
        skipped.push({ item, reason: "位置校验未过" });
        continue;
      }
      ready.push(item);
      observer?.unobserve(el);
      elToItem.delete(el);
      itemToEl.delete(item);
      inViewMap.delete(item);
    }
    return { ready, skipped };
  };

  /** 滚动停止：把当前仍在视口内的 item 送入队列 */
  const flushViewport = () => {
    // 马上要重新决策，取消挂起的重试链（重试回调里定时器已自净）
    clearTimer("geomRetry");
    if (inViewMap.size === 0) return;

    debugLog(
      "flushViewport: inViewMap 快照",
      [...inViewMap.keys()],
      "pendingItems",
      [...pendingItems],
      "queuedItems",
      [...queuedItems],
    );
    const { ready, skipped } = collectReadyItems();
    debugLog(
      "flushViewport: 送检",
      ready,
      "跳过",
      skipped.map((s) => `${s.item}(${s.reason})`),
    );
    if (ready.length > 0) enqueueItems(ready);
    // 位置校验未过的项：布局稳定后自动补检，不依赖用户再次滚动
    if (skipped.some((s) => s.reason === "位置校验未过")) {
      scheduleGeomRetry();
    }
  };

  /** 位置校验失败的重试：图片/字体加载、流式卡片涌入都会让 rect 延迟稳定 */
  const scheduleGeomRetry = () => {
    if (geomRetriesLeft <= 0) {
      debugLog(
        "scheduleGeomRetry: 重试次数用尽，放弃（等后续 scroll/IO 事件）",
      );
      return;
    }
    geomRetriesLeft -= 1;
    debugLog(
      `scheduleGeomRetry: ${geomRetryDelay}ms 后重试（剩余 ${geomRetriesLeft} 次）`,
    );
    setTimer("geomRetry", flushViewport, geomRetryDelay, "reset");
  };

  /** 送检前的真实位置校验：元素此刻是否与视口本体相交 */
  const isActuallyInViewport = (el: Element) => {
    // 无几何信息的元素（测试 / 异常环境）信任 IO 状态
    if (typeof el.getBoundingClientRect !== "function") return true;
    const vh = window.innerHeight;
    if (!vh) return true;
    const rect = el.getBoundingClientRect();
    const inView = rect.bottom > 0 && rect.top < vh;
    if (!inView) {
      debugLog(
        "isActuallyInViewport: 未过",
        { top: rect.top, bottom: rect.bottom },
        "vh",
        vh,
      );
    }
    return inView;
  };

  // ---- 滚动信号（移动端兜底） ----

  /**
   * 触摸滚动（含惯性滑动）期间 IO 回调会被浏览器抑制 / 延迟，光靠回调
   * 驱动 settle 不可靠；scroll 事件在整个滚动过程中持续触发，是
   * 「还没停」的可靠信号。capture 才能收到内部滚动容器的 scroll
   * （scroll 不冒泡），passive 保证不卡滚动。
   */
  const handleScroll = () => scheduleViewportFlush();

  const bindScrollListener = () => {
    if (typeof window === "undefined") return;
    if (typeof window.addEventListener !== "function") return;
    window.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
  };

  const unbindScrollListener = () => {
    if (typeof window === "undefined") return;
    if (typeof window.removeEventListener !== "function") return;
    window.removeEventListener("scroll", handleScroll, { capture: true });
  };

  // ---- 观察者管理 ----

  let observer: IntersectionObserver | null = null;

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
    if (!pendingItems.has(item)) {
      debugLog(`observeElement: ${item} 未观察（不在 pendingItems）`);
      return;
    }
    ensureObserver().observe(el);
    debugLog(`observeElement: ${item} 开始观察`);
  };

  const releaseElement = (el: Element) => {
    const item = elToItem.get(el);
    if (!item) return;
    observer?.unobserve(el);
    elToItem.delete(el);
    itemToEl.delete(item);
    // 元素卸载时从待送检集合移除，防止 settle 后送检已消失的条目
    if (inViewMap.delete(item)) {
      debugLog(`releaseElement: ${item} 元素卸载，移出 inViewMap`);
    }
  };

  // ---- 查询 / 停止 ----

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

    clearAllTimers();
    visibleQueue.length = 0;
    queuedItems.clear();
    pendingItems.clear();
    inViewMap.clear();
    geomRetriesLeft = MAX_GEOM_RETRIES;

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
    }
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
