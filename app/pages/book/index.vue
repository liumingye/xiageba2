<script setup lang="ts">
import {
  BookOpen,
  Key,
  Eye,
  X,
  AlertTriangle,
  RotateCcw,
  Filter,
  RotateCcwSquare,
  HardDrive,
  Search,
} from "@lucide/vue";
import { useDebounceFn } from "@vueuse/core";

defineOptions({
  name: "BookIndexPage",
});

const route = useRoute();
const router = useRouter();

interface NovelBook {
  bookId: string;
  bookName: string;
  author: string;
  coverImage: string;
  category: string;
  bookStatus: number;
  cpName: string;
  tag: string;
}

const currentPage = computed(() =>
  Math.max(1, parseInt(route.query.page as string) || 1),
);
const searchKeyword = computed(() => (route.query.q as string) || "");
const isSearchMode = computed(() => !!searchKeyword.value);

// 筛选参数（仅列表模式使用）
const bookStatusFilter = computed(
  () => (route.query.book_status as string) || "-1",
);
const novelCategoryFilter = computed(
  () => (route.query.category as string) || "all",
);

// 筛选选项
const bookStatusOptions = [
  { value: "-1", label: "全部" },
  { value: "1", label: "已完结" },
  { value: "0", label: "连载中" },
];

const novelCategoryOptions = [
  { value: "all", label: "全部" },
  ...[
    "现代言情",
    "青春校园",
    "婚姻家庭",
    "古代言情",
    "历史故事",
    "都市情感",
    "恐怖推理",
    "乡村故事",
    "幻想故事",
    "真实故事",
    "见闻杂谈",
    "特殊职业",
    "复仇爽文",
    "玄幻",
    "奇幻",
    "武侠",
    "都市",
    "历史",
    "军事",
    "游戏",
    "竞技",
    "科幻",
    "悬疑",
    "同人",
    "其他",
    "青春",
    "幻想言情",
    "纯爱",
    "成功励志",
    "计算机",
    "经济管理",
    "科技",
    "历史传记",
    "两性情感",
    "亲子少儿",
    "社会科学",
    "生活",
    "文学艺术",
  ].map((v) => ({ value: v, label: v })),
];

const hasFilters = computed(() => {
  return bookStatusFilter.value !== "-1" || novelCategoryFilter.value !== "all";
});

const updateFilter = (key: string, value: string) => {
  const query: Record<string, string> = { page: "1" };
  if (value !== "-1" && value !== "all") {
    query[key] = value;
  }
  if (bookStatusFilter.value !== "-1" && key !== "book_status")
    query.book_status = bookStatusFilter.value;
  if (novelCategoryFilter.value !== "all" && key !== "category")
    query.category = novelCategoryFilter.value;
  router.push({ path: "/book", query });
};

const clearFilters = () => {
  router.push({ path: "/book", query: { page: "1" } });
};

// 搜索
const searchInput = ref("");

watch(
  searchKeyword,
  (val) => {
    searchInput.value = val;
  },
  { immediate: true },
);

const handleSearch = () => {
  const q = searchInput.value.trim();
  if (!q) {
    // 空搜索回到列表模式
    if (isSearchMode.value) {
      router.push({ path: "/book" });
    }
    return;
  }
  router.push({ path: "/book", query: { q } });
};

const clearSearch = () => {
  searchInput.value = "";
  router.push({ path: "/book" });
};

// 列表数据（列表模式）
const {
  data: novelData,
  pending: novelLoading,
  error: novelFetchError,
  refresh: novelRetryFetch,
} = await useFetch<{ books: NovelBook[]; hasMore: boolean }>(
  () => {
    if (isSearchMode.value) return "";
    const params = new URLSearchParams({
      page: (currentPage.value - 1).toString(),
      limit: "20",
    });
    if (bookStatusFilter.value !== "-1")
      params.set("book_status", bookStatusFilter.value);
    if (novelCategoryFilter.value !== "all")
      params.set("category", novelCategoryFilter.value);
    return `/api/novel/list?${params.toString()}`;
  },
  {
    key: () =>
      `novel-list-${currentPage.value}-${bookStatusFilter.value}-${novelCategoryFilter.value}`,
    server: true,
    lazy: true,
    watch: [currentPage, bookStatusFilter, novelCategoryFilter, isSearchMode],
  },
);

