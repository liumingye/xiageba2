import { ref, onBeforeUnmount, reactive } from "vue";

interface UsePanCheckOptions {
  mode?: "ids" | "urls";
  batchSize?: number;
}

interface BatchState {
  submissionId: number;
  serverIndex: number | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollCancel: AbortController | null;
  pending: boolean;
  success: boolean;
  urls: string[]; // ✅ 新增：记录这个批次检测的是哪些 URL
}

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const { mode = "ids", batchSize = 10 } = options;

  const checking = ref(false);
  const skipCheck = ref(true);
  const validItems = ref<Set<string>>(new Set());

  const batches = reactive<Map<number, BatchState>>(new Map());
  let nextBatchId = 0;
  let pendingBatchCount = 0;

  const submitPanCheck = async (items: string[]) => {
    if (items.length === 0) return;

    checking.value = true;

    const slices: string[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      slices.push(items.slice(i, i + batchSize));
    }
    pendingBatchCount += slices.length;

    for (const slice of slices) {
      await submitOneBatch(slice);
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
        const state: BatchState = {
          submissionId: data.submission_id,
          serverIndex: data.server_index ?? null,
          pollTimer: null,
          pollCancel: null,
          pending: true,
          success: true,
          urls: [...items], // ✅ 保存这个批次的 URL 列表
        };
        batches.set(batchId, state);
        startBatchPoll(batchId, state);
      } else {
        markBatchDone(batchId);
      }
    } catch {
      markBatchDone(batchId);
    }
  };

  const startBatchPoll = (batchId: number, state: BatchState) => {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      if (!batches.has(batchId)) return;
      try {
        state.pollCancel?.abort();
        state.pollCancel = new AbortController();
        const res = await fetch(
          `/api/source/check?submission_id=${state.submissionId}${state.serverIndex !== null ? `&server_index=${state.serverIndex}` : ""}`,
          {
            signal: state.pollCancel.signal,
          },
        );
        const data = await res.json();
        if (data.validIds && data.validIds.length > 0) {
          for (const id of data.validIds) validItems.value.add(id);
        }
        if (data.success) {
          state.success = true;
          if (data.pendingIds && data.pendingIds.length === 0) {
            finishBatch(batchId, state);
          }
        } else {
          finishBatch(batchId, state);
        }
      } catch (e) {
        console.error("PanCheck批次轮询失败", batchId, e);
      }
    }, 3000);
  };

  const finishBatch = (batchId: number, state: BatchState) => {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    state.pollCancel?.abort();
    state.pollCancel = null;
    state.pending = false;
    markBatchDone(batchId);
  };

  const markBatchDone = (_batchId: number) => {
    if (pendingBatchCount > 0) pendingBatchCount--;
    if (pendingBatchCount <= 0) {
      pendingBatchCount = 0;
      checking.value = false;
      skipCheck.value = false;
      // 全部批次结束后，可以清理已完成的 batch 状态（可选，防止 Map 无限增长）
      for (const [id, st] of Array.from(batches.entries())) {
        if (!st.pending) batches.delete(id);
      }
    }
  };

  // ✅ 核心修复：getCheckStatus 按「URL 粒度」判断，不再受全局 checking 影响
  const getCheckStatus = (
    item: string,
  ): "valid" | "invalid" | "checking" | null => {
    if (!import.meta.client) return null;

    // ✅ 关键：只有这个 URL 自己在某个 pending 批次的 urls 列表里，才显示 checking
    // 已经出结果的 URL（valid / invalid）不受其他新批次影响
    for (const state of batches.values()) {
      if (state.pending && state.urls.includes(item)) {
        return "checking";
      }
    }

    if (skipCheck.value) return null;

    // 这个 URL 不在任何 pending 批次里 → 看最终结果
    if (validItems.value.has(item)) return "valid";
    return "invalid";
  };

  const stopPanCheck = () => {
    for (const state of batches.values()) {
      if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
      }
      state.pollCancel?.abort();
      state.pollCancel = null;
      state.pending = false;
    }
    batches.clear();
    pendingBatchCount = 0;
    checking.value = false;
    skipCheck.value = true;
    validItems.value.clear();
  };

  onBeforeUnmount(() => {
    stopPanCheck();
  });

  return {
    checking,
    skipCheck,
    validItems,
    submitPanCheck,
    getCheckStatus,
    stopPanCheck,
  };
}
