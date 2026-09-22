<script setup lang="ts">
import {
  CircleSlash,
  RotateCcw,
  ArrowRight,
  Folder,
  AlertTriangle,
  Filter,
} from "@lucide/vue";
import WebSearchResults from "~/components/WebSearchResults.vue";
import type { WebSearchResult } from "~/components/WebSearchResults.vue";
import LocalResourceItem from "~/components/LocalResourceItem.vue";
import type { SourceItem } from "~/components/LocalResourceItem.vue";
import {
  RESOURCE_FILE_TYPE_OPTIONS,
  normalizeResourceFileTypes,
} from "#shared/resource-file-types";

interface PaginatedResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

defineOptions({
  name: "SearchPage",
});

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const showModal = ref(false);
const modalTitle = ref("");
const modalUrl = ref("");
const modalFetching = ref(false);
const modalError = ref("");

const showTreeModal = ref(false);
const treeModalTitle = ref("");
const treeModalContent = ref("");
const treeModalLoading = ref(false);
const treeModalError = ref("");

const { currentText: funnyText, bindFetching } = useFunnyLoading();
bindFetching([modalFetching, treeModalLoading]);

const openTreeModal = async ({
  item,
  type,
}:
  | {
      item: SourceItem;
      type: "id";
    }
  | {
      item: WebSearchResult;
      type: "url";
    }) => {
  treeModalTitle.value = item.title || "";
  treeModalContent.value = "";
  treeModalError.value = "";
  treeModalLoading.value = true;
  showTreeModal.value = true;

  try {
    const query =
      type === "id"
        ? `id=${(item as SourceItem).id}`
        : `url=${encodeURIComponent(item.url)}`;
    const res = await fetch(`/api/source/tree?${query}`);
    const data = await res.json();
    if (res.ok && data.success) {
      treeModalContent.value = data.tree || "（空目录）";
    } else {
      treeModalError.value = data.message || "获取目录失败";
    }
  } catch {
    treeModalError.value = "获取目录失败";
  } finally {
    treeModalLoading.value = false;
  }
};

const setModalLoading = (title: string) => {
  modalTitle.value = title;
  modalUrl.value = "";
  modalError.value = "";
  modalFetching.value = true;
  showModal.value = true;
};

const openModal = async ({
  item,
  type,
}:
  | {
      item: SourceItem;
      type: "id";
    }
  | {
      item: WebSearchResult;
      type: "url";
    }) => {
  setModalLoading(item.title || "");

  try {
    const res = await fetch("/api/source/geturl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        type === "url" ? { url: item.url } : { id: item.id },
      ),
    });
    const data = await res.json();
    if (res.ok && data?.url) {
      modalUrl.value = data.url;
    } else {
      console.error(data);
      modalError.value = data.message || data.error || "获取下载链接失败";
    }
  } catch {
    modalError.value = "获取下载链接失败";
  } finally {
    modalFetching.value = false;
  }
};

const closeModal = () => {
  modalTitle.value = "";
  modalUrl.value = "";
};

const currentPage = computed(() =>
  Math.max(1, parseInt(route.query.page as string) || 1),
);
const searchKeyword = computed(() => (route.query.q as string) || "");
const searchType = computed(() => {
  const t = route.query.type as string;
  if (t === "resource") return "resource";
  if (t === "ai") return "ai";
  return "music";
});
const isMusic = computed(() => searchType.value === "music");
const isAi = computed(() => searchType.value === "ai");

// 筛选参数
const timeFilter = computed(() => (route.query.time as string) || "any");
const panFilter = computed(() => (route.query.pan as string) || "all");
const sortFilter = computed(() => (route.query.sort as string) || "default");
const exactFilter = computed(() => route.query.exact === "true");
const fileTypeFilter = computed(() =>
  normalizeResourceFileTypes(route.query.fileType),
);

