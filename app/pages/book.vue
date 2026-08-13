<script setup lang="ts">
import {
  BookOpen,
  Key,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Clipboard,
  AlertTriangle,
  RotateCcw,
  Filter,
  RotateCcwSquare,
  HardDrive,
  Search,
} from "@lucide/vue";
import { useClipboard, useDebounceFn } from "@vueuse/core";

defineOptions({
  name: "BookPage",
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
const MAX_KEYWORD_LENGTH = 30;

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

// 封面加载错误状态
const novelCoverError = reactive<Record<string, boolean>>({});

// 试读弹窗
const showSampleReadModal = ref(false);
const sampleReadTitle = ref("");
const sampleReadChapters = ref<any[]>([]);
const sampleReadCurrentIndex = ref(0);
const sampleReadLoading = ref(false);
const sampleReadError = ref("");

const openSampleRead = async (book: NovelBook) => {
  sampleReadTitle.value = book.bookName;
  sampleReadChapters.value = [];
  sampleReadCurrentIndex.value = 0;
  sampleReadError.value = "";
  sampleReadLoading.value = true;
  showSampleReadModal.value = true;

  try {
    const res = await fetch("/api/novel/sample-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: book.bookId }),
    });
    const data = await res.json();
    if (res.ok && data?.chapters) {
      sampleReadChapters.value = data.chapters;
    } else {
      sampleReadError.value = data.message || data.error || "获取试读内容失败";
    }
  } catch {
    sampleReadError.value = "获取试读内容失败";
  } finally {
    sampleReadLoading.value = false;
  }
};

const closeSampleRead = () => {
  showSampleReadModal.value = false;
  sampleReadTitle.value = "";
  sampleReadChapters.value = [];
  sampleReadCurrentIndex.value = 0;
  sampleReadError.value = "";
};

const sampleReadContentRef = ref<HTMLDivElement>();

const sampleReadPrevChapter = () => {
  if (sampleReadCurrentIndex.value > 0) sampleReadCurrentIndex.value--;
  nextTick(() => {
    if (sampleReadContentRef.value) {
      sampleReadContentRef.value.scrollTo({ top: 0 });
    }
  });
};

const sampleReadNextChapter = () => {
  if (sampleReadCurrentIndex.value < sampleReadChapters.value.length - 1)
    sampleReadCurrentIndex.value++;
  nextTick(() => {
    if (sampleReadContentRef.value) {
      sampleReadContentRef.value.scrollTo({ top: 0 });
    }
  });
};

// 口令弹窗
const showCodeModal = ref(false);
const codeModalTitle = ref("");
const codeModalPcode = ref("");
const codeModalMsg = ref("");
const codeModalLoading = ref(false);
const codeModalError = ref("");

const openGetCode = async (book: NovelBook) => {
  codeModalTitle.value = book.bookName;
  codeModalPcode.value = "";
  codeModalMsg.value = "";
  codeModalError.value = "";
  codeModalLoading.value = true;
  showCodeModal.value = true;

  try {
    const res = await fetch("/api/novel/get-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_id: book.bookId,
        content_title: book.bookName,
        content_author: book.author,
      }),
    });
    const data = await res.json();
    if (res.ok && data?.pcode) {
      codeModalPcode.value = data.pcode;
      codeModalMsg.value = data.msg || "";
      copy(codeModalPcode.value);
    } else {
      codeModalError.value = data.message || data.error || "获取口令失败";
    }
  } catch {
    codeModalError.value = "获取口令失败";
  } finally {
    codeModalLoading.value = false;
  }
};

const closeCodeModal = () => {
  showCodeModal.value = false;
  codeModalTitle.value = "";
  codeModalPcode.value = "";
  codeModalMsg.value = "";
  codeModalError.value = "";
};

const { success } = useToast();
const { copy } = useClipboard();

const getTag = (tags: string) => {
  return tags
    .split(",")
    .map((v) => {
      const tagList = v.split("_");
      if (tagList.length >= 2) {
        return tagList[1];
      }
      // 返回最后一个标签
      return tagList[0];
    })
    .filter((v) => v != "*")
    .slice(0, 3);
};

