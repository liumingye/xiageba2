<script setup lang="ts">
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Archive,
} from "@lucide/vue";
import { marked } from "marked";
import { getIconConfig, type Announcement } from "~/utils/announcement";

marked.setOptions({ gfm: true, breaks: true, async: false });

defineOptions({
  name: "AnnouncementListPage",
});

useHead({
  title: "公告列表 - 全盘搜",
  meta: [
    {
      name: "description",
      content: "查看全盘搜的最新公告与站点通知。",
    },
    { name: "robots", content: "index, follow" },
  ],
});

const route = useRoute();
const router = useRouter();

const activeTab = ref<"ACTIVE" | "ARCHIVED">(
  route.query.tab === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
);
const currentPage = ref(Math.max(1, parseInt(route.query.page as string) || 1));
const pageSize = 10;

const { data: announcementData, pending } = await useFetch<{
  data: Announcement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>("/api/announcement", {
  key: "announcement-list",
  server: true,
  default: () => ({ data: [], total: 0, page: 1, pageSize, totalPages: 0 }),
  query: {
    status: activeTab,
    page: currentPage,
    pageSize,
  },
});

const announcements = computed(() => announcementData.value?.data || []);
const total = computed(() => announcementData.value?.total || 0);
const totalPages = computed(() => announcementData.value?.totalPages || 0);

// getIconConfig 已统一抽取到 ~/utils/announcement

const renderMarkdown = (text: string): string => {
  if (!text) return "";
  return marked.parse(text) as string;
};

const switchTab = (tab: "ACTIVE" | "ARCHIVED") => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  currentPage.value = 1;
  updateUrl();
};

const pageNumbers = computed<(number | string)[]>(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
});

const onPageChange = (page: number) => {
  currentPage.value = page;
  updateUrl();
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

const updateUrl = () => {
  const query: Record<string, string> = {};
  if (activeTab.value === "ARCHIVED") query.tab = "ARCHIVED";
  if (currentPage.value > 1) query.page = String(currentPage.value);
  router.replace({ query });
};

watch(
  () => route.query,
  (q) => {
    const newTab = q.tab === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
    const newPage = Math.max(1, parseInt(q.page as string) || 1);
    if (newTab !== activeTab.value) activeTab.value = newTab;
    if (newPage !== currentPage.value) currentPage.value = newPage;
  },
);
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar />
    <div class="max-w-4xl mx-auto px-2">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <Megaphone class="w-6 h-6 text-primary-400" />
          公告列表
        </h1>
      </div>

      <!-- Tab 切换 -->
      <div class="flex items-center gap-1 mb-6 border-b border-color-300">
        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            activeTab === 'ACTIVE'
              ? 'text-[--primary] border-[--primary]'
              : 'text-gray-500 border-transparent hover:text-color-300'
          "
          @click="switchTab('ACTIVE')"
        >
          <Megaphone class="w-4 h-4" />
          最新公告
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            activeTab === 'ARCHIVED'
              ? 'text-[--primary] border-[--primary]'
              : 'text-gray-500 border-transparent hover:text-color-300'
          "
          @click="switchTab('ARCHIVED')"
        >
          <Archive class="w-4 h-4" />
          归档公告
        </button>
      </div>

      <div v-if="pending" class="space-y-4">
        <div v-for="i in 3" :key="i" class="card p-6 animate-pulse">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-lg bg-color-400 flex-shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-color-400 rounded w-1/3"></div>
              <div class="h-3 bg-color-300 rounded w-1/4"></div>
              <div class="h-3 bg-color-300 rounded w-full"></div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="announcements.length === 0" class="card p-12 text-center">
        <Megaphone class="w-12 h-12 mx-auto text-zinc-600 mb-3" />
        <p class="text-zinc-500">
          {{ activeTab === "ARCHIVED" ? "暂无归档公告" : "暂无公告" }}
        </p>
      </div>

      <div v-else class="space-y-4">
        <NuxtLink
          v-for="item in announcements"
          :key="item.id"
          :to="`/announcement/${item.id}`"
          class="card p-3 md:p-6 block hover:border-primary-500/50 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="getIconConfig(item.icon).class"
            >
              <component
                :is="getIconConfig(item.icon).component"
                class="w-5 h-5"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-base font-medium truncate">
                  {{ item.title }}
                </h2>
                <span
                  v-if="item.status === 'ARCHIVED'"
                  class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 flex-shrink-0"
                >
                  已归档
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1">
                <NuxtTime
                  :datetime="item.createdAt"
                  year="numeric"
                  month="short"
                  day="numeric"
                  hour="numeric"
                  minute="numeric"
                  second="numeric"
                />
              </p>
            </div>
          </div>
          <div
            v-if="item.content"
            class="text-[0.875rem] text-color-300 mt-2 line-clamp-2 prose-resource"
          >
            <span v-html="renderMarkdown(item.content)" />
          </div>
        </NuxtLink>
      </div>

      <!-- 分页 -->
      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        @change="onPageChange"
      />
    </div>
  </div>
</template>
