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
  Star,
  Hash,
  FileText,
  Calendar,
  User,
  Tag,
} from "@lucide/vue";
import { useClipboard } from "@vueuse/core";
import TopBar from "~/components/TopBar.vue";
import Qrcode from "~/components/Qrcode.vue";
import SiteFooter from "~/components/SiteFooter.vue";
import type { ApiErrorResponse } from "~/utils/type";

defineOptions({
  name: "BookDetailPage",
});

const route = useRoute();
const router = useRouter();
const sampleReadContentRef = ref<HTMLDivElement>();

const bookId = computed(() => {
  const raw = route.params.id as string;
  return raw ? decodeURIComponent(raw) : "";
});

interface NovelDetail {
  bookId: string;
  bookName: string;
  author: string;
  coverImage: string;
  bookScore: number;
  bookStatus: number;
  category: string;
  chapterCount: number;
  wordCount: number;
  description: string;
  tag: string;
}

const {
  data: detail,
  pending: loading,
  error: fetchApiError,
  refresh: retryFetch,
} = await useFetch<NovelDetail, ApiErrorResponse>(
  () => `/api/novel/${bookId.value}`,
  {
    key: () => `novel-detail-${bookId.value}`,
    lazy: true,
    server: true,
    default: () => ({
      bookId: bookId.value,
      bookName: "",
      author: "",
      coverImage: "",
      bookScore: 0,
      bookStatus: 0,
      category: "",
      chapterCount: 0,
      wordCount: 0,
      description: "",
      tag: "",
    }),
  },
);

// API 错误用 error 页面展示（404/500 等）
watch(
  fetchApiError,
  (err) => {
    if (err) {
      throw createError({
        statusCode: err?.data?.statusCode || err.status || 404,
        message: err?.data?.message || "小说不存在",
      });
    }
  },
  { immediate: true },
);

// 详情封面加载错误
const coverError = ref(false);
watch(
  () => detail.value?.coverImage,
  () => {
    coverError.value = false;
  },
);

