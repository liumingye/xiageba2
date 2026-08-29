<script setup lang="ts">
import {
  CircleSlash,
  RotateCcw,
  Music as MusicIcon,
  FolderOpen,
  ArrowRight,
  X,
  Folder,
  AlertTriangle,
  Filter,
  Calendar,
  HardDrive,
  ArrowUpDown,
  Target,
  RotateCcwSquare,
  Sparkles,
} from "@lucide/vue";
import WebSearchResults from "~/components/WebSearchResults.vue";
import type { WebSearchResult } from "~/components/WebSearchResults.vue";
import LocalResourceItem from "~/components/LocalResourceItem.vue";
import type { SourceItem } from "~/components/LocalResourceItem.vue";
import {
  RESOURCE_FILE_TYPE_OPTIONS,
  normalizeResourceFileTypes,
} from "#shared/resource-file-types";
import { useScrollLock } from "@vueuse/core";

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

const scrollLock = useScrollLock(window);

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
  scrollLock.value = true;

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

const closeTreeModal = () => {
  scrollLock.value = false;
  showTreeModal.value = false;
  treeModalTitle.value = "";
  treeModalContent.value = "";
  treeModalError.value = "";
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
const musicStore = useMusicStore();

const searchQuery = ref("");
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
    exactFilter.value
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
    query: { type: searchType.value, q: searchKeyword.value, page: "1" },
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

useHead({
  title: pageTitle,
  meta: [
    { name: "description", content: pageDescription },
    {
      name: "keywords",
      content: `${searchKeyword.value}, 音乐搜索, 全盘搜, MP3下载, FLAC下载, 网盘搜索, 网盘下载`,
    },
    { name: "robots", content: "index, follow" },
    { name: "theme-color", content: "#0f172a" },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: pageDescription },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "全盘搜" },
  ],
  link: [
    {
      rel: "canonical",
      href: () =>
        `/search?type=${searchType.value}&q=${encodeURIComponent(searchKeyword.value)}&page=${currentPage.value}`,
    },
  ],
});

watch(
  searchKeyword,
  (val) => {
    searchQuery.value = val;
  },
  { immediate: true },
);

const performSearch = (keyword: string) => {
  if (!keyword.trim()) return;
  musicStore.addSearchHistory(keyword);
  searchQuery.value = keyword;
};

