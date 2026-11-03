<script setup lang="ts">
import {
  Globe,
  Loader2,
  CheckCircle,
  CircleSlash,
  XCircle,
} from "@lucide/vue";
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
  openTree: [item: WebSearchResult];
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

// 实例化 panCheck Hook（视口懒检测：只有渲染出来且进入视口的链接才会送检）
const {
  registerItems,
  getCheckStatus,
  stopPanCheck,
  vPanCheck,
} = usePanCheck({
  mode: "urls",
  batchSize: 10,
});

let eventSource: EventSource | null = null;

// 流式结果按帧合并落库：EventSource 一批可能推入几十条，逐条 push 会让
// 整个列表重渲染 O(n²)（第 N 条到达时连前 N-1 张卡一起重渲染），合并后一帧最多一次
let pendingResults: WebSearchResult[] = [];
let pushFrame = 0;

const flushPendingResults = () => {
  pushFrame = 0;
  if (pendingResults.length === 0) return;
  results.value.push(...pendingResults);
  pendingResults = [];
};

const queueResult = (item: WebSearchResult) => {
  pendingResults.push(item);
  if (pushFrame) return;
  pushFrame = requestAnimationFrame(flushPendingResults);
};

const cancelPendingResults = () => {
  if (pushFrame) {
    cancelAnimationFrame(pushFrame);
    pushFrame = 0;
  }
  pendingResults = [];
};

const startWebSearch = () => {
  // 1. 清理上一轮网络与检测状态
  closeEventSource();
  stopPanCheck();
  cancelPendingResults();

  results.value = [];
  error.value = "";

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
        // 进入待渲染缓冲，按帧统一落库（见 queueResult 注释）
        queueResult(msg.data);
        // 不进行检测的类型
        if (["magnet", "guangya", "139"].includes(msg.data.type)) return;
        // 注册待检测：卡片滚入视口后才真正送检
        registerItems([msg.data.url]);
      } else if (msg.type === "done") {
        searching.value = false;
        closeEventSource();
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
  cancelPendingResults();
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
  <div class="flex items-center gap-2 my-3">
    <Globe class="size-4 text-primary" />
    <h2 class="text-muted text-sm">全网搜</h2>
  </div>
  <template v-if="filteredResults.length !== 0 || searching">
    <template v-if="filteredResults.length > 0">
      <UCard
        as="article"
        v-for="item in filteredResults"
        :key="item.url"
        v-pan-check="item.url"
        v-memo="[item.url, getCheckStatus(item.url)]"
        class="relative"
        :ui="{ body: 'sm:p-3 p-2' }"
      >
        <div
          v-if="getCheckStatus(item.url) === 'invalid'"
          class="absolute inset-0 bg-red-900/10 pointer-events-none"
        />
        <div class="flex-1 min-w-0 flex gap-2 flex-col">
          <span
            v-if="props.highlightHtml"
            class="min-w-0 break-all"
            v-html="props.highlightHtml(item.title)"
          ></span>
          <span v-else class="min-w-0 break-all">{{ item.title }}</span>
          <div class="flex gap-2">
            <div
              class="bg-accented px-2 py-1 rounded-sm text-sm self-start flex items-center"
            >
              <div
                v-if="item.type !== 'other'"
                :class="`icon-${item.type} size-4 mr-1`"
              ></div>
              {{ getStorageTypeFriendFromFilter(item.type) }}
            </div>
            <ClientOnly>
              <div
                v-if="getCheckStatus(item.url) === 'valid'"
                class="dark:bg-success-600/60 bg-success-800/80 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
              >
                <CheckCircle class="size-4 text-white shrink-0 mr-1" />链接有效
              </div>
              <div
                v-if="getCheckStatus(item.url) === 'invalid'"
                class="bg-error-800/90 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
              >
                <XCircle class="size-4 text-white shrink-0 mr-1" />可能失效
              </div>
              <div
                v-if="getCheckStatus(item.url) === 'checking'"
                class="bg-accented px-2 py-1 rounded-sm text-sm self-start flex items-center"
              >
                <Loader2 class="size-4 animate-spin shrink-0 mr-1" />正在检测
              </div>
            </ClientOnly>
          </div>

          <USeparator
            :ui="{
              border: 'border-muted',
            }"
          />
          <div
            class="flex justify-between items-center gap-2 max-sm:flex-row-reverse"
          >
            <div class="flex items-center gap-2 max-sm:flex-row-reverse">
              <UButton
                variant="solid"
                @click.stop="emit('openModal', item)"
                icon="i-lucide-download"
                :ui="{
                  leadingIcon: 'size-4',
                }"
                >获取链接</UButton
              >
              <UButton
                v-if="
                  ['quark', 'baidu', 'uc', 'xunlei', 'guangya', '139'].includes(
                    item.type,
                  )
                "
                variant="outline"
                @click.stop="emit('openTree', item)"
                icon="i-lucide-folder"
                :ui="{
                  leadingIcon: 'size-4',
                }"
                >目录</UButton
              >
            </div>
            <span class="text-xs text-muted flex items-center"
              >来源: {{ item.source }}</span
            >
          </div>
        </div>
      </UCard>
    </template>

    <UCard v-if="searching" class="text-center">
      <Loader2 class="size-6 text-primary-400 animate-spin mx-auto mb-2" />
      <p class="text-muted text-sm">正在全网搜索中...</p>
    </UCard>

    <UCard
      v-else-if="error && filteredResults.length === 0"
      class="text-center"
    >
      <p class="text-red-400 text-sm">{{ error }}</p>
    </UCard>
  </template>
  <template v-else>
    <div class="text-center py-20">
      <div
        class="size-20 bg-elevated rounded-full flex items-center justify-center mx-auto mb-4"
        aria-hidden="true"
      >
        <CircleSlash />
      </div>
      <p class="text-muted">全网搜索暂无结果</p>
    </div>
  </template>
</template>