// 筛选选项
const timeOptions = [
  { value: "any", label: "任何时间" },
  { value: "day", label: "一天内" },
  { value: "week", label: "一周内" },
  { value: "month", label: "一月内" },
  { value: "year", label: "一年内" },
];

const panOptions = [
  { value: "all", label: "所有网盘" },
  { value: "quark", label: "夸克网盘" },
  { value: "baidu", label: "百度网盘" },
  { value: "xunlei", label: "迅雷网盘" },
  { value: "uc", label: "UC网盘" },
  { value: "ali", label: "阿里网盘" },
  { value: "189", label: "天翼网盘" },
  { value: "139", label: "移动网盘" },
  { value: "123", label: "123网盘" },
  { value: "115", label: "115网盘" },
];

const sortOptions = [
  { value: "default", label: "默认排序" },
  { value: "newest", label: "最新排序" },
  { value: "oldest", label: "最早排序" },
];

// 是否有筛选条件
const hasFilters = computed(() => {
  return (
    timeFilter.value !== "any" ||
    panFilter.value !== "all" ||
    sortFilter.value !== "default" ||
    fileTypeFilter.value.length > 0 ||
    !exactFilter.value
  );
});

// 更新筛选条件
const updateFilter = (key: string, value: string | string[] | boolean) => {
  const query: Record<string, string | string[]> = {
    type: searchType.value,
    q: searchKeyword.value,
    page: "1", // 筛选变更时重置到第一页
  };
  const hasValue = Array.isArray(value)
    ? value.length > 0
    : value !== "any" &&
      value !== "all" &&
      value !== "default" &&
      value !== false;
  if (hasValue) {
    query[key] = Array.isArray(value) ? value : value.toString();
  }

  // 保持其他筛选条件（资源专属）
  if (!isMusic.value) {
    if (timeFilter.value !== "any" && key !== "time")
      query.time = timeFilter.value;
    if (panFilter.value !== "all" && key !== "pan") query.pan = panFilter.value;
    if (sortFilter.value !== "default" && key !== "sort")
      query.sort = sortFilter.value;
    if (fileTypeFilter.value.length > 0 && key !== "fileType")
      query.fileType = fileTypeFilter.value;
  }
  if (exactFilter.value && key !== "exact") query.exact = "true";
  router.push({ path: "/search", query });
};

// 清除筛选
const clearFilters = () => {
  router.push({
    path: "/search",
    query: {
      type: searchType.value,
      q: searchKeyword.value,
      page: "1",
      exact: "true",
    },
  });
};

const {
  data: pageData,
  pending: loading,
  error: fetchError,
  refresh: retryFetch,
  status,
} = await useFetch<PaginatedResponse>(
  () => {
    // AI 模式不请求搜索 API
    if (isAi.value) return "";
    const base = isMusic.value ? "/api/music/search" : "/api/source/search";
    const params = new URLSearchParams({
      q: searchKeyword.value,
      page: currentPage.value.toString(),
      pageSize: isMusic.value ? "20" : "10",
    });
    if (!isMusic.value) {
      if (timeFilter.value !== "any") params.set("time", timeFilter.value);
      if (panFilter.value !== "all") params.set("pan", panFilter.value);
      if (sortFilter.value !== "default") params.set("sort", sortFilter.value);
      fileTypeFilter.value.forEach((type) => params.append("type", type));
    }
    if (exactFilter.value) params.set("exact", "true");
    return `${base}?${params.toString()}`;
  },
  {
    key: () =>
      `search-${searchType.value}-${searchKeyword.value}-${currentPage.value}-${timeFilter.value}-${panFilter.value}-${sortFilter.value}-${fileTypeFilter.value.join(",")}-${exactFilter.value}`,
    server: true,
    lazy: true,
    watch: [
      searchKeyword,
      currentPage,
      searchType,
      timeFilter,
      panFilter,
      sortFilter,
      fileTypeFilter,
      exactFilter,
    ],
  },
);

