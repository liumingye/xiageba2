import { ref, reactive, onBeforeUnmount, type ObjectDirective } from "vue";

export type CheckStatus = "checking" | "valid" | "invalid" | "failed";

/** /api/source/check 返回的单项检测结果 */
type ServerCheckStatus = "valid" | "invalid" | "pending" | "unknown";

interface UsePanCheckOptions {
  enabled?: boolean;
  mode?: "ids" | "urls";
  /** 单次请求批量大小（服务端上限 20），默认 10 */
  batchSize?: number;
  /** 视口预检边距：链接距视口还有多远就提前检测，默认 "200px" */
  rootMargin?: string;
  /** 视口条目聚合延迟（ms）：把连续滚入视口的多个链接合并成一批，默认 150 */
  flushDelay?: number;
}

/** 浏览器环境才允许发起检测（SSR / 无 fetch 时静默跳过） */
const isBrowser = () =>
  typeof window !== "undefined" && typeof fetch === "function";

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const {
    enabled = true,
    mode = "ids",
    batchSize = 10,
    rootMargin = "200px",
    flushDelay = 150,
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
  // 已进入视口、排队等待检测的 item
  const visibleQueue: string[] = [];
  const queuedItems = new Set<string>();

  // item ↔ 被观察元素 的双向映射，供指令绑定 / 解绑时维护
  const itemToEl = new Map<string, Element>();
  const elToItem = new Map<Element, string>();

  let observer: IntersectionObserver | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 注册待检测的 item。
   * 不再一次性全部提交：只有通过 vPanCheck 绑定的元素进入视口后，
   * 才会真正发起检测请求。
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
    const entered: string[] = [];
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const item = elToItem.get(entry.target);
      if (!item) continue;
      // 一次性观察：进入视口后解绑，滚回去不重复检测
      observer?.unobserve(entry.target);
      elToItem.delete(entry.target);
      itemToEl.delete(item);
      if (pendingItems.has(item) && !queuedItems.has(item)) {
        entered.push(item);
      }
    }
    if (entered.length > 0) enqueueItems(entered);
  };

  const ensureObserver = () => {
    if (!observer) {
      observer = new IntersectionObserver(handleIntersect, { rootMargin });
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
    visibleQueue.length = 0;
    queuedItems.clear();
    pendingItems.clear();

    observer?.disconnect();
    observer = null;
    itemToEl.clear();
    elToItem.clear();

    checking.value = false;
    itemStatusMap.clear();
    validItems.value.clear();
  };

  onBeforeUnmount(stopPanCheck);

  /**
   * 模板指令：绑在列表项根元素上，元素进入视口才触发检测。
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
