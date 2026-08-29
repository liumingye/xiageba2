<script setup lang="ts">
import {
  BookOpen,
  Key,
  Eye,
  AlertTriangle,
  RotateCcw,
  Star,
  Hash,
  FileText,
  Calendar,
  User,
  Tag,
} from "@lucide/vue";
import TopBar from "~/components/TopBar.vue";
import Qrcode from "~/components/Qrcode.vue";
import SiteFooter from "~/components/SiteFooter.vue";
import type { ApiErrorResponse } from "~/utils/type";

defineOptions({
  name: "BookDetailPage",
});

const route = useRoute();

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
        message: err?.data?.message || err?.data?.error || "小说不存在",
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

// ======= 试读 / 口令弹窗 =======
const showSampleReadModal = ref(false);
const showCodeModal = ref(false);

const openSampleRead = () => {
  showSampleReadModal.value = true;
};

const openGetCode = () => {
  showCodeModal.value = true;
};

// 试读内容里点击"获取口令"时，先关闭试读再打开口令弹窗
const onSampleReadGetCode = () => {
  showSampleReadModal.value = false;
  showCodeModal.value = true;
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
  parts.push("小说详情 - 全盘搜");
  return parts.join(" - ");
});

useHead({
  title: pageTitle,
  meta: [
    {
      name: "description",
      content: () => {
        const d = detail.value;
        if (!d?.bookName) return "全盘搜小说详情";
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
              class="w-28 h-40 md:w-36 md:h-52 rounded-xl bg-color-300 flex-shrink-0 mx-auto md:mx-0"
            />
            <div class="flex-1 w-full space-y-3 text-center md:text-left">
              <div class="h-7 bg-color-300 rounded w-3/4 mx-auto md:mx-0" />
              <div class="h-4 bg-color-300 rounded w-1/3 mx-auto md:mx-0" />
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                <div class="h-6 bg-color-300 rounded w-16" />
                <div class="h-6 bg-color-300 rounded w-16" />
                <div class="h-6 bg-color-300 rounded w-16" />
              </div>
              <div class="h-4 bg-color-300 rounded w-1/2 mx-auto md:mx-0" />
              <div class="h-4 bg-color-300 rounded w-2/3 mx-auto md:mx-0" />
              <div class="flex gap-2 pt-2 justify-center md:justify-start">
                <div class="h-9 bg-color-300 rounded w-28" />
                <div class="h-9 bg-color-300 rounded w-28" />
              </div>
            </div>
          </div>
          <div class="h-4 bg-color-300 rounded w-1/2" />
          <div class="space-y-2">
            <div class="h-3 bg-color-300 rounded" />
            <div class="h-3 bg-color-300 rounded" />
            <div class="h-3 bg-color-300 rounded w-5/6" />
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
                  class="text-xl md:text-2xl font-bold mb-1"
                  :title="detail.bookName"
                >
                  {{ detail.bookName }}
                </h1>

                <div
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 justify-center md:justify-start mb-2"
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
                    class="text-xs px-2 py-0.5 rounded bg-color-300 text-color-300 truncate max-w-full"
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
                    class="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-color-300 hover:bg-color-400 rounded-lg transition-colors"
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
            <h3 class="flex items-center gap-2 font-medium mb-3">
              <Calendar class="w-5 h-5 text-primary-400" />
              简介
            </h3>
            <div
              v-if="descriptionLines.length"
              class="space-y-2 text-sm text-color-300 leading-relaxed"
            >
              <p
                v-for="(line, i) in descriptionLines"
                :key="i"
                class="whitespace-pre-wrap break-words"
              >
                {{ line }}
              </p>
            </div>
            <p v-else class="text-sm text-color-500">暂无简介</p>
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
    <SampleReadModal
      v-model="showSampleReadModal"
      :book="detail"
      @get-code="onSampleReadGetCode"
    />

    <!-- 口令弹窗 -->
    <GetCodeModal v-model="showCodeModal" :book="detail" />
  </div>
</template>