const results = computed<MusicSearch[] | SourceItem[]>(
  () => pageData.value?.data || [],
);
const total = computed(() => pageData.value?.total || 0);
const totalPages = computed(() => pageData.value?.totalPages || 0);
const tokens = computed(() => (pageData.value as any)?.tokens || []);

const highlight = (text: string): string => highlightTokens(text, tokens.value);

// 错误分类：rate-limit / server / network
interface ErrorInfo {
  type: "rate-limit" | "server" | "network" | "param";
  title: string;
  message: string;
  canRetry: boolean;
}

const errorInfo = computed<ErrorInfo | null>(() => {
  const err: any = fetchError.value;
  if (!err) return null;
  // 兼容 Nitro 的 H3Error：statusCode 字段
  const code = err?.statusCode || err?.status || err?.response?.status || 0;

  if (code === 429) {
    const retryAfter = (err?.data?.retryAfter as number | undefined) || 180;
    return {
      type: "rate-limit",
      title: "搜索请求过于频繁",
      message: `请在 ${retryAfter} 秒后再次尝试。`,
      canRetry: false,
    };
  }
  if (code === 400) {
    return {
      type: "param",
      title:
        err?.data.statusMessage ||
        err?.statusMessage ||
        err?.message ||
        "参数错误",
      message: err?.data?.message || "搜索关键词最多 30 个字符，请精简后重试。",
      canRetry: false,
    } as ErrorInfo;
  }
  if (code >= 500 && code < 600) {
    return {
      type: "server",
      title: "服务器开小差了",
      message: "我们正在排查问题，您可以稍后重试，或换一个关键词试试。",
      canRetry: true,
    };
  }
  if (code === 404) {
    return {
      type: "server",
      title: "未找到相关资源",
      message: "请确认关键词后再试。",
      canRetry: true,
    };
  }
  if (code >= 400) {
    return {
      type: "server",
      title: "请求失败",
      message: err?.statusMessage || err?.message || "请稍后再试。",
      canRetry: true,
    };
  }
  // 网络/未知错误
  return {
    type: "network",
    title: "网络连接异常",
    message: "请检查网络后重试，或稍等片刻再搜索。",
    canRetry: true,
  };
});

const handleRetry = () => {
  retryFetch();
};

const pageTitle = computed(() => {
  const q = searchKeyword.value;
  if (isAi.value) {
    return q ? `${q} - AI 搜索 - 全盘搜` : "AI 搜索 - 全盘搜";
  }
  const label = isMusic.value ? "歌曲" : "资源";
  if (q && results.value.length > 0) {
    return `"${q}" - 第${currentPage.value}页 - 搜索${label} - 全盘搜`;
  }
  if (q) {
    return `${q} - 搜索${label} - 全盘搜`;
  }
  return `搜索${label} - 全盘搜`;
});

const pageDescription = computed(() => {
  const q = searchKeyword.value;
  const label = isMusic.value ? "歌曲" : "网盘资源";
  if (q && total.value > 0) {
    return `在全盘搜搜索"${q}"，共找到 ${total.value} 个相关${label}。`;
  }
  if (q) {
    return `在全盘搜搜索"${q}"的相关结果。`;
  }
  return "全盘搜搜索 - 免费下载高品质音乐与网盘资源。";
});

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  twitterTitle: pageTitle,
  twitterDescription: pageDescription,
});

const keywords = [
  searchKeyword.value,
  ...tokens.value,
  "全盘搜",
  "音乐下载",
  "MP3下载",
  "FLAC下载",
  "网盘搜索",
  "网盘下载",
];
useHead({
  meta: [
    {
      name: "keywords",
      content: keywords.join(","),
    },
  ],
  link: [
    {
      rel: "canonical",
      href: () =>
        `/search?type=${searchType.value}&q=${encodeURIComponent(searchKeyword.value)}&page=${currentPage.value}`,
    },
  ],
});

