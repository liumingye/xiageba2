<script setup lang="ts">
import { getStorageType } from "#shared/utils";
import {
  CircleSlash,
  RotateCcw,
  Clipboard,
  Music as MusicIcon,
  FolderOpen,
  ExternalLink,
  ArrowRight,
  QrCode,
  X,
  Folder,
  AlertTriangle,
  Filter,
  Calendar,
  HardDrive,
  ArrowUpDown,
  Target,
  RotateCcwSquare,
} from "@lucide/vue";
import { getTypeName } from "~/utils/index";
import { useClipboard, useMediaQuery } from "@vueuse/core";
import WebSearchResults from "~/components/WebSearchResults.vue";
import type { WebSearchResult } from "~/components/WebSearchResults.vue";
import LocalResourceItem from "~/components/LocalResourceItem.vue";
import type { SourceItem } from "~/components/LocalResourceItem.vue";

interface PaginatedResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const showModal = ref(false);
const modalTitle = ref("");
const modalUrl = ref("");
const modalQrCode = ref("");
const modalFetching = ref(false);
const modalError = ref("");

const showTreeModal = ref(false);
const treeModalTitle = ref("");
const treeModalContent = ref("");
const treeModalLoading = ref(false);
const treeModalError = ref("");

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

const closeTreeModal = () => {
  showTreeModal.value = false;
  treeModalTitle.value = "";
  treeModalContent.value = "";
  treeModalError.value = "";
};

const setModalLoading = (title: string) => {
  modalTitle.value = title;
  modalUrl.value = "";
  modalQrCode.value = "";
  modalError.value = "";
  modalFetching.value = true;
  showModal.value = true;
};

const setModalResult = async (url: string) => {
  modalUrl.value = url;
  const qrcode = await import("qrcode");
  modalQrCode.value = await qrcode.toDataURL(url, {
    width: 200,
    margin: 2,
    color: { dark: "#000", light: "#fff" },
  });
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
      await setModalResult(data.url);
    } else {
      modalError.value = data.message || "获取下载链接失败";
    }
  } catch {
    modalError.value = "获取下载链接失败";
  } finally {
    modalFetching.value = false;
  }
};

const closeModal = () => {
  showModal.value = false;
  modalTitle.value = "";
  modalUrl.value = "";
  modalQrCode.value = "";
};
const musicStore = useMusicStore();

const searchQuery = ref("");
const currentPage = computed(() =>
  Math.max(1, parseInt(route.query.page as string) || 1),
);
const searchKeyword = computed(() => (route.query.q as string) || "");
const searchType = computed(() => {
  const t = route.query.type as string;
  return t === "resource" ? "resource" : "music";
});
const isMusic = computed(() => searchType.value === "music");

// 筛选参数
const timeFilter = computed(() => (route.query.time as string) || "any");
const panFilter = computed(() => (route.query.pan as string) || "all");
const sortFilter = computed(() => (route.query.sort as string) || "default");
const exactFilter = computed(() => route.query.exact === "true");

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
    exactFilter.value
  );
});

// 更新筛选条件
const updateFilter = (key: string, value: string | boolean) => {
  const query: Record<string, string> = {
    type: searchType.value,
    q: searchKeyword.value,
    page: "1", // 筛选变更时重置到第一页
  };
  if (
    value !== "any" &&
    value !== "all" &&
    value !== "default" &&
    value !== false
  ) {
    query[key] = value.toString();
  }

  // 保持其他筛选条件（资源专属）
  if (!isMusic.value) {
    if (timeFilter.value !== "any" && key !== "time")
      query.time = timeFilter.value;
    if (panFilter.value !== "all" && key !== "pan") query.pan = panFilter.value;
    if (sortFilter.value !== "default" && key !== "sort")
      query.sort = sortFilter.value;
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
    }
    if (exactFilter.value) params.set("exact", "true");
    return `${base}?${params.toString()}`;
  },
  {
    key: () =>
      `search-${searchType.value}-${searchKeyword.value}-${currentPage.value}-${timeFilter.value}-${panFilter.value}-${sortFilter.value}-${exactFilter.value}`,
    server: true,
    lazy: true,
    watch: [
      searchKeyword,
      currentPage,
      searchType,
      timeFilter,
      panFilter,
      sortFilter,
      exactFilter,
    ],
  },
);

const results = computed(() => pageData.value?.data || []);
const total = computed(() => pageData.value?.total || 0);
const totalPages = computed(() => pageData.value?.totalPages || 0);
const tokens = computed(() => (pageData.value as any)?.tokens || []);