const switchType = (type: "music" | "resource" | "ai") => {
  if (type === searchType.value) return;
  const q = searchKeyword.value;
  if (q) {
    router.push(`/search?type=${type}&q=${encodeURIComponent(q)}`);
  } else {
    router.push(`/search?type=${type}`);
  }
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

<style scoped>
.badge {
  @apply border border-primary-600 text-primary-600 text-xs;
  padding: 1px 3px;
  border-radius: 4px;
  margin-right: 2px;
  &:last-child {
    margin-right: 0;
  }
}
</style>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar :search-query="searchQuery" @search="performSearch" />
    <div class="max-w-4xl mx-auto px-2">
      <!-- 搜索类型 tab -->
      <div class="flex items-center gap-2 mb-4">
        <button
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors"
          :class="
            searchType === 'resource'
              ? 'bg-primary-600 text-white font-medium'
              : 'bg-color-100 text-color-300 hover:bg-color-300'
          "
          @click="switchType('resource')"
        >
          <FolderOpen class="w-4 h-4" />
          搜资源
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors"
          :class="
            isMusic
              ? 'bg-primary-600 text-white font-medium'
              : 'bg-color-100 text-color-300 hover:bg-color-300'
          "
          @click="switchType('music')"
        >
          <MusicIcon class="w-4 h-4" />
          搜音乐
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors"
          :class="
            isAi
              ? 'bg-primary-600 text-white font-medium'
              : 'bg-color-100 text-color-300 hover:bg-color-300'
          "
          @click="switchType('ai')"
        >
          <Sparkles class="w-4 h-4" />
          AI 搜索
        </button>
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
            <h2 v-if="results.length > 0" class="text-color-500 text-sm mb-3">
              搜索"<span class="text-primary-400">{{ searchKeyword }}</span
              >"找到 {{ total }} {{ isMusic ? "首歌曲" : "个资源" }}
              <span v-if="totalPages > 1" class="ml-2"
                >（第 {{ currentPage }} / {{ totalPages }} 页）</span
              >
            </h2>

            <template v-if="isMusic">
              <!-- 音乐筛选条件 -->
              <div class="flex flex-wrap items-center gap-2 mb-4">
                <button
                  class="btn"
                  :class="
                    exactFilter
                      ? 'bg-primary-500/20 text-primary-500 border-primary-500'
                      : ''
                  "
                  @click="updateFilter('exact', !exactFilter)"
                >
                  <Target class="w-3.5 h-3.5" />
                  精准搜索
                </button>

                <button
                  class="btn"
                  @click="clearFilters"
                  :disabled="!hasFilters"
                >
                  <RotateCcwSquare class="w-3.5 h-3.5" />
                  清除筛选
                </button>
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
                  <ArrowRight class="w-4 h-4 text-zinc-600 flex-shrink-0" />
                </NuxtLink>
              </article>

              <template v-if="results.length === 0">
                <div class="text-center py-20">
                  <div
                    class="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4"
                    aria-hidden="true"
                  >
                    <CircleSlash />
                  </div>
                  <p class="text-zinc-500">
                    {{ "此搜索关键词暂无结果" }}
                  </p>
                </div>
              </template>
            </template>

            <template v-else>
              <template v-if="searchKeyword">
                <div class="flex items-center gap-2 !my-3">
                  <Filter class="w-4 h-4 text-primary-400" />
                  <h2 class="text-color-500 text-sm">筛选条件</h2>
                </div>

                <!-- 资源筛选条件 -->
                <div class="flex flex-wrap items-center gap-2 mb-4">
                  <!-- 文件类型（多选） -->
                  <MultiSelectCombobox
                    class="flex-1 min-w-32"
                    :model-value="fileTypeFilter"
                    :options="RESOURCE_FILE_TYPE_OPTIONS"
                    placeholder="所有文件"
                    clear-label="清空选择"
                    aria-label="选择文件类型"
                    @update:model-value="updateFilter('fileType', $event)"
                  />

                  <!-- 入库时间 -->
                  <div class="flex-1 relative min-w-24">
                    <select
                      class="select"
                      :value="timeFilter"
                      @change="
                        updateFilter(
                          'time',
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option
                        v-for="opt in timeOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                    <Calendar
                      class="w-3 h-3 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                  </div>

                  <!-- 网盘类型 -->
                  <div class="flex-1 relative min-w-24">
                    <select
                      class="select"
                      :value="panFilter"
                      @change="
                        updateFilter(
                          'pan',
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option
                        v-for="opt in panOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                    <HardDrive
                      class="w-3 h-3 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                  </div>

                  <!-- 排序 -->
                  <div class="flex-1 relative min-w-24">
                    <select
                      class="select"
                      :value="sortFilter"
                      @change="
                        updateFilter(
                          'sort',
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option
                        v-for="opt in sortOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                    <ArrowUpDown
                      class="w-3 h-3 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                  </div>

                  <!-- 精准搜索 -->
                  <button
                    class="btn"
                    :class="
                      exactFilter
                        ? 'bg-primary-500/20 text-primary-500 border-primary-500'
                        : ''
                    "
                    @click="updateFilter('exact', !exactFilter)"
                  >
                    <Target class="w-3.5 h-3.5" />
                    精准搜索
                  </button>

                  <!-- 清除筛选 -->
                  <button
                    class="btn"
                    @click="clearFilters"
                    :disabled="!hasFilters"
                  >
                    <RotateCcwSquare class="w-3.5 h-3.5" />
                    清除筛选
                  </button>
                </div>
              </template>

              <template
                v-if="
                  ['all', 'quark', 'baidu', 'uc', 'xunlei', 'ali'].includes(
                    panFilter,
                  )
                "
              >
                <div
                  v-if="currentPage === 1"
                  class="flex items-center gap-2 !my-3"
                >
                  <Folder class="w-4 h-4 text-primary-400" />
                  <h2 class="text-color-500 text-sm">本地资源</h2>
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
                      class="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4"
                      aria-hidden="true"
                    >
                      <CircleSlash />
                    </div>
                    <p class="text-zinc-500">本地搜索暂无结果</p>
                  </div>
                </template>
              </template>

              <template v-if="currentPage === 1">
                <WebSearchResults
                  :keyword="searchKeyword"
                  :disabled="isMusic"
                  :highlight-html="highlight"
                  :filter="panFilter"
                  @open-tree-modal="
                    (item) => openTreeModal({ item, type: 'url' })
                  "
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
              class="w-20 h-20 bg-color-300 rounded-full flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <CircleSlash />
            </div>
            <p class="text-gray-500">请输入搜索关键词</p>
          </div>
        </template>
      </main>

      <Qrcode v-if="!isAi" />

      <SiteFooter v-if="!isAi" />

      <DownloadLinkPanel
        v-model:open="showModal"
        :title="modalTitle"
        :url="modalUrl"
        :loading="modalFetching"
        :error="modalError"
        @close="closeModal"
      />

      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showTreeModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            @click.self="closeTreeModal"
          >
            <div
              class="modal-content bg-color-100 rounded-xl max-w-lg w-full border border-color-300 shadow-2xl"
            >
              <div
                class="flex items-center justify-between py-2 px-3 border-b border-color-300"
              >
                <h3 class="font-medium text-color-300">
                  目录结构<span class="text-xs text-color-500"
                    >（最多显示5层、150个文件）</span
                  >
                </h3>
                <button
                  class="text-color-400 transition-all opacity-80 hover:opacity-100 hover:bg-color-300 rounded-md p-2"
                  @click="closeTreeModal"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
              <div class="p-4">
                <h4
                  v-if="treeModalTitle"
                  class="text-sm font-medium truncate mb-3"
                >
                  {{ treeModalTitle }}
                </h4>
                <div v-if="treeModalLoading" class="text-center py-8">
                  <div
                    class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                  />
                  <p class="text-color-400 text-sm">{{ funnyText }}</p>
                </div>
                <div v-else-if="treeModalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ treeModalError }}</p>
                </div>
                <pre
                  v-else
                  class="bg-color-300 rounded-lg p-4 text-sm text-color-100 overflow-auto max-h-[60vh] whitespace-pre font-mono"
                  >{{ treeModalContent }}</pre
                >
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.btn {
  @apply flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-70 disabled:cursor-not-allowed disabled:pointer-events-none border border-color-300 hover:border-primary-500;
}

.select {
  @apply w-full appearance-none bg-color-100 text-color-300 hover:bg-color-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500 border border-color-300 hover:border-primary-500;
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