// 搜索数据（搜索模式）
const {
  data: searchData,
  pending: searchLoading,
  error: searchFetchError,
  refresh: searchRetryFetch,
} = await useFetch<{ books: NovelBook[]; isEnd: boolean }>(
  () => {
    if (!isSearchMode.value) return "";
    return "/api/novel/search";
  },
  {
    method: "POST",
    body: () => ({ query: searchKeyword.value }),
    key: () => `novel-search-${searchKeyword.value}`,
    server: true,
    lazy: true,
    watch: [searchKeyword],
  },
);

// 统一的书本列表
const books = computed<NovelBook[]>(() => {
  if (isSearchMode.value) return searchData.value?.books || [];
  return novelData.value?.books || [];
});

const isLoading = computed(() =>
  isSearchMode.value ? searchLoading.value : novelLoading.value,
);

const hasMore = computed(() => {
  if (isSearchMode.value) return !searchData.value?.isEnd;
  return novelData.value?.hasMore === true;
});

const totalPages = computed(() => {
  if (books.value.length === 0) return 0;
  return hasMore.value ? currentPage.value + 1 : currentPage.value;
});

// 错误处理
interface ErrorInfo {
  type: "rate-limit" | "server" | "network" | "param";
  title: string;
  message: string;
  canRetry: boolean;
}

const errorInfo = computed<ErrorInfo | null>(() => {
  const err: any = isSearchMode.value
    ? searchFetchError.value
    : novelFetchError.value;
  if (!err) return null;
  const code = err?.statusCode || err?.status || err?.response?.status || 0;
  if (code === 429) {
    const retryAfter = (err?.data?.retryAfter as number | undefined) || 15;
    return {
      type: "rate-limit",
      title: "请求过于频繁",
      message: `请在 ${retryAfter} 秒后再次尝试。`,
      canRetry: false,
    };
  }
  if (code === 400) {
    return {
      type: "param",
      title: "参数错误",
      message: err?.data?.message || err?.message || "请检查输入后重试。",
      canRetry: false,
    };
  }
  if (code >= 500 && code < 600) {
    return {
      type: "server",
      title: "服务器开小差了",
      message: "我们正在排查问题，您可以稍后重试。",
      canRetry: true,
    };
  }
  return {
    type: "network",
    title: "网络连接异常",
    message: "请检查网络后重试。",
    canRetry: true,
  };
});

const handleRetry = () => {
  if (isSearchMode.value) searchRetryFetch();
  else novelRetryFetch();
};

const debounceRefresh = useDebounceFn(handleRetry, 200);

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  window.scrollTo({ top: 0 });
  router.push({
    path: "/book",
    query: { ...route.query, page: page.toString() },
  });
};

// 封面加载错误状态
const novelCoverError = reactive<Record<string, boolean>>({});

// 试读 / 口令弹窗
const showSampleReadModal = ref(false);
const sampleReadBook = ref<NovelBook | null>(null);
const showCodeModal = ref(false);
const codeModalBook = ref<NovelBook | null>(null);

const openSampleRead = (book: NovelBook) => {
  sampleReadBook.value = book;
  showSampleReadModal.value = true;
};

const openGetCode = (book: NovelBook) => {
  codeModalBook.value = book;
  showCodeModal.value = true;
};

// 试读内容里点击"获取口令"时，先关闭试读再打开口令弹窗
const onSampleReadGetCode = (book: NovelBook) => {
  showSampleReadModal.value = false;
  codeModalBook.value = book;
  showCodeModal.value = true;
};

const getTag = (tags: string) => {
  return [
    ...new Set(
      tags
        .split(",")
        .map((v) => {
          const tagList = v.split("_");
          if (tagList.length >= 2) {
            return tagList[1];
          }
          return tagList[0];
        })
        .filter((v) => v != "*"),
    ),
  ].slice(0, 3);
};

