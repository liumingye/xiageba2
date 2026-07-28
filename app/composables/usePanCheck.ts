import { ref, onBeforeUnmount, reactive } from "vue";

interface UsePanCheckOptions {
  enabled?: boolean;
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
}

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const { enabled = true, mode = "ids", batchSize = 10 } = options;

  const checking = ref(false);
  const skipCheck = ref(true);
  const validItems = ref<Set<string>>(new Set());

  const batches = reactive<Map<number, BatchState>>(new Map());
  let nextBatchId = 0;
  let overallDoneCount = 0;
  let totalBatches = 0;

  const submitPanCheck = async (items: string[]) => {
    if (!enabled) return;
    stopPanCheck();

    if (items.length === 0) return;

    checking.value = true;
    skipCheck.value = true;
    validItems.value.clear();
    batches.clear();
    overallDoneCount = 0;

    const slices: string[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      slices.push(items.slice(i, i + batchSize));
    }
    totalBatches = slices.length;

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
    overallDoneCount++;
    if (overallDoneCount >= totalBatches) {
      checking.value = false;
      skipCheck.value = false;
    }
  };

  const getCheckStatus = (
    item: string,
  ): "valid" | "invalid" | "checking" | null => {
    if (!import.meta.client) return null;
    if (!enabled) return null;
    if (checking.value) return "checking";
    if (skipCheck.value) return null;
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
    overallDoneCount = 0;
    totalBatches = 0;
    checking.value = false;
    skipCheck.value = true;
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
