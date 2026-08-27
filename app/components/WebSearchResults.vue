<script setup lang="ts">
import {
  Globe,
  Loader2,
  Folder,
  Download,
  CheckCircle,
  CircleSlash,
  XCircle,
} from "@lucide/vue";
import { useDebounceFn } from "@vueuse/core";
import { getStorageTypeFriendFromFilter, type PanFilter } from "#shared/utils";

export interface WebSearchResult {
  title: string;
  url: string;
  source: string;
  image?: string;
  type: PanFilter;
}

const props = defineProps<{
  keyword: string;
  disabled?: boolean;
  highlightHtml?: (text: string) => string;
  /** 筛选网盘类型，如 quark / baidu / xunlei / uc，默认 all 不过滤 */
  filter?: string;
}>();

const emit = defineEmits<{
  openTreeModal: [item: WebSearchResult];
  openModal: [item: WebSearchResult];
}>();

const results = ref<WebSearchResult[]>([]);
const searching = ref(false);
const error = ref("");

// 按网盘类型前端过滤结果
const filteredResults = computed<WebSearchResult[]>(() => {
  const f = props.filter;
  if (!f || f === "all") return results.value;
  return results.value.filter((item) => item.type === f);
});

// 实例化 panCheck Hook
const { submitPanCheck, getCheckStatus, stopPanCheck } = usePanCheck({
  mode: "urls",
  batchSize: 10,
});

let eventSource: EventSource | null = null;

// 待提交校验的 URL 缓冲区
const pendingBuffer = new Set<string>();
const submittedUrls = new Set<string>();

/**
 * 冲刷缓冲区，发起校验
 */
const flushPanCheck = () => {
  if (pendingBuffer.size === 0) return;

  const urlsToSubmit = Array.from(pendingBuffer);
  pendingBuffer.clear();

  // 增量追加提交
  submitPanCheck(urlsToSubmit);
};

/**
 * 管道化处理：将接收到的新数据放入缓存区并触发防抖。
 * 使用 useDebounceFn，每次调用自动重置计时，组件卸载时自动清理。
 */
const debouncedFlush = useDebounceFn(flushPanCheck, 2000);

const queuePanCheck = (url?: string) => {
  if (url && !submittedUrls.has(url)) {
    pendingBuffer.add(url);
    submittedUrls.add(url);
  }

  debouncedFlush();
};

const startWebSearch = () => {
  // 1. 清理上一轮网络与检测状态
  closeEventSource();
  stopPanCheck();

  results.value = [];
  error.value = "";
  submittedUrls.clear();
  pendingBuffer.clear();

  if (
    props.disabled ||
    !props.keyword.trim() ||
    typeof EventSource === "undefined"
  ) {
    searching.value = false;
    return;
  }

  searching.value = true;
  const es = new EventSource(
    `/api/other/web_search?title=${encodeURIComponent(props.keyword.trim())}`,
  );
  eventSource = es;

  es.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "result" && msg.data) {
        results.value.push(msg.data);
        if (msg.data.type === "magnet") return;
        // 数据进入缓冲区
        queuePanCheck(msg.data.url);
      } else if (msg.type === "done") {
        searching.value = false;
        closeEventSource();
        // 结束时立即冲刷剩余的缓冲区
        flushPanCheck();
      } else if (msg.type === "error") {
        error.value = msg.message || "全网搜失败";
        searching.value = false;
        closeEventSource();
      }
    } catch {
      // 忽略无法解析的 JSON 数据
    }
  };

  es.onerror = () => {
    searching.value = false;
    closeEventSource();
  };
};

const closeEventSource = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const stopWebSearch = () => {
  closeEventSource();
  stopPanCheck();
  pendingBuffer.clear();
  searching.value = false;
};

watch(
  () => props.keyword,
  () => {
    if (import.meta.client) {
      startWebSearch();
    }
  },
);

watch(
  () => props.disabled,
  (val) => {
    if (val) {
      stopWebSearch();
    }
  },
);

onMounted(() => {
  if (!props.disabled && props.keyword) {
    startWebSearch();
  }
});

onBeforeUnmount(() => {
  stopWebSearch();
});

defineExpose({ results, searching, error });
</script>

<template>
  <div class="flex items-center gap-2 !my-3">
    <Globe class="w-4 h-4 text-primary-400" />
    <h2 class="text-zinc-500 text-sm">全网搜</h2>
  </div>
  <template v-if="filteredResults.length !== 0 || searching">
    <template v-if="filteredResults.length > 0">
      <article
        v-for="(item, idx) in filteredResults"
        :key="idx"
        class="card p-3 relative"
      >
        <div
          v-if="getCheckStatus(item.url) === 'invalid'"
          class="absolute inset-0 bg-red-900/10 pointer-events-none"
        />
        <div class="flex-1 min-w-0 flex gap-2 mb-2 flex-col">
          <div class="text-white flex items-center gap-2">
            <span
              v-if="props.highlightHtml"
              class="min-w-0 break-all"
              v-html="props.highlightHtml(item.title)"
            ></span>
            <span v-else class="min-w-0 break-all">{{ item.title }}</span>
          </div>
          <div class="flex gap-2">
            <div
              class="dark:bg-zinc-800 bg-zinc-700 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <div
                v-if="item.type !== 'other'"
                :class="`icon-${item.type} w-4 h-4 mr-1`"
              ></div>
              {{ getStorageTypeFriendFromFilter(item.type) }}
            </div>
            <ClientOnly>
              <div
                v-if="getCheckStatus(item.url) === 'valid'"
                class="dark:bg-primary-800 bg-primary-600 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
              >
                <CheckCircle
                  class="w-4 h-4 text-[var(--white)] flex-shrink-0 mr-1"
                />链接有效
              </div>
              <div
                v-if="getCheckStatus(item.url) === 'invalid'"
                class="bg-error-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
              >
                <XCircle
                  class="w-4 h-4 text-[var(--white)] flex-shrink-0 mr-1"
                />可能失效
              </div>
              <div
                v-if="getCheckStatus(item.url) === 'checking'"
                class="dark:bg-zinc-800 bg-zinc-700 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
              >
                <Loader2
                  class="w-4 h-4 text-white animate-spin flex-shrink-0 mr-1"
                />正在检测
              </div>
            </ClientOnly>
          </div>
        </div>
        <div
          class="flex justify-between items-center gap-2 border-t border-zinc-700 mt-3 pt-3"
        >
          <span class="text-xs text-zinc-500 flex items-center gap-1"
            >来源: {{ item.source }}</span
          >
          <div class="flex items-center gap-2">
            <button
              v-if="['quark', 'baidu', 'uc', 'xunlei'].includes(item.type)"
              class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
              @click.stop="emit('openTreeModal', item)"
            >
              <Folder class="w-3 h-3" />
              目录
            </button>
            <button
              class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
              @click.stop="emit('openModal', item)"
            >
              <Download class="w-3 h-3" />
              获取链接
            </button>
          </div>
        </div>
      </article>
    </template>

    <div v-if="searching" class="card p-6 text-center">
      <Loader2 class="w-6 h-6 text-primary-400 animate-spin mx-auto mb-2" />
      <p class="text-zinc-400 text-sm">正在全网搜索中...</p>
    </div>

    <div
      v-else-if="error && filteredResults.length === 0"
      class="card p-5 text-center"
    >
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
  </template>
  <template v-else>
    <div class="text-center py-20">
      <div
        class="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4"
        aria-hidden="true"
      >
        <CircleSlash />
      </div>
      <p class="text-zinc-500">全网搜索暂无结果</p>
    </div>
  </template>
</template>