// 字数和章节数格式化
const formatWordCount = (n: number) => {
  if (!n) return "-";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万字`;
  return `${n}字`;
};

const formatChapters = (n: number) => (n ? `${n}章` : "-");
const formatScore = (s: number) => (s ? Number(s).toFixed(1) : "-");
const statusLabel = (s: number) => (s === 1 ? "已完结" : "连载中");
const statusClass = (s: number) =>
  s === 1
    ? "bg-green-600 text-[var(--white)]"
    : "bg-blue-600 text-[var(--white)]";

// 分类：把 "女频_古代言情_古色古香" 转为 ["女频","古代言情","古色古香"]
const categoryChips = computed(() => {
  const c = detail.value?.category;
  if (!c) return [];
  return c.split("_").filter(Boolean);
});

const tagChips = computed(() => {
  const t = detail.value?.tag;
  if (!t) return [];
  return t.split(",").filter(Boolean);
});

// 描述渲染换行
const descriptionLines = computed(() => {
  const d = detail.value?.description || "";
  return d.split(/\r?\n/).filter((l) => l.trim().length > 0);
});

// ======= 试读弹窗 =======
const showSampleReadModal = ref(false);
const sampleReadChapters = ref<any[]>([]);
const sampleReadCurrentIndex = ref(0);
const sampleReadLoading = ref(false);
const sampleReadError = ref("");
const sampleDetail = ref<NovelDetail | null>(null);

const openSampleRead = async () => {
  if (!detail.value) return;
  sampleDetail.value = detail.value;
  sampleReadChapters.value = [];
  sampleReadCurrentIndex.value = 0;
  sampleReadError.value = "";
  sampleReadLoading.value = true;
  showSampleReadModal.value = true;

  try {
    const res = await fetch("/api/novel/sample-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: detail.value.bookId }),
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
  sampleReadChapters.value = [];
  sampleReadCurrentIndex.value = 0;
  sampleReadError.value = "";
};

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

// ======= 口令弹窗 =======
const showCodeModal = ref(false);
const codeModalTitle = ref("");
const codeModalPcode = ref("");
const codeModalMsg = ref("");
const codeModalLoading = ref(false);
const codeModalError = ref("");

const { success } = useToast();
const { copy } = useClipboard();

const openGetCode = async () => {
  if (!detail.value) return;
  codeModalTitle.value = detail.value.bookName;
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
        book_id: detail.value.bookId,
        content_title: detail.value.bookName,
        content_author: detail.value.author,
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

// 错误展示（兜底；上面 watch 遇到错误已经 throw，这里处理非 fatal 的状态）
const showErrorCard = ref(false);
const errorCardMsg = ref("");
retryFetch;

const pageTitle = computed(() => {
  const name = detail.value?.bookName;
  const author = detail.value?.author;
  const parts: string[] = [];
  if (name) parts.push(name);
  if (author) parts.push(author);
  parts.push("小说详情 - 下歌吧");
  return parts.join(" - ");
});

useHead({
  title: pageTitle,
  meta: [
    {
      name: "description",
      content: () => {
        const d = detail.value;
        if (!d?.bookName) return "下歌吧小说详情";
        const desc = (d.description || "").replace(/\s+/g, " ").slice(0, 140);
        return `${d.bookName}（${d.author} 著）${desc}`;
      },
    },
    { name: "robots", content: "index, follow" },
    { name: "theme-color", content: "#0f172a" },
  ],
});
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar :show-search="false" />

    <div class="max-w-4xl mx-auto px-2">
      <main class="mt-4">
        <!-- 错误（兜底，大部分错误已在 watch 中转走 Nuxt error 页） -->
        <div
          v-if="showErrorCard"
          class="card p-5 text-center mb-6"
          role="alert"
        >
          <div
            class="w-14 h-14 rounded-full bg-red-900/50 text-red-400 flex items-center justify-center mx-auto mb-3"
          >
            <AlertTriangle class="w-7 h-7" />
          </div>
          <h3 class="text-lg font-medium text-white mb-1">加载失败</h3>
          <p class="text-sm text-zinc-500">{{ errorCardMsg }}</p>
          <button
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="
              showErrorCard = false;
              retryFetch();
            "
          >
            <RotateCcw class="w-4 h-4" />
            重新加载
          </button>
        </div>

        <!-- 骨架屏 -->
        <div
          v-else-if="loading"
          class="card p-4 md:p-6 animate-pulse space-y-5"
          aria-busy="true"
          aria-label="正在加载小说详情"
        >
          <div
            class="flex gap-4 md:gap-6 flex-col md:flex-row items-start md:items-center"
          >
            <div
              class="w-28 h-40 md:w-36 md:h-52 rounded-xl bg-zinc-700 flex-shrink-0 mx-auto md:mx-0"
            />
            <div class="flex-1 w-full space-y-3 text-center md:text-left">
              <div class="h-7 bg-zinc-700 rounded w-3/4 mx-auto md:mx-0" />
              <div class="h-4 bg-zinc-700 rounded w-1/3 mx-auto md:mx-0" />
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                <div class="h-6 bg-zinc-700 rounded w-16" />
                <div class="h-6 bg-zinc-700 rounded w-16" />
                <div class="h-6 bg-zinc-700 rounded w-16" />
              </div>
              <div class="h-4 bg-zinc-700 rounded w-1/2 mx-auto md:mx-0" />
              <div class="h-4 bg-zinc-700 rounded w-2/3 mx-auto md:mx-0" />
              <div class="flex gap-2 pt-2 justify-center md:justify-start">
                <div class="h-9 bg-zinc-700 rounded w-28" />
                <div class="h-9 bg-zinc-700 rounded w-28" />
              </div>
            </div>
          </div>
          <div class="h-4 bg-zinc-700 rounded w-1/2" />
          <div class="space-y-2">
            <div class="h-3 bg-zinc-700 rounded" />
            <div class="h-3 bg-zinc-700 rounded" />
            <div class="h-3 bg-zinc-700 rounded w-5/6" />
          </div>
        </div>

        <!-- 详情内容 -->
        <template v-else-if="detail?.bookName">
          <!-- 头：封面 + 标题 + 操作 -->
          <div class="card p-4 md:p-6 mb-6">
            <div
              class="flex flex-col md:flex-row items-start md:items-stretch gap-4 md:gap-6"
            >
              <!-- 封面 -->
              <div
                class="relative w-28 h-40 md:w-36 md:h-52 mx-auto md:mx-0 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 shadow-lg"
              >
                <img
                  v-if="!coverError && detail.coverImage"
                  :src="detail.coverImage"
                  :alt="detail.bookName"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  @error="coverError = true"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                >
                  <BookOpen class="w-12 h-12 text-zinc-600" />
                </div>
                <div
                  class="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium"
                  :class="statusClass(detail.bookStatus)"
                >
                  {{ statusLabel(detail.bookStatus) }}
                </div>
              </div>

              <!-- 文字信息 -->
              <div class="flex-1 flex flex-col text-center md:text-left">
                <h1
                  class="text-xl md:text-2xl font-bold text-white mb-1"
                  :title="detail.bookName"
                >
                  {{ detail.bookName }}
                </h1>

                <div
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400 justify-center md:justify-start mb-2"
                >
                  <span
                    class="inline-flex items-center gap-1"
                    :title="detail.author || '佚名'"
                  >
                    <User class="w-3.5 h-3.5" />
                    {{ detail.author || "佚名" }}
                  </span>
                  <span
                    v-if="detail.bookScore"
                    class="inline-flex items-center gap-1 text-yellow-400"
                  >
                    <Star class="w-3.5 h-3.5 fill-yellow-400" />
                    {{ formatScore(detail.bookScore) }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <FileText class="w-3.5 h-3.5" />
                    {{ formatChapters(detail.chapterCount) }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <Hash class="w-3.5 h-3.5" />
                    {{ formatWordCount(detail.wordCount) }}
                  </span>
                </div>

                <!-- 分类 chips -->
                <div
                  v-if="categoryChips.length"
                  class="flex flex-wrap gap-1.5 justify-center md:justify-start mb-2"
                >
                  <span
                    v-for="(c, i) in categoryChips"
                    :key="i"
                    class="text-xs px-2 py-0.5 rounded bg-primary-500/10 text-primary-400"
                    :title="c"
                  >
                    {{ c }}
                  </span>
                </div>

                <!-- 标签 chips -->
                <div
                  v-if="tagChips.length"
                  class="flex flex-wrap gap-1 justify-center md:justify-start mb-4"
                >
                  <span
                    v-for="(t, i) in tagChips"
                    :key="i"
                    class="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 truncate max-w-full"
                    :title="
                      t
                        .replaceAll('_*', '')
                        .replaceAll('*_', '')
                        .replace(/_/g, ' · ')
                    "
                  >
                    <span
                      v-for="(part, pidx) in t
                        .split('_')
                        .filter((v) => v != '*')
                        .slice(0, 3)"
                      :key="pidx"
                    >
                      <template v-if="pidx > 0"> · </template>{{ part }}
                    </span>
                  </span>
                </div>

                <!-- 操作按钮 -->
                <div
                  class="flex flex-wrap gap-2 mt-auto pt-2 justify-center md:justify-start"
                >
                  <button
                    class="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                    @click="openSampleRead"
                  >
                    <Eye class="w-4 h-4" />
                    免费试读
                  </button>
                  <button
                    class="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-[var(--white)] rounded-lg transition-colors"
                    @click="openGetCode"
                  >
                    <Key class="w-4 h-4" />
                    获取口令 · 全本阅读
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 简介 -->
          <div class="card p-4 md:p-6 mb-6">
            <h3 class="flex items-center gap-2 text-white font-medium mb-3">
              <Calendar class="w-5 h-5 text-primary-400" />
              简介
            </h3>
            <div
              v-if="descriptionLines.length"
              class="space-y-2 text-sm text-zinc-300 leading-relaxed"
            >
              <p
                v-for="(line, i) in descriptionLines"
                :key="i"
                class="whitespace-pre-wrap break-words"
              >
                {{ line }}
              </p>
            </div>
            <p v-else class="text-sm text-zinc-500">暂无简介</p>
          </div>
        </template>

        <!-- 加载后无数据兜底 -->
        <div v-else class="text-center py-20">
          <div
            class="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <BookOpen class="w-8 h-8 text-zinc-600" />
          </div>
          <p class="text-zinc-500 mb-4">暂无该小说详情</p>
          <button
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="navigateTo('/book')"
          >
            <Tag class="w-4 h-4" />
            返回小说首页
          </button>
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
                {{ sampleDetail?.bookName }} - 试读
              </h3>
              <button
                class="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                @click="closeSampleRead"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            <div
              v-if="sampleReadChapters.length > 0"
              class="flex items-center justify-between gap-2 p-3 border-b border-zinc-800 bg-zinc-900/50"
            >
              <button
                class="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                class="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  class="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap break-words"
                >
                  {{ sampleReadChapters[sampleReadCurrentIndex]?.content }}
                </div>
                <button
                  v-if="sampleReadCurrentIndex < sampleReadChapters.length - 1"
                  class="flex w-full justify-center items-center gap-1 px-3 py-8 rounded-md text-sm transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  @click="sampleReadNextChapter"
                >
                  下一章
                  <ChevronRight class="w-4 h-4" />
                </button>
                <button
                  class="flex w-full justify-center items-center gap-1 px-2 py-1.5 !mb-48 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
                  @click="openGetCode()"
                >
                  获取口令
                </button>
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
                  class="text-xs text-zinc-500 text-center break-words"
                >
                  {{ codeModalMsg }}
                </p>
                <p class="text-xs text-zinc-400 text-center">
                  打开百度网盘APP，输入口令即可阅读全本小说
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