useSeoMeta({
  title: () => {
    if (isSearchMode.value && books.value.length > 0) {
      return `"${searchKeyword.value}" - 搜小说 - 全盘搜`;
    }
    if (isSearchMode.value) return `"${searchKeyword.value}" - 搜小说 - 全盘搜`;
    return books.value.length > 0
      ? `搜小说 - 第${currentPage.value}页 - 全盘搜`
      : "搜小说 - 全盘搜";
  },
  description:
    "全盘搜小说搜索 - 百度网盘小说免费在线阅读，支持试读和获取口令。",
});
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar :show-search="false" :show-theme-switcher="true" />

    <div class="max-w-4xl mx-auto px-2">
      <!-- 搜索栏 -->
      <div class="flex items-center gap-2 mb-4">
        <div class="flex items-center relative flex-1">
          <input
            v-model="searchInput"
            type="text"
            placeholder="搜你想看的小说"
            class="input-search pl-3 pr-10 bg-color-100"
            @keydown.enter="handleSearch"
          />
          <button
            v-if="searchInput"
            class="absolute right-2 py-0.5 px-0.5 opacity-60 hover:opacity-100 transition-all bg-color-400 rounded-full"
            @click="clearSearch"
            aria-label="清除"
            type="button"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <button
          class="px-3 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="handleSearch"
          type="button"
        >
          <Search class="w-5 h-5" />
        </button>
      </div>

      <main>
        <!-- 错误提示 -->
        <div v-if="errorInfo" class="card p-5 text-center mb-6" role="alert">
          <div
            class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 text-white"
            :class="
              errorInfo.type === 'rate-limit' || errorInfo.type === 'param'
                ? 'bg-yellow-500'
                : 'bg-red-500'
            "
            aria-hidden="true"
          >
            <AlertTriangle class="w-7 h-7" />
          </div>
          <h3 class="text-lg font-medium mb-1">
            {{ errorInfo.title }}
          </h3>
          <p class="text-sm text-gray-500">{{ errorInfo.message }}</p>
          <button
            v-if="errorInfo.canRetry"
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="handleRetry"
          >
            <RotateCcw class="w-4 h-4" />
            重新加载
          </button>
        </div>

        <!-- 加载骨架屏 -->
        <div
          v-else-if="isLoading"
          class="space-y-2"
          aria-busy="true"
          aria-label="正在加载小说列表"
        >
          <!-- 筛选骨架（仅列表模式） -->
          <template v-if="!isSearchMode">
            <div class="flex items-center gap-2 !my-3">
              <Filter class="w-4 h-4 text-primary-400" />
              <h2 class="text-zinc-500 text-sm">筛选条件</h2>
            </div>
            <div class="flex flex-wrap gap-2 mb-4 h-10">
              <div
                class="flex-1 min-w-24 bg-color-300 rounded-lg animate-pulse"
              />
              <div
                class="flex-1 min-w-24 bg-color-300 rounded-lg animate-pulse"
              />
              <div class="bg-color-300 w-24 rounded-lg animate-pulse" />
            </div>
          </template>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div v-for="(_, i) in 8" :key="i" class="card p-3 animate-pulse">
              <div class="aspect-[3/4] bg-color-300 rounded-lg mb-2" />
              <div class="h-3 bg-color-300 rounded w-full mb-1" />
              <div class="h-2 bg-color-300 rounded w-2/3 mb-1" />
              <div class="h-2 bg-color-300 rounded w-1/2" />
            </div>
          </div>
        </div>

        <!-- 小说内容 -->
        <div v-else class="space-y-2">
          <!-- 筛选条件（仅列表模式） -->
          <template v-if="!isSearchMode">
            <div class="flex items-center gap-2 !my-3">
              <Filter class="w-4 h-4 text-primary-400" />
              <h2 class="text-color-500 text-sm">筛选条件</h2>
            </div>
            <div class="flex flex-wrap items-center gap-2 mb-4">
              <div class="flex-1 relative min-w-24">
                <select
                  class="select"
                  :value="bookStatusFilter"
                  @change="
                    updateFilter(
                      'book_status',
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option
                    v-for="opt in bookStatusOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
                <BookOpen
                  class="w-3 h-3 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              </div>

              <div class="flex-1 relative min-w-24">
                <select
                  class="select"
                  :value="novelCategoryFilter"
                  @change="
                    updateFilter(
                      'category',
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option
                    v-for="opt in novelCategoryOptions"
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

              <button
                class="flex items-center gap-1.5 px-3 py-2 bg-color-100 text-color-300 enabled:hover:bg-color-300 rounded-lg text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                @click="clearFilters"
                :disabled="!hasFilters"
              >
                <RotateCcwSquare class="w-3.5 h-3.5" />
                清除筛选
              </button>
            </div>
          </template>

          <h2 v-if="books.length > 0" class="text-color-500 text-sm mb-3">
            <template v-if="isSearchMode">
              搜索"<span class="text-primary-400">{{ searchKeyword }}</span
              >"找到 {{ books.length }} 本小说
            </template>
            <template v-else>
              共找到 {{ books.length }} 本小说
              <span v-if="totalPages > 1" class="ml-2"
                >（第 {{ currentPage }} 页）</span
              >
            </template>
          </h2>

          <!-- 小说列表网格 -->
          <template v-if="books.length > 0">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <NuxtLink
                :to="`/book/${encodeURIComponent(book.bookId)}`"
                v-for="book in books"
                :key="book.bookId"
                class="card p-3 hover:border-primary-500/50 transition-colors flex flex-col cursor-pointer group"
              >
                <!-- 封面 -->
                <div
                  class="relative aspect-[3/4] mb-2 overflow-hidden rounded-lg flex-shrink-0"
                >
                  <img
                    v-if="!novelCoverError[book.bookId]"
                    :src="book.coverImage"
                    :alt="book.bookName"
                    class="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    @error="novelCoverError[book.bookId] = true"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center"
                  >
                    <BookOpen class="w-10 h-10 text-zinc-600" />
                  </div>
                  <!-- 完结/连载标签 -->
                  <div
                    class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--white)]"
                    :class="
                      book.bookStatus === 1 ? 'bg-green-600' : 'bg-blue-600'
                    "
                  >
                    {{ book.bookStatus === 1 ? "已完结" : "连载中" }}
                  </div>
                </div>

                <!-- 小说名 -->
                <h3
                  class="text-sm font-medium truncate mb-0.5"
                  :title="book.bookName"
                >
                  {{ book.bookName }}
                </h3>

                <!-- 作者 -->
                <p
                  class="text-xs text-zinc-500 truncate mb-1"
                  :title="book.author"
                >
                  {{ book.author
                  }}<template v-if="book.cpName"> · {{ book.cpName }}</template>
                </p>

                <!-- 标签 -->
                <div class="flex flex-wrap gap-1 mb-2 min-h-[16px]">
                  <template v-if="book.tag">
                    <span
                      v-for="(tag, idx) in getTag(book.tag)"
                      :key="idx"
                      class="text-[10px] px-1.5 py-0.5 bg-primary-500/10 text-primary-400 rounded truncate max-w-full"
                      :title="tag"
                    >
                      {{ tag }}
                    </span>
                  </template>
                </div>

                <!-- 操作按钮 -->
                <div class="flex gap-2 mt-auto pt-2">
                  <button
                    class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-color-300 hover:bg-color-400 text-color-300 rounded-md transition-colors"
                    @click.prevent="openSampleRead(book)"
                  >
                    <Eye class="w-3 h-3" />
                    试读
                  </button>
                  <button
                    class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
                    @click.prevent="openGetCode(book)"
                  >
                    <Key class="w-3 h-3" />
                    口令
                  </button>
                </div>
              </NuxtLink>
            </div>
          </template>

          <template v-else>
            <div class="text-center py-20">
              <div
                class="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4"
                aria-hidden="true"
              >
                <BookOpen class="w-8 h-8 text-zinc-600" />
              </div>
              <p class="text-zinc-500">
                {{
                  isSearchMode
                    ? "服务器当前繁忙或未找到相关小说"
                    : "暂无小说，试试其他筛选条件"
                }}
              </p>
              <button
                class="mt-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                @click="debounceRefresh()"
              >
                重试
              </button>
            </div>
          </template>

          <!-- 分页 -->
          <Pagination
            :current-page="currentPage"
            :total-pages="totalPages"
            @change="goToPage"
          />
        </div>
      </main>

      <Qrcode />
      <SiteFooter />
    </div>

    <!-- 试读弹窗 -->
    <SampleReadModal
      v-model="showSampleReadModal"
      :book="sampleReadBook"
      @get-code="onSampleReadGetCode"
    />

    <!-- 口令弹窗 -->
    <GetCodeModal v-model="showCodeModal" :book="codeModalBook" />
  </div>
</template>

<style scoped>
.select {
  @apply w-full appearance-none bg-color-100 text-color-300 hover:bg-color-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500 border border-color-300 hover:border-primary-500;
}
</style>
