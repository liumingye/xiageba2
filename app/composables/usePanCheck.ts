import { ref, onBeforeUnmount } from "vue";

interface UsePanCheckOptions {
  enabled?: boolean;
}

export function usePanCheck(options: UsePanCheckOptions = {}) {
  const { enabled = true } = options;

  const submissionId = ref<number | null>(null);
  const serverIndex = ref<number | null>(null);
  const checking = ref(false);
  const skipCheck = ref(true);
  const validIds = ref<Set<string>>(new Set());

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollCancel: AbortController | null = null;

  const submitPanCheck = async (ids: string[]) => {
    if (!enabled) return;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (ids.length === 0) return;

    checking.value = true;
    skipCheck.value = true;
    validIds.value.clear();

    try {
      const res = await fetch("/api/source/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
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
        if (data.success) {
          skipCheck.value = false;
          validIds.value.clear();
          for (const id of data.validIds) validIds.value.add(id);
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
    id: string,
  ): "valid" | "invalid" | "checking" | null => {
    if (!import.meta.client) return null;
    if (!enabled) return null;
    if (checking.value) return "checking";
    if (skipCheck.value) return null;
    if (validIds.value.has(id)) return "valid";
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
    validIds,
    submitPanCheck,
    getCheckStatus,
    stopPanCheck,
  };
}
