import { ref, onBeforeUnmount } from "vue";

interface UsePanCheckOptions {
  enabled?: boolean;
  mode?: "ids" | "urls";
}

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const { enabled = true, mode = "ids" } = options;

  const submissionId = ref<number | null>(null);
  const serverIndex = ref<number | null>(null);
  const checking = ref(false);
  const skipCheck = ref(true);
  const validItems = ref<Set<string>>(new Set());

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollCancel: AbortController | null = null;

  const submitPanCheck = async (items: string[]) => {
    if (!enabled) return;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (items.length === 0) return;

    checking.value = true;
    skipCheck.value = true;
    validItems.value.clear();

    try {
      const body = mode === "ids" ? { ids: items } : { urls: items };
      const res = await fetch("/api/source/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.submission_id) {
        submissionId.value = data.submission_id;
        serverIndex.value = data.server_index;
        startPanCheckPoll();
      } else {
        checking.value = false;
        skipCheck.value = true;
      }
    } catch {
      checking.value = false;
      skipCheck.value = true;
    }
  };

  const startPanCheckPoll = () => {
    pollCancel?.abort();
    pollCancel = null;
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(async () => {
      if (!submissionId.value) {
        clearInterval(pollTimer!);
        pollTimer = null;
        return;
      }

      try {
        pollCancel = new AbortController();
        const res = await fetch(
          `/api/source/check?submission_id=${submissionId.value}${serverIndex.value !== null ? `&server_index=${serverIndex.value}` : ""}`,
          {
            signal: pollCancel.signal,
          },
        );
        const data = await res.json();
        // 实时更新 validItems
        if (data.validIds && data.validIds.length > 0) {
          for (const id of data.validIds) validItems.value.add(id);
        }
        if (data.success) {
          skipCheck.value = false;
          // validItems.value.clear();
          // for (const id of data.validIds) validItems.value.add(id);
          if (data.pendingIds.length === 0) {
            clearInterval(pollTimer!);
            pollTimer = null;
            checking.value = false;
          }
        } else {
          skipCheck.value = true;
        }
      } catch (error) {
        console.error("PanCheck轮询失败", error);
      }
    }, 3000);
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
    pollCancel?.abort();
    pollCancel = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    checking.value = false;
    skipCheck.value = true;
  };

  onBeforeUnmount(() => {
    stopPanCheck();
  });

  return {
    submissionId,
    serverIndex,
    checking,
    skipCheck,
    validItems,
    submitPanCheck,
    getCheckStatus,
    stopPanCheck,
  };
}
