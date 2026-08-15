import { ref, reactive, onBeforeUnmount } from "vue";

export type CheckStatus = "checking" | "valid" | "invalid" | "failed";

interface UsePanCheckOptions {
  enabled?: boolean;
  mode?: "ids" | "urls";
  batchSize?: number;
  pollInterval?: number;
}

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const {
    enabled = true,
    mode = "ids",
    batchSize = 10,
    pollInterval = 3000,
  } = options;

  const checking = ref(false);
  // 用 Map 统一管理每一个 item (URL/ID) 的状态：checking | valid | invalid
  const itemStatusMap = reactive<Map<string, CheckStatus>>(new Map());
  // 仅存放检测为有效的 item，方便外部快速获取结果集
  const validItems = ref<Set<string>>(new Set());

  // 跟踪活跃批次，用于在组件销毁或 stop 时取消 Fetch/Timer
  const activePollers = new Map<
    number,
    {
      timer: ReturnType<typeof setTimeout> | null;
      controller: AbortController | null;
    }
  >();
  let nextBatchId = 0;

  /**
   * 提交一批 URLs / IDs 进行异步校验
   */
  const submitPanCheck = async (items: string[]) => {
    if (!enabled || items.length === 0) return;

    // 未标记过的 item 统一初始化为 checking 状态
    const newItems = items.filter((item) => !itemStatusMap.has(item));
    if (newItems.length === 0) return;

    newItems.forEach((item) => itemStatusMap.set(item, "checking"));
    checking.value = true;

    // 切片分批
    for (let i = 0; i < newItems.length; i += batchSize) {
      const slice = newItems.slice(i, i + batchSize);
      submitOneBatch(slice);
    }
  };

  const submitOneBatch = async (items: string[]) => {
    const batchId = nextBatchId++;
    try {
      const body = mode === "ids" ? { ids: items } : { urls: items };
      const res = await fetch("/api/source/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success && data.submission_id) {
        // 开始链式轮询
        pollBatch(
          batchId,
          data.submission_id,
          data.server_index ?? null,
          items,
        );
      } else {
        // 创建任务失败，直接标记该批次全不合法
        markItemsStatus(items, "failed");
      }
    } catch {
      markItemsStatus(items, "invalid");
    }
  };

  /**
   * 链式 setTimeout 轮询，避免并发重发与无效 Cancel
   */
  const pollBatch = (
    batchId: number,
    submissionId: number,
    serverIndex: number | null,
    items: string[],
  ) => {
    const controller = new AbortController();
    activePollers.set(batchId, { timer: null, controller });

    const doPoll = async () => {
      // 检查当前批次是否已被停止
      if (!activePollers.has(batchId)) return;

      try {
        const url = `/api/source/check?submission_id=${submissionId}${serverIndex !== null ? `&server_index=${serverIndex}` : ""}`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();

        // 1. 处理已出的有效项
        if (Array.isArray(data.validIds) && data.validIds.length > 0) {
          data.validIds.forEach((id: string) => {
            validItems.value.add(id);
            itemStatusMap.set(id, "valid");
          });
        }

        // 2. 判断轮询是否结束
        const isDone =
          !data.success ||
          (Array.isArray(data.pendingIds) && data.pendingIds.length === 0);

        if (isDone) {
          // 将剩余未标为 valid 的项标为 invalid
          items.forEach((id) => {
            if (itemStatusMap.get(id) === "checking") {
              itemStatusMap.set(id, "invalid");
            }
          });
          cleanBatch(batchId);
          return;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 主动中断，直接退出
        console.error(`Batch ${batchId} poll failed:`, e);
      }

      // 3. 递归调度下一次轮询 (仅当请求彻底结束后才计时)
      if (activePollers.has(batchId)) {
        const poller = activePollers.get(batchId)!;
        poller.timer = setTimeout(doPoll, pollInterval);
      }
    };

    doPoll();
  };

  const markItemsStatus = (items: string[], status: CheckStatus) => {
    items.forEach((item) => itemStatusMap.set(item, status));
    checkAllFinished();
  };

  const cleanBatch = (batchId: number) => {
    const poller = activePollers.get(batchId);
    if (poller?.timer) clearTimeout(poller.timer);
    activePollers.delete(batchId);
    checkAllFinished();
  };

  const checkAllFinished = () => {
    if (activePollers.size === 0) {
      checking.value = false;
    }
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
    activePollers.forEach((poller) => {
      if (poller.timer) clearTimeout(poller.timer);
      poller.controller?.abort();
    });
    activePollers.clear();

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
