import { ref, reactive, onBeforeUnmount } from "vue";

export type CheckStatus = "checking" | "valid" | "invalid" | "failed";

/** /api/source/check 返回的单项检测结果 */
type ServerCheckStatus = "valid" | "invalid" | "pending" | "unknown";

interface UsePanCheckOptions {
  enabled?: boolean;
  mode?: "ids" | "urls";
  batchSize?: number;
}

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const { enabled = true, mode = "ids", batchSize = 10 } = options;

  const checking = ref(false);
  // 用 Map 统一管理每一个 item (URL/ID) 的状态：checking | valid | invalid | failed
  const itemStatusMap = reactive<Map<string, CheckStatus>>(new Map());
  // 仅存放检测为有效的 item，方便外部快速获取结果集
  const validItems = ref<Set<string>>(new Set());

  // 进行中的检测请求，用于组件销毁或 stop 时中断
  const controllers = new Set<AbortController>();

  /**
   * 提交一批 URLs / IDs 进行检测。
   * 接口同步返回检测结果，因此不再需要轮询。
   */
  const submitPanCheck = async (items: string[]) => {
    if (!enabled || items.length === 0) return;

    // 未标记过的 item 统一初始化为 checking 状态
    const newItems = items.filter((item) => !itemStatusMap.has(item));
    if (newItems.length === 0) return;

    newItems.forEach((item) => itemStatusMap.set(item, "checking"));
    checking.value = true;

    // 切片分批并并发请求
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < newItems.length; i += batchSize) {
      tasks.push(submitOneBatch(newItems.slice(i, i + batchSize)));
    }
    await Promise.all(tasks);
  };

  const submitOneBatch = async (items: string[]) => {
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
      if (controllers.size === 0) {
        checking.value = false;
      }
    }
  };

  const markItemsStatus = (items: string[], status: CheckStatus) => {
    items.forEach((item) => itemStatusMap.set(item, status));
  };

  /**
   * O(1) 复杂度直接读取查询状态
   */
  const getCheckStatus = (item: string): CheckStatus | undefined => {
    if (!enabled || !import.meta.client) return undefined;
    return itemStatusMap.get(item) || undefined;
  };

  /**
   * 重置/停止所有检测
   */
  const stopPanCheck = () => {
    controllers.forEach((controller) => controller.abort());
    controllers.clear();

    checking.value = false;
    itemStatusMap.clear();
    validItems.value.clear();
  };

  onBeforeUnmount(stopPanCheck);

  return {
    checking,
    validItems,
    itemStatusMap,
    submitPanCheck,
    getCheckStatus,
    stopPanCheck,
  };
}