useHead({
  title: () => {
    if (isSearchMode.value && books.value.length > 0) {
      return `"${searchKeyword.value}" - 搜小说 - 下歌吧`;
    }
    if (isSearchMode.value) return `${searchKeyword.value} - 搜小说 - 下歌吧`;
    return books.value.length > 0
      ? `第${currentPage.value}页 - 搜小说 - 下歌吧`
      : "搜小说 - 下歌吧";
  },
  meta: [
    {
      name: "description",
      content:
        "下歌吧小说搜索 - 百度网盘小说免费在线阅读，支持试读和获取口令。",
    },
    { name: "robots", content: "index, follow" },
    { name: "theme-color", content: "#0f172a" },
  ],
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
            :maxlength="MAX_KEYWORD_LENGTH"
            type="text"
            placeholder="搜你想看的小说"
            class="input-search pl-3 pr-10"
            @keydown.enter="handleSearch"
          />
          <button
            v-if="searchInput"
            class="absolute right-2 py-0.5 px-0.5 text-zinc-500 hover:text-white transition-colors bg-zinc-700 rounded-full"
            @click="clearSearch"
            aria-label="清除"
            type="button"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <button
          class="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
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
                class="flex-1 min-w-24 bg-zinc-800 rounded-lg animate-pulse"
              />
              <div
                class="flex-1 min-w-24 bg-zinc-800 rounded-lg animate-pulse"
              />
              <div class="bg-zinc-800 w-24 rounded-lg animate-pulse" />
            </div>
          </template>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div v-for="(_, i) in 8" :key="i" class="card p-3 animate-pulse">
              <div class="aspect-[3/4] bg-zinc-700 rounded-lg mb-2" />
              <div class="h-3 bg-zinc-700 rounded w-full mb-1" />
              <div class="h-2 bg-zinc-700 rounded w-2/3 mb-1" />
              <div class="h-2 bg-zinc-700 rounded w-1/2" />
            </div>
          </div>
        </div>

        <!-- 小说内容 -->
        <div v-else class="space-y-2">
          <!-- 筛选条件（仅列表模式） -->
          <template v-if="!isSearchMode">
            <div class="flex items-center gap-2 !my-3">
              <Filter class="w-4 h-4 text-primary-400" />
              <h2 class="text-zinc-500 text-sm">筛选条件</h2>
            </div>
            <div class="flex flex-wrap items-center gap-2 mb-4">
              <div class="flex-1 relative min-w-24">
                <select
                  class="w-full appearance-none bg-zinc-900 text-zinc-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  class="w-full appearance-none bg-zinc-900 text-zinc-300 px-3 py-2 pr-6 rounded-lg text-sm cursor-pointer hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                class="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 text-zinc-400 enabled:hover:bg-zinc-700 rounded-lg text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                @click="clearFilters"
                :disabled="!hasFilters"
              >
                <RotateCcwSquare class="w-3.5 h-3.5" />
                清除筛选
              </button>
            </div>
          </template>

          <h2 v-if="books.length > 0" class="text-zinc-500 text-sm mb-3">
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
              <div
                v-for="book in books"
                :key="book.bookId"
                class="card p-3 hover:border-primary-500/50 transition-colors flex flex-col"
              >
                <!-- 封面 -->
                <div
                  class="relative aspect-[3/4] mb-2 overflow-hidden rounded-lg bg-zinc-800 flex-shrink-0"
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
                    class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    :class="
                      book.bookStatus === 1
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 text-white'
                    "
                  >
                    {{ book.bookStatus === 1 ? "已完结" : "连载中" }}
                  </div>
                </div>

                <!-- 小说名 -->
                <h3
                  class="text-sm font-medium text-white truncate mb-0.5"
                  :title="book.bookName"
                >
                  {{ book.bookName }}
                </h3>

                <!-- 作者 -->
                <p
                  class="text-xs text-zinc-500 truncate mb-1"
                  :title="book.author"
                >
                  {{ book.author }}
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
                    class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                    @click="openSampleRead(book)"
                  >
                    <Eye class="w-3 h-3" />
                    试读
                  </button>
                  <button
                    class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
                    @click="openGetCode(book)"
                  >
                    <Key class="w-3 h-3" />
                    口令
                  </button>
                </div>
              </div>
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
          <div
            v-if="totalPages > 1"
            class="flex items-center justify-center gap-2 mt-8 flex-wrap"
            role="navigation"
            aria-label="分页"
          >
            <button
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)"
            >
              上一页
            </button>

            <button
              v-for="(pageNum, idx) in getPageNumbers()"
              :key="idx"
              class="px-4 py-2 rounded-lg transition-colors"
              :class="
                pageNum === currentPage
                  ? 'bg-primary-500 text-white font-medium'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              "
              :disabled="pageNum === '...'"
              @click="pageNum !== '...' && goToPage(pageNum as number)"
              :aria-current="pageNum === currentPage ? 'page' : undefined"
            >
              {{ pageNum }}
            </button>

            <button
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!hasMore"
              @click="goToPage(currentPage + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </main>

      <Qrcode />
      <SiteFooter />
    </div>

    <!-- 试读弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showSampleReadModal"
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          @click.self="closeSampleRead"
        >
          <div
            class="flex flex-col max-h-[90vh] modal-content bg-dark-300 rounded-xl max-w-2xl w-full border border-zinc-700 shadow-2xl overflow-hidden"
          >
            <div
              class="flex items-center justify-between p-4 border-b border-zinc-800"
            >
              <h3 class="text-white font-medium truncate flex-1 mr-2">
                {{ sampleReadTitle }} - 试读
              </h3>
              <button
                class="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                @click="closeSampleRead"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            <!-- 章节导航 -->
            <div
              v-if="sampleReadChapters.length > 0"
              class="flex items-center justify-between gap-2 p-3 border-b border-zinc-800 bg-zinc-900/50"
            >
              <button
                class="flex items-center shrink-0 gap-1 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :class="
                  sampleReadCurrentIndex > 0
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    : 'bg-zinc-800/50 text-zinc-500'
                "
                :disabled="sampleReadCurrentIndex === 0"
                @click="sampleReadPrevChapter"
              >
                <ChevronLeft class="w-4 h-4" />
                上一章
              </button>
              <span class="text-sm text-zinc-400 truncate max-w-[50%]">
                {{ sampleReadChapters[sampleReadCurrentIndex]?.chapterTitle }}
                <span class="text-zinc-600 ml-1"
                  >({{ sampleReadCurrentIndex + 1 }}/{{
                    sampleReadChapters.length
                  }})</span
                >
              </span>
              <button
                class="flex items-center shrink-0 gap-1 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :class="
                  sampleReadCurrentIndex < sampleReadChapters.length - 1
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    : 'bg-zinc-800/50 text-zinc-500'
                "
                :disabled="
                  sampleReadCurrentIndex >= sampleReadChapters.length - 1
                "
                @click="sampleReadNextChapter"
              >
                下一章
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>

            <div ref="sampleReadContentRef" class="p-4 flex-1 overflow-auto">
              <div v-if="sampleReadLoading" class="text-center py-12">
                <div
                  class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                />
                <p class="text-zinc-400 text-sm">正在加载试读内容...</p>
              </div>
              <div v-else-if="sampleReadError" class="text-center py-12">
                <p class="text-red-400 text-sm">{{ sampleReadError }}</p>
              </div>
              <div v-else-if="sampleReadChapters.length > 0" class="space-y-4">
                <h4 class="text-lg font-medium text-white text-center">
                  {{ sampleReadChapters[sampleReadCurrentIndex]?.chapterTitle }}
                </h4>
                <div
                  class="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap"
                >
                  {{ sampleReadChapters[sampleReadCurrentIndex]?.content }}
                </div>
              </div>
              <div v-else class="text-center py-12">
                <p class="text-zinc-500 text-sm">暂无试读内容</p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 口令弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showCodeModal"
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          @click.self="closeCodeModal"
        >
          <div
            class="modal-content bg-dark-300 rounded-xl max-w-md w-full border border-zinc-700 shadow-2xl overflow-hidden"
          >
            <div
              class="flex items-center justify-between p-4 border-b border-zinc-800"
            >
              <h3 class="text-white font-medium truncate">获取口令</h3>
              <button
                class="text-zinc-400 hover:text-white transition-colors"
                @click="closeCodeModal"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
            <div class="p-5">
              <div v-if="codeModalLoading" class="text-center py-8">
                <div
                  class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                />
                <p class="text-zinc-400 text-sm">正在生成口令...</p>
              </div>
              <div v-else-if="codeModalError" class="text-center py-8">
                <p class="text-red-400 text-sm">{{ codeModalError }}</p>
              </div>
              <div v-else-if="codeModalPcode" class="space-y-4">
                <p class="text-white font-medium text-center text-lg truncate">
                  {{ codeModalTitle }}
                </p>
                <div
                  class="bg-primary-500/10 border border-primary-500/30 rounded-xl p-5 text-center"
                >
                  <p class="text-xs text-zinc-400 mb-2">网盘口令</p>
                  <p
                    class="text-3xl font-mono font-bold text-primary-400 tracking-wider select-all"
                  >
                    {{ codeModalPcode }}
                  </p>
                </div>
                <button
                  class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  @click="
                    copy(codeModalPcode);
                    success('口令已复制');
                  "
                >
                  <Clipboard class="w-4 h-4" />
                  复制口令
                </button>
                <p
                  v-if="codeModalMsg"
                  class="text-xs text-zinc-500 text-center"
                >
                  {{ codeModalMsg }}
                </p>
                <p class="text-xs text-zinc-400 text-center">
                  打开百度网盘APP，即可阅读全本小说，确保APP已更新至最新版本
                </p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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
