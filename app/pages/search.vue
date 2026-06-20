<script setup lang="ts">
import { CircleSlash, AlertTriangle, RotateCcw, Search } from "lucide-vue-next";
import TopBar from "~/components/TopBar.vue";
import type { Music } from "~/stores/music";
import { ArrowRight } from "lucide-vue-next";

interface PaginatedResponse {
  data: Music[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const route = useRoute();
const router = useRouter();
const musicStore = useMusicStore();

const searchQuery = ref("");
const currentPage = computed(() =>
  Math.max(1, parseInt(route.query.page as string) || 1),
);
const searchKeyword = computed(() => (route.query.q as string) || "");

const {
  data: pageData,
  pending: loading,
  error: fetchError,
  refresh: retryFetch,
  status,
} = await useFetch<PaginatedResponse>(
  () => {
    const q = searchKeyword.value;
    if (!q) return null;
    return `/api/music/search?q=${encodeURIComponent(q)}&page=${currentPage.value}&pageSize=20`;
  },
  {
    key: () => `search-${searchKeyword.value}-${currentPage.value}`,
    server: true,
    lazy: true,
    watch: [searchKeyword, currentPage],
    default: () => null,
  },
);

const results = computed(() => pageData.value?.data || []);
const total = computed(() => pageData.value?.total || 0);
const totalPages = computed(() => pageData.value?.totalPages || 0);

// 错误分类：rate-limit / server / network
interface ErrorInfo {
  type: "rate-limit" | "server" | "network";
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
  if (q && results.value.length > 0) {
    return `"${q}" - 第${currentPage.value}页 - 搜索结果 - 下歌吧`;
  }
  if (q) {
    return `${q} - 搜索 - 下歌吧`;
  }
  return "搜索 - 下歌吧";
});

const pageDescription = computed(() => {
  const q = searchKeyword.value;
  if (q && total.value > 0) {
    return `在下歌吧搜索"${q}"，共找到 ${total.value} 首相关歌曲，免费下载高品质MP3与FLAC无损音乐。`;
  }
  if (q) {
    return `在下歌吧搜索"${q}"的相关结果。`;
  }
  return "下歌吧搜索 - 免费下载高品质音乐。";
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
        `/search?q=${encodeURIComponent(searchKeyword.value)}&page=${currentPage.value}`,
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
  router.push(`/search?q=${encodeURIComponent(keyword)}`);
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  window.scrollTo({ top: 0 });
  router.push({
    path: "/search",
    query: {
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

const skeletonList = Array.from({ length: 8 });
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-4 md:px-6 px-2">
    <div class="max-w-4xl mx-auto">
      <TopBar :search-query="searchQuery" @search="performSearch" />

      <main>
        <!-- 错误提示 -->
        <div
          v-if="errorInfo && searchKeyword"
          class="card p-5 text-center mb-6"
          role="alert"
        >
          <div
            class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
            :class="
              errorInfo.type === 'rate-limit'
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

        <!-- 骨架屏 -->
        <div
          v-else-if="loading && searchKeyword"
          class="space-y-2"
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

        <div v-else-if="searchKeyword && results.length > 0" class="space-y-2">
          <h2 class="text-gray-500 text-sm mb-2">
            搜索"<span class="text-primary-400">{{ searchKeyword }}</span
            >"找到 {{ total }} 首歌曲
            <span v-if="totalPages > 1" class="ml-2"
              >（第 {{ currentPage }} / {{ totalPages }} 页）</span
            >
          </h2>

          <article
            v-for="music in results"
            :key="music.id"
            class="card p-3 cursor-pointer hover:border-primary-500/50 transition-colors"
            @click="goToDetail(music)"
            role="article"
          >
            <div class="flex items-center gap-3">
              <img
                :src="music.cover || '/img/cover.png'"
                :alt="music.title"
                class="w-12 h-12 rounded-lg object-cover"
                loading="lazy"
                decoding="async"
                @error="
                  ($event.target as HTMLImageElement).src = '/img/cover.png'
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

        <div v-else-if="searchKeyword" class="text-center py-20">
          <div
            class="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"
            aria-hidden="true"
          >
            <CircleSlash />
          </div>
          <p class="text-gray-500">暂无搜索结果：{{ searchKeyword }}</p>
          <p class="text-gray-600 text-sm mt-2">请尝试其他关键词</p>
        </div>

        <div v-else class="text-center py-20">
          <p class="text-gray-500">请输入搜索关键词</p>
        </div>
      </main>
    </div>
  </div>
</template>
