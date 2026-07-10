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
import { getTypeName } from "~/utils";

export interface WebSearchResult {
  title: string;
  url: string;
  source: string;
  image?: string;
  type: string;
}

const props = defineProps<{
  keyword: string;
  disabled?: boolean;
  highlightHtml?: (text: string) => string;
}>();

const emit = defineEmits<{
  openTreeModal: [item: WebSearchResult];
  openModal: [item: WebSearchResult];
}>();

const results = ref<WebSearchResult[]>([]);
const searching = ref(false);
const error = ref("");
let eventSource: EventSource | null = null;

const { submitPanCheck, getCheckStatus, stopPanCheck } = usePanCheck({
  mode: "urls",
});

const startWebSearch = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  stopPanCheck();
  results.value = [];
  error.value = "";

  if (props.disabled || !props.keyword.trim()) {
    searching.value = false;
    return;
  }

  if (typeof EventSource === "undefined") return;

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
      } else if (msg.type === "done") {
        searching.value = false;
        es.close();
        eventSource = null;
        if (results.value.length > 0) {
          const urls = results.value.map((item) => item.url);
          submitPanCheck(urls);
        }
      } else if (msg.type === "error") {
        error.value = msg.message || "全网搜失败";
        searching.value = false;
        es.close();
        eventSource = null;
      }
    } catch {
      // 忽略解析失败的推送
    }
  };

  es.onerror = () => {
    searching.value = false;
    es.close();
    eventSource = null;
  };
};

const stopWebSearch = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  stopPanCheck();
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
    <h2 class="text-gray-500 text-sm">全网搜</h2>
  </div>
  <template v-if="results.length !== 0 || searching">
    <template v-if="results.length > 0">
      <article
        v-for="(item, idx) in results"
        :key="idx"
        class="card p-3 relative"
      >
        <div
          v-if="getCheckStatus(item.url) === 'invalid'"
          class="absolute inset-0 bg-red-900/20 pointer-events-none"
        />
        <div
          class="flex-1 min-w-0 flex gap-2 mb-2 md:flex-row flex-col-reverse"
        >
          <div
            class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center flex-shrink-0"
          >
            <img
              v-if="item.type !== 'other'"
              :src="`/img/pan/${item.type}.png`"
              class="w-4 h-4 mr-1"
            />
            {{ getTypeName(item.type) }}
          </div>
          <h3 class="text-white flex items-center gap-2">
            <span
              v-html="props.highlightHtml?.(item.title) || item.title"
            ></span>
            <CheckCircle
              v-if="getCheckStatus(item.url) === 'valid'"
              class="w-4 h-4 text-green-400 flex-shrink-0"
              title="链接有效"
            />
            <XCircle
              v-if="getCheckStatus(item.url) === 'invalid'"
              class="w-4 h-4 text-red-400 flex-shrink-0"
              title="链接失效"
            />
            <Loader2
              v-if="getCheckStatus(item.url) === 'checking'"
              class="w-4 h-4 text-gray-400 animate-spin flex-shrink-0"
              title="检测中"
            />
          </h3>
        </div>
        <div
          class="flex justify-between items-center gap-2 border-t border-gray-700 mt-3 pt-3"
        >
          <span class="text-xs text-gray-500 flex items-center gap-1"
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
      <p class="text-gray-400 text-sm">正在全网搜索中...</p>
    </div>

    <div v-else-if="error && results.length === 0" class="card p-5 text-center">
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
  </template>
  <template v-else>
    <div class="text-center py-20">
      <div
        class="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"
        aria-hidden="true"
      >
        <CircleSlash />
      </div>
      <p class="text-gray-500">
        {{ "全网搜索暂无结果" }}
      </p>
    </div>
  </template>
</template>