// 高亮分词关键词
const highlight = (text: string): string => {
  if (!text || tokens.value.length === 0) return text;
  // 按长度降序排列，优先匹配长词
  const sorted = [...tokens.value].sort((a, b) => b.length - a.length);
  let result = text;
  for (const token of sorted) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(escaped, "gi"),
      (match) =>
        `<mark class="bg-transparent text-primary-400">${match}</mark>`,
    );
  }
  return result;
};

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
    const retryAfter = (err?.data?.retryAfter as number | undefined) || 15;
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
      title: err?.statusMessage || err?.message || "参数错误",
      message: "搜索关键词最多 30 个字符，请精简后重试。",
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
  const label = isMusic.value ? "歌曲" : "资源";
  if (q && results.value.length > 0) {
    return `"${q}" - 第${currentPage.value}页 - 搜索${label} - 下歌吧`;
  }
  if (q) {
    return `${q} - 搜索${label} - 下歌吧`;
  }
  return `搜索${label} - 下歌吧`;
});

const pageDescription = computed(() => {
  const q = searchKeyword.value;
  const label = isMusic.value ? "歌曲" : "网盘资源";
  if (q && total.value > 0) {
    return `在下歌吧搜索"${q}"，共找到 ${total.value} 个相关${label}。`;
  }
  if (q) {
    return `在下歌吧搜索"${q}"的相关结果。`;
  }
  return "下歌吧搜索 - 免费下载高品质音乐与网盘资源。";
});

