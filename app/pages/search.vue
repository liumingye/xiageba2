<script setup lang="ts">
import {
  CircleSlash,
  AlertTriangle,
  RotateCcw,
  Search,
  Music as MusicIcon,
  FolderOpen,
  ExternalLink,
  ArrowRight,
  Download,
  QrCode,
  Calendar,
  X,
  Globe,
  Loader2,
  Folder,
} from "@lucide/vue";
import { getTypeName, copyToClipboard } from "~/utils/index";

interface WebSearchResult {
  title: string;
  url: string;
  source: string;
  image?: string;
  type: string;
}

interface PaginatedResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SourceItem {
  id: string;
  title: string;
  type: string;
  menu: string;
  description: string;
  createdAt: string;
}

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const showModal = ref(false);
// const modalSource = ref<SourceItem | null>(null);
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
    color: { dark: "#ffffff", light: "#1e293b" },
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
  // modalSource.value = item;
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
  // modalSource.value = null;
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

const {
  data: pageData,
  pending: loading,
  error: fetchError,
  refresh: retryFetch,
  status,
} = await useFetch<PaginatedResponse>(
  () => {
    const base = isMusic.value ? "/api/music/search" : "/api/source/search";
    return `${base}?q=${encodeURIComponent(searchKeyword.value)}&page=${currentPage.value}&pageSize=10`;
  },
  {
    key: () =>
      `search-${searchType.value}-${searchKeyword.value}-${currentPage.value}`,
    server: true,
    lazy: true,
    watch: [searchKeyword, currentPage, searchType],
  },
);

const results = computed(() => pageData.value?.data || []);
const total = computed(() => pageData.value?.total || 0);
const totalPages = computed(() => pageData.value?.totalPages || 0);

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
    const retryAfter =
      (err?.data?.data?.retryAfter as number | undefined) || 15;
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
      content: `${searchKeyword.value}, 音乐搜索, 下歌吧, MP3下载, FLAC下载`,
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
  router.push(
    `/search?type=${searchType.value}&q=${encodeURIComponent(keyword)}`,
  );
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
    query: {
      type: searchType.value,
      q: searchKeyword.value,
      page: page.toString(),
    },
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

const webSearchResults = ref<WebSearchResult[]>([]);
const webSearching = ref(true);
const webSearchError = ref("");
let webSearchSource: EventSource | null = null;

const startWebSearch = () => {
  if (webSearchSource) {
    webSearchSource.close();
    webSearchSource = null;
  }
  webSearchResults.value = [];
  webSearchError.value = "";

  if (isMusic.value || !searchKeyword.value.trim()) {
    webSearching.value = false;
    return;
  }

  if (typeof EventSource === "undefined") return;

  webSearching.value = true;
  const es = new EventSource(
    `/api/other/web_search?title=${encodeURIComponent(searchKeyword.value.trim())}`,
  );
  webSearchSource = es;

  es.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "result" && msg.data) {
        webSearchResults.value.push(msg.data);
      } else if (msg.type === "done") {
        webSearching.value = false;
        es.close();
        webSearchSource = null;
      } else if (msg.type === "error") {
        webSearchError.value = msg.message || "全网搜失败";
        webSearching.value = false;
        es.close();
        webSearchSource = null;
      }
    } catch {
      // 忽略解析失败的推送
    }
  };

  es.onerror = () => {
    webSearching.value = false;
    es.close();
    webSearchSource = null;
  };
};

onMounted(() => {
  if (!isMusic.value && searchKeyword.value) {
    startWebSearch();
  }
});

watch([searchKeyword, searchType], () => {
  if (import.meta.client && !isMusic.value) {
    startWebSearch();
  }
});

const { success, error: showError } = useToast();

