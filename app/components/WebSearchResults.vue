<script setup lang="ts">
import {
  Globe,
  Loader2,
  Folder,
  Download,
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
}>();

const emit = defineEmits<{
  openTreeModal: [item: WebSearchResult];
  openModal: [item: WebSearchResult];
}>();

const results = ref<WebSearchResult[]>([]);
const searching = ref(false);
const error = ref("");
let eventSource: EventSource | null = null;

const startWebSearch = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
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
  <template v-if="results.length !== 0 || searching">
    <div class="flex items-center gap-2 !my-3">
      <Globe class="w-4 h-4 text-primary-400" />
      <h2 class="text-gray-500 text-sm">全网搜</h2>
    </div>

    <template v-if="results.length > 0">
      <article
        v-for="(item, idx) in results"
        :key="idx"
        class="card p-3"
      >
        <div
          class="flex-1 min-w-0 flex justify-between gap-2 md:flex-row flex-col mb-2"
        >
          <h3 class="text-sm font-medium text-white truncate mb-1">
            {{ item.title }}
          </h3>
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
      <Loader2
        class="w-6 h-6 text-primary-400 animate-spin mx-auto mb-2"
      />
      <p class="text-gray-400 text-sm">正在全网搜索中...</p>
    </div>

    <div
      v-else-if="error && results.length === 0"
      class="card p-5 text-center"
    >
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
  </template>
</template>