useHead({
  title: pageTitle,
  meta: [
    { name: "description", content: pageDescription },
    {
      name: "keywords",
      content: `${searchKeyword.value}, 音乐搜索, 下歌吧, MP3下载, FLAC下载, 网盘搜索, 网盘下载`,
    },
    { name: "robots", content: "index, follow" },
    { name: "theme-color", content: "#0f172a" },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: pageDescription },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "下歌吧" },
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

const switchType = (type: "music" | "resource") => {
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

const getPageNumbers = (): (number | "...")[] => {
  const pages: (number | "...")[] = [];
  const total = totalPages.value;
  const current = currentPage.value;
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
};

const goToDetail = (music: Music) => {
  musicStore.setCurrentMusic(music);
  router.push(`/music/${music.id}`);
};

const skeletonList = Array.from({ length: 4 });

const { submitPanCheck, getCheckStatus, stopPanCheck } = usePanCheck({
  enabled: !isMusic.value,
});

watch(
  [results],
  () => {
    if (import.meta.client) {
      stopPanCheck();
      if (!isMusic.value && results.value.length > 0) {
        const ids = (results.value as SourceItem[]).map((item) => item.id);
        submitPanCheck(ids);
      }
    }
  },
  { immediate: true },
);

const { success, error: showError } = useToast();
const { copy } = useClipboard();

const copyUrl = async (url: string) => {
  try {
    await copy(url);
    success("复制成功");
  } catch {
    showError("复制失败");
  }
};

const isMobile = useMediaQuery("(max-width: 768px)");
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-4 md:py-6 px-2">
    <div class="max-w-4xl mx-auto">
      <TopBar :search-query="searchQuery" @search="performSearch" />

      <!-- 搜索类型 tab -->
      <div class="flex items-center gap-2 mb-4">
        <button
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors"
          :class="
            isMusic
              ? 'bg-primary-500 text-white font-medium'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
          "
          @click="switchType('music')"
        >
          <MusicIcon class="w-4 h-4" />
          搜音乐
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors"
          :class="
            !isMusic
              ? 'bg-primary-500 text-white font-medium'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
          "
          @click="switchType('resource')"
        >
          <FolderOpen class="w-4 h-4" />
          搜资源Beta
        </button>
      </div>

      <main>
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
          <p class="text-sm text-gray-500">{{ errorInfo.message }}</p>
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
          <div class="h-3 bg-gray-700 rounded w-1/4 animate-pulse mb-2" />
          <article
            v-for="(_, i) in skeletonList"
            :key="i"
            class="card p-3 animate-pulse"
          >
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-gray-700 rounded-lg" />
              <div class="flex-1 space-y-1">
                <div class="h-3 bg-gray-700 rounded w-3/4" />
                <div class="h-2 bg-gray-700 rounded w-1/3" />
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="searchKeyword" class="space-y-2">
          <h2 v-if="results.length > 0" class="text-gray-500 text-sm mb-3">
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
                class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
                :class="
                  exactFilter
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                "
                @click="updateFilter('exact', !exactFilter)"
              >
                <Target class="w-3.5 h-3.5" />
                精准搜索
              </button>

              <button
                class="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-gray-800 disabled:hover:text-gray-400"
                @click="clearFilters"
                :disabled="!hasFilters"
              >
                <RotateCcwSquare class="w-3.5 h-3.5" />
                清除筛选
              </button>
            </div>

            <article
              v-for="music in results"
              :key="music.id"
              class="card p-3 cursor-pointer hover:border-primary-500/50 transition-colors"
              @click="goToDetail(music)"
              role="article"
            >
              <div class="flex items-center gap-3">
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
                    class="text-sm font-medium text-white truncate"
                    v-html="highlight(music.title)"
                  />
                  <p class="text-xs text-gray-500 truncate">
                    <span v-html="highlight(music.artist)" /><span
                      v-if="music.album"
                    >
                      - <span v-html="highlight(music.album)"
                    /></span>
                  </p>
                </div>
                <ArrowRight class="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
            </article>

            <template v-if="results.length === 0">
              <div class="text-center py-20">
                <div
                  class="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"
                  aria-hidden="true"
                >
                  <CircleSlash />
                </div>
                <p class="text-gray-500">
                  {{ "此搜索关键词暂无结果" }}
                </p>
              </div>
            </template>
          </template>

          <template v-else>
            <template v-if="searchKeyword">
              <div class="flex items-center gap-2 !my-3">
                <Filter class="w-4 h-4 text-primary-400" />
                <h2 class="text-gray-500 text-sm">筛选条件</h2>
              </div>

              <!-- 资源筛选条件 -->
              <div class="flex flex-wrap items-center gap-2 mb-4">
                <!-- 入库时间 -->
                <div class="flex-1 relative min-w-24">
                  <select
                    class="w-full appearance-none bg-gray-800 text-gray-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                    class="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </div>

                <!-- 网盘类型 -->
                <div class="flex-1 relative min-w-24">
                  <select
                    class="w-full appearance-none bg-gray-800 text-gray-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                    class="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </div>

                <!-- 排序 -->
                <div class="flex-1 relative min-w-24">
                  <select
                    class="w-full appearance-none bg-gray-800 text-gray-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                    class="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </div>

                <!-- 精准搜索 -->
                <button
                  class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
                  :class="
                    exactFilter
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  "
                  @click="updateFilter('exact', !exactFilter)"
                >
                  <Target class="w-3.5 h-3.5" />
                  精准搜索
                </button>

                <!-- 清除筛选 -->
                <button
                  class="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-gray-800 disabled:hover:text-gray-400"
                  @click="clearFilters"
                  :disabled="!hasFilters"
                >
                  <RotateCcwSquare class="w-3.5 h-3.5" />
                  清除筛选
                </button>
              </div>
            </template>

            <div v-if="currentPage === 1" class="flex items-center gap-2 !my-3">
              <Folder class="w-4 h-4 text-primary-400" />
              <h2 class="text-gray-500 text-sm">本地资源</h2>
            </div>
            <template v-if="results.length > 0">
              <LocalResourceItem
                v-for="item in results"
                :key="item.id"
                :item="item"
                :check-status="getCheckStatus(item.id)"
                :highlight-html="highlight(item.title)"
                :highlight-menu="highlight(item.menu)"
                @click-title="router.push(`/source/${item.id}`)"
                @open-tree="openTreeModal({ item, type: 'id' })"
                @open-modal="openModal({ item, type: 'id' })"
              />
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
                  {{ "本地搜索暂无结果" }}
                </p>
              </div>
            </template>

            <template v-if="currentPage === 1">
              <WebSearchResults
                :keyword="searchKeyword"
                :disabled="isMusic"
                :highlight-html="highlight"
                @open-tree-modal="
                  (item) => openTreeModal({ item, type: 'url' })
                "
                @open-modal="(item) => openModal({ item, type: 'url' })"
              />
            </template>
          </template>

          <div
            v-if="totalPages > 1"
            class="flex items-center justify-center gap-2 mt-8 flex-wrap"
            role="navigation"
            aria-label="分页"
          >
            <button
              class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)"
            >
              上一页
            </button>

            <template v-for="(pageNum, idx) in getPageNumbers()" :key="idx">
              <span v-if="pageNum === '...'" class="px-3 py-2 text-gray-500"
                >...</span
              >
              <button
                v-else
                class="px-4 py-2 rounded-lg transition-colors"
                :class="
                  pageNum === currentPage
                    ? 'bg-primary-500 text-white font-medium'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                "
                @click="goToPage(pageNum as number)"
                :aria-current="pageNum === currentPage ? 'page' : undefined"
              >
                {{ pageNum }}
              </button>
            </template>

            <button
              class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="currentPage >= totalPages"
              @click="goToPage(currentPage + 1)"
            >
              下一页
            </button>
          </div>
        </div>

        <div v-else class="text-center py-20">
          <div
            class="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"
            aria-hidden="true"
          >
            <CircleSlash />
          </div>
          <p class="text-gray-500">请输入搜索关键词</p>
        </div>
      </main>

      <Qrcode />

      <SiteFooter />

      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
            @click.self="closeModal"
          >
            <div
              class="flex flex-col max-h-[85vh] modal-content bg-dark-300 rounded-xl max-w-xl w-full border border-gray-700 shadow-2xl overflow-hidden"
            >
              <div
                class="flex items-center justify-between p-4 border-b border-gray-800"
              >
                <h3 class="text-white font-medium">获取下载链接</h3>
                <button
                  class="text-gray-400 hover:text-white transition-colors"
                  @click="closeModal"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
              <div class="p-4 h-full overflow-auto">
                <div v-if="modalFetching" class="text-center py-8">
                  <div
                    class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                  />
                  <p class="text-gray-400 text-sm">
                    正在获取资源链接...<br />请耐心等待，这可能需要几秒钟
                  </p>
                </div>
                <div v-else-if="modalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ modalError }}</p>
                </div>
                <div v-else-if="modalUrl" class="space-y-4">
                  <div class="flex flex-col items-center gap-4">
                    <template v-if="!isMobile">
                      <span
                        >可使用
                        <span class="text-primary-500"
                          >{{ getTypeName(getStorageType(modalUrl)) }}网盘</span
                        >
                        APP 扫码获取</span
                      >
                      <div v-if="modalQrCode" class="flex-shrink-0">
                        <img
                          :src="modalQrCode"
                          alt="下载链接二维码"
                          class="w-60 h-auto rounded-lg"
                        />
                      </div>
                      <div
                        v-else
                        class="w-28 h-28 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"
                      >
                        <QrCode class="w-10 h-10 text-gray-600" />
                      </div>
                    </template>
                    <p
                      class="w-full text-white font-medium text-center text-lg line-clamp-5"
                      :class="{ truncate: !isMobile }"
                    >
                      {{ modalTitle }}
                    </p>
                    <p class="text-center break-all">
                      资源地址：<a
                        :href="modalUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-primary-500"
                        >{{ modalUrl }}</a
                      >
                    </p>
                    <div class="w-full flex items-center justify-center gap-2">
                      <button
                        class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border h-9 px-4 py-2 flex-1 border-primary-600 bg-primary-800/10 hover:bg-primary-800/30 text-green-600 hover:text-white"
                        @click="copyUrl(modalUrl)"
                      >
                        <Clipboard class="w-4 h-4" />
                        复制链接
                      </button>
                      <a
                        :href="modalUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all h-9 px-4 py-2 flex-1 bg-primary-600 hover:bg-primary-700 text-white"
                      >
                        <ExternalLink class="w-4 h-4" />
                        打开链接
                      </a>
                    </div>
                    <p class="text-xs text-gray-400">
                      网盘链接有效期为30分钟，请及时转存，失效后可重新获取。<br />
                      文件内容请自行辨别，如发现违规请向网盘平台举报。本站仅供学习交流，无任何收费行为。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showTreeModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            @click.self="closeTreeModal"
          >
            <div
              class="modal-content bg-dark-300 rounded-xl max-w-lg w-full border border-gray-700 shadow-2xl"
            >
              <div
                class="flex items-center justify-between p-4 border-b border-gray-800"
              >
                <h3 class="text-white font-medium">
                  目录结构<span class="text-xs text-gray-400"
                    >（最多显示5层、100个文件）</span
                  >
                </h3>
                <button
                  class="text-gray-400 hover:text-white transition-colors"
                  @click="closeTreeModal"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
              <div class="p-4">
                <h4
                  v-if="treeModalTitle"
                  class="text-white text-sm font-medium truncate mb-3"
                >
                  {{ treeModalTitle }}
                </h4>
                <div v-if="treeModalLoading" class="text-center py-8">
                  <div
                    class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                  />
                  <p class="text-gray-400 text-sm">获取中...</p>
                </div>
                <div v-else-if="treeModalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ treeModalError }}</p>
                </div>
                <pre
                  v-else
                  class="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 overflow-auto max-h-[60vh] whitespace-pre font-mono"
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