const copyUrl = (url: string) => {
  copyToClipboard(url);
  success("复制成功");
};
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-4 md:px-6 px-2">
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
          搜资源
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
                  <h3 class="text-sm font-medium text-white truncate">
                    {{ music.title }}
                  </h3>
                  <p class="text-xs text-gray-500 truncate">
                    {{ music.artist
                    }}<span v-if="music.album"> - {{ music.album }}</span>
                  </p>
                </div>
                <ArrowRight class="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
            </article>
          </template>

          <template v-else>
            <template v-if="results.length > 0">
              <div
                v-if="currentPage === 1"
                class="flex items-center gap-2 !my-3"
              >
                <Folder class="w-4 h-4 text-primary-400" />
                <h2 class="text-gray-500 text-sm">本地资源</h2>
              </div>

              <article
                v-for="item in results as SourceItem[]"
                :key="item.id"
                class="card p-3 hover:border-primary-500/50 transition-colors"
                role="article"
              >
                <div class="flex flex-col">
                  <div
                    class="flex-1 min-w-0 flex justify-between gap-2 md:flex-row flex-col mb-2"
                  >
                    <h3
                      class="text-white truncate hover:text-primary-400 cursor-pointer"
                      @click="router.push(`/source/${item.id}`)"
                    >
                      {{ item.title }}
                    </h3>
                    <div
                      class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
                    >
                      <img
                        v-if="item.type !== 'other'"
                        :src="`/img/pan/${item.type}.png`"
                        class="w-4 h-4 mr-1"
                      />
                      {{ getTypeName(item.type) }}
                    </div>
                  </div>
                  <template v-if="item.menu">
                    <div class="text-sm mb-2 text-gray-300 font-bold">
                      文件内容:
                    </div>
                    <pre
                      class="bg-gray-700 p-2 rounded-sm text-sm border border-gray-600 max-h-36 overflow-auto text-gray-300"
                      >{{ item.menu }}</pre
                    >
                  </template>
                </div>
                <div
                  class="flex justify-between items-center gap-2 border-t border-gray-700 mt-3 pt-3"
                >
                  <span class="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar class="w-3 h-3" />
                    {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
                  </span>
                  <div class="flex items-center gap-2">
                    <button
                      v-if="
                        !item.menu &&
                        ['quark', 'baidu', 'uc'].includes(item.type)
                      "
                      class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
                      @click.stop="openTreeModal({ item, type: 'id' })"
                    >
                      <Folder class="w-3 h-3" />
                      目录
                    </button>
                    <button
                      class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
                      @click.stop="openModal({ item, type: 'id' })"
                    >
                      <Download class="w-3 h-3" />
                      获取链接
                    </button>
                  </div>
                </div>
              </article>
            </template>

            <section v-if="currentPage === 1" class="mt-8">
              <div
                v-if="webSearchResults.length !== 0 || webSearching"
                class="flex items-center gap-2 mb-3"
              >
                <Globe class="w-4 h-4 text-primary-400" />
                <h2 class="text-gray-500 text-sm">全网搜</h2>
              </div>

              <div
                v-if="webSearching && webSearchResults.length === 0"
                class="card p-6 text-center"
              >
                <Loader2
                  class="w-6 h-6 text-primary-400 animate-spin mx-auto mb-2"
                />
                <p class="text-gray-400 text-sm">正在全网搜索中...</p>
              </div>

              <div
                v-else-if="webSearchError && webSearchResults.length === 0"
                class="card p-5 text-center"
              >
                <p class="text-red-400 text-sm">{{ webSearchError }}</p>
              </div>

              <div v-if="webSearchResults.length > 0" class="space-y-2">
                <article
                  v-for="(item, idx) in webSearchResults"
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
                      class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center"
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
                        class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
                        @click.stop="openTreeModal({ item, type: 'url' })"
                      >
                        <Folder class="w-3 h-3" />
                        目录
                      </button>
                      <button
                        class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
                        @click.stop="openModal({ item, type: 'url' })"
                      >
                        <Download class="w-3 h-3" />
                        获取链接
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </template>

          <div
            v-if="
              isMusic
                ? !results.length
                : !webSearching && !webSearchResults.length && !results.length
            "
            class="text-center py-20"
          >
            <div
              class="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <CircleSlash />
            </div>
            <p class="text-gray-500">
              {{ isMusic ? "本地搜索暂无结果" : "全网搜索暂无结果" }}
            </p>
          </div>

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
        <Transition name="fade">
          <div
            v-if="showModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            @click.self="closeModal"
          >
            <div
              class="bg-dark-300 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl"
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
              <div class="p-4">
                <h4
                  v-if="modalTitle"
                  class="text-white text-sm font-medium truncate mb-3"
                >
                  {{ modalTitle }}
                </h4>
                <div v-if="modalFetching" class="text-center py-8">
                  <div
                    class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                  />
                  <p class="text-gray-400 text-sm">获取中...</p>
                </div>
                <div v-else-if="modalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ modalError }}</p>
                </div>
                <div v-else-if="modalUrl" class="space-y-4">
                  <div class="bg-gray-800 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs text-gray-500">下载链接</span>
                      <button
                        class="text-xs text-primary-400 hover:text-primary-300"
                        @click="copyUrl(modalUrl)"
                      >
                        复制链接
                      </button>
                    </div>
                    <p class="text-sm text-gray-300 break-all font-mono">
                      {{ modalUrl }}
                    </p>
                  </div>
                  <div class="flex flex-col items-center gap-4">
                    <div v-if="modalQrCode" class="flex-shrink-0">
                      <img
                        :src="modalQrCode"
                        alt="下载链接二维码"
                        class="w-28 h-28 rounded-lg"
                      />
                    </div>
                    <div
                      v-else
                      class="w-28 h-28 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"
                    >
                      <QrCode class="w-10 h-10 text-gray-600" />
                    </div>
                    <a
                      :href="modalUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm"
                    >
                      <ExternalLink class="w-4 h-4" />
                      打开网盘下载
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <Teleport to="body">
        <Transition name="fade">
          <div
            v-if="showTreeModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            @click.self="closeTreeModal"
          >
            <div
              class="bg-dark-300 rounded-xl max-w-lg w-full border border-gray-700 shadow-2xl"
            >
              <div
                class="flex items-center justify-between p-4 border-b border-gray-800"
              >
                <h3 class="text-white font-medium">目录结构</h3>
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