const switchType = (type: "music" | "resource" | "ai") => {
  if (type === searchType.value) return;
  const arr = [`type=${type}`];
  const q = searchKeyword.value;
  if (q) {
    arr.push(`q=${encodeURIComponent(q)}`);
  }
  if (route.query.exact) {
    arr.push(`exact=true`);
  }
  router.push(`/search?${arr.join("&")}`);
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  window.scrollTo({ top: 0 });
  router.push({
    path: "/search",
    query: { ...route.query, page: page.toString() },
  });
};

const skeletonList = Array.from({ length: 4 });

const { submitPanCheck, getCheckStatus, stopPanCheck } = usePanCheck();

watch(
  [results],
  () => {
    if (import.meta.client) {
      stopPanCheck();
      if (!isMusic.value && results.value.length > 0) {
        const ids = (results.value as SourceItem[])
          .filter((item) => item.type !== "magnet")
          .map((item) => item.id);
        submitPanCheck(ids);
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <!-- 搜索类型 tab -->
  <div class="flex items-center gap-2 mb-4">
    <UButton
      v-for="item in [
        {
          type: 'resource',
          label: '搜资源',
          icon: 'i-lucide-folder',
        },
        {
          type: 'music',
          label: '搜音乐',
          icon: 'i-lucide-music',
        },
        {
          type: 'ai',
          label: 'AI 搜索',
          icon: 'i-lucide-sparkles',
        },
      ]"
      variant="soft"
      color="neutral"
      @click="switchType(item.type)"
      :icon="item.icon"
      :ui="{
        leadingIcon: 'size-4',
      }"
      :active="searchType === item.type"
      active-class="pointer-events-none"
      active-variant="solid"
      active-color="primary"
      size="lg"
      >{{ item.label }}</UButton
    >
  </div>

  <main>
    <!-- AI 搜索模式 -->
    <ClientOnly v-if="isAi">
      <AiChat :initial-query="searchKeyword" />
    </ClientOnly>

    <template v-else>
      <div
        v-if="errorInfo && searchKeyword"
        class="card p-5 text-center mb-6"
        role="alert"
      >
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
          :class="
            errorInfo.type === 'rate-limit' || errorInfo.type === 'param'
              ? 'bg-yellow-900/50 text-yellow-400'
              : 'bg-red-900/50 text-red-400'
          "
          aria-hidden="true"
        >
          <AlertTriangle class="w-7 h-7" />
        </div>
        <h3 class="text-lg font-medium text-white mb-1">
          {{ errorInfo.title }}
        </h3>
        <p class="text-sm text-zinc-500">{{ errorInfo.message }}</p>
        <button
          v-if="errorInfo.canRetry"
          class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="handleRetry"
        >
          <RotateCcw class="w-4 h-4" />
          重新搜索
        </button>
      </div>

      <div
        v-else-if="loading && searchKeyword"
        class="space-y-2"
        :class="{ 'mt-3': !isMusic }"
        aria-busy="true"
        aria-label="正在加载搜索结果"
      >
        <div class="h-3 bg-zinc-700 rounded w-1/4 animate-pulse mb-2" />
        <article
          v-for="(_, i) in skeletonList"
          :key="i"
          class="card p-3 animate-pulse"
        >
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-zinc-700 rounded-lg" />
            <div class="flex-1 space-y-1">
              <div class="h-3 bg-zinc-700 rounded w-3/4" />
              <div class="h-2 bg-zinc-700 rounded w-1/3" />
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="searchKeyword" class="space-y-2">
        <h2 v-if="results.length > 0" class="text-muted text-sm mb-3">
          搜索"<span class="text-primary-400">{{ searchKeyword }}</span
          >"找到 {{ total }} {{ isMusic ? "首歌曲" : "个资源" }}
          <span v-if="totalPages > 1" class="ml-2"
            >（第 {{ currentPage }} / {{ totalPages }} 页）</span
          >
        </h2>

        <template v-if="isMusic">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <UButton
              variant="outline"
              color="neutral"
              size="lg"
              :active="exactFilter"
              active-color="primary"
              active-variant="solid"
              icon="i-lucide-target"
              @click="updateFilter('exact', !exactFilter)"
            >
              精准搜索
            </UButton>
            <UButton
              variant="outline"
              color="neutral"
              size="lg"
              @click="clearFilters"
              :disabled="!hasFilters"
              icon="i-lucide-rotate-ccw-square"
            >
              清除筛选
            </UButton>
          </div>

          <article
            v-for="music in <MusicSearch[]>results"
            :key="music.id"
            class="card cursor-pointer hover:border-primary-500/50 transition-colors"
            role="article"
          >
            <NuxtLink
              :to="`/music/${music.id}`"
              class="flex items-center gap-3 p-3"
            >
              <img
                :src="music.cover || config.app.baseURL + 'img/cover.png'"
                :alt="music.title"
                class="w-12 h-12 rounded-lg object-cover"
                loading="lazy"
                decoding="async"
                @error="
                  ($event.target as HTMLImageElement).src =
                    config.app.baseURL + 'img/cover.png'
                "
              />
              <div class="flex-1 min-w-0">
                <h3
                  class="text-sm font-medium truncate"
                  v-html="highlight(music.title)"
                />
                <p class="text-xs text-zinc-500 truncate">
                  <span v-html="highlight(music.artist)" /><span
                    v-if="music.album"
                  >
                    - <span v-html="highlight(music.album)"
                  /></span>
                </p>
                <div class="flex mt-0.5">
                  <span
                    v-if="music.quality"
                    v-for="q in music.quality"
                    :key="q"
                    class="badge"
                  >
                    {{ q }}
                  </span>
                </div>
              </div>
              <ArrowRight class="w-4 h-4 text-zinc-600 shrink-0" />
            </NuxtLink>
          </article>

          <template v-if="results.length === 0">
            <div class="text-center py-20">
              <div
                class="size-20 bg-elevated rounded-full flex items-center justify-center mx-auto mb-4"
                aria-hidden="true"
              >
                <CircleSlash />
              </div>
              <p class="text-muted">
                {{ "此搜索关键词暂无结果" }}
              </p>
            </div>
          </template>
        </template>

        <template v-else>
          <template v-if="searchKeyword">
            <div class="flex items-center gap-2 my-3">
              <Filter class="size-4 text-primary" />
              <h2 class="text-muted text-sm">筛选条件</h2>
            </div>

            <div class="flex flex-wrap items-center gap-2 mb-4">
              <MultiSelectCombobox
                class="flex-1 min-w-32"
                :model-value="fileTypeFilter"
                :options="RESOURCE_FILE_TYPE_OPTIONS"
                placeholder="所有文件"
                clear-label="清空选择"
                aria-label="选择文件类型"
                @update:model-value="updateFilter('fileType', $event)"
              />

              <USelect
                class="flex-1 min-w-24"
                size="lg"
                color="neutral"
                variant="outline"
                value-key="value"
                :items="timeOptions"
                :model-value="timeFilter"
                aria-label="选择入库时间"
                @update:model-value="updateFilter('time', $event as string)"
              />

              <USelect
                class="flex-1 min-w-24"
                size="lg"
                color="neutral"
                variant="outline"
                value-key="value"
                :items="panOptions"
                :model-value="panFilter"
                aria-label="选择网盘类型"
                @update:model-value="updateFilter('pan', $event as string)"
              />

              <USelect
                class="flex-1 min-w-24"
                size="lg"
                color="neutral"
                variant="outline"
                value-key="value"
                :items="sortOptions"
                :model-value="sortFilter"
                aria-label="选择排序方式"
                @update:model-value="updateFilter('sort', $event as string)"
              />

              <UButton
                variant="outline"
                color="neutral"
                size="lg"
                :active="exactFilter"
                active-color="primary"
                active-variant="solid"
                icon="i-lucide-target"
                @click="updateFilter('exact', !exactFilter)"
              >
                精准搜索
              </UButton>

              <UButton
                variant="outline"
                color="neutral"
                size="lg"
                @click="clearFilters"
                :disabled="!hasFilters"
                icon="i-lucide-rotate-ccw-square"
              >
                清除筛选
              </UButton>
            </div>
          </template>

          <template
            v-if="
              ['all', 'quark', 'baidu', 'uc', 'xunlei', 'ali'].includes(
                panFilter,
              )
            "
          >
            <div v-if="currentPage === 1" class="flex items-center gap-2 my-3">
              <Folder class="size-4 text-primary" />
              <h2 class="text-muted text-sm">本地资源</h2>
            </div>
            <template v-if="results.length > 0">
              <LocalResourceItem
                v-for="item in <SourceItem[]>results"
                :key="item.id"
                :item="item"
                :check-status="getCheckStatus(item.id)"
                :highlight-html="highlight(item.title)"
                :highlight-menu="highlight(item.menu)"
                @open-tree="openTreeModal({ item, type: 'id' })"
                @open-modal="openModal({ item, type: 'id' })"
              />
            </template>
            <template v-else>
              <div class="text-center py-20">
                <div
                  class="size-20 bg-elevated rounded-full flex items-center justify-center mx-auto mb-4"
                  aria-hidden="true"
                >
                  <CircleSlash />
                </div>
                <p class="text-muted">本地搜索暂无结果</p>
              </div>
            </template>
          </template>

          <template v-if="currentPage === 1">
            <WebSearchResults
              :keyword="searchKeyword"
              :disabled="isMusic"
              :highlight-html="highlight"
              :filter="panFilter"
              @open-tree="(item) => openTreeModal({ item, type: 'url' })"
              @open-modal="(item) => openModal({ item, type: 'url' })"
            />
          </template>
        </template>

        <Pagination
          :current-page="currentPage"
          :total-pages="totalPages"
          @change="goToPage"
        />
      </div>

      <div v-else class="text-center py-20">
        <div
          class="size-20 bg-elevated rounded-full flex items-center justify-center mx-auto mb-4"
          aria-hidden="true"
        >
          <CircleSlash />
        </div>
        <p class="text-muted">请输入搜索关键词</p>
      </div>
    </template>
  </main>

  <DownloadLinkPanel
    v-model:open="showModal"
    :title="modalTitle"
    :url="modalUrl"
    :loading="modalFetching"
    :error="modalError"
    @close="closeModal"
  />

  <UModal v-model:open="showTreeModal">
    <template #title>
      目录结构<span class="text-xs text-muted">（最多显示5层、150个文件）</span>
    </template>

    <template #body>
      <h4 v-if="treeModalTitle" class="text-sm font-medium truncate mb-3">
        {{ treeModalTitle }}
      </h4>
      <div v-if="treeModalLoading" class="text-center py-8">
        <div
          class="size-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
        />
        <p class="text-muted text-sm">{{ funnyText }}</p>
      </div>
      <div v-else-if="treeModalError" class="text-center py-8">
        <p class="text-red-400 text-sm">{{ treeModalError }}</p>
      </div>
      <pre
        v-else
        class="bg-elevated rounded-lg p-4 text-sm overflow-auto max-h-[60vh] whitespace-pre font-mono"
        >{{ treeModalContent }}</pre
      >
    </template>
  </UModal>
</template>

<style scoped>
@reference "~/assets/css/main.css";

.badge {
  @apply border border-muted text-muted text-xs;
  padding: 1px 3px;
  border-radius: 4px;
  margin-right: 2px;
  &:last-child {
    margin-right: 0;
  }
}

.modal-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
