<script setup lang="ts">
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Megaphone,
  Archive,
} from "@lucide/vue";

defineOptions({
  name: "AnnouncementListPage",
});

interface Announcement {
  id: string;
  title: string;
  content: string;
  displayType: "NORMAL" | "BANNER" | "DIALOG";
  icon: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  status: "ACTIVE" | "ARCHIVED";
  sort: number;
  createdAt: string;
  updatedAt: string;
}

useHead({
  title: "公告列表 - 下歌吧",
  meta: [
    {
      name: "description",
      content: "查看下歌吧的最新公告与站点通知。",
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

const iconConfig: Record<
  Announcement["icon"],
  { class: string; component: typeof Info }
> = {
  INFO: { class: "bg-blue-500/20 text-blue-400", component: Info },
  WARN: {
    class: "bg-yellow-500/20 text-yellow-400",
    component: AlertTriangle,
  },
  ERROR: {
    class: "bg-red-500/20 text-red-400",
    component: AlertCircle,
  },
  SUCCESS: {
    class: "bg-green-500/20 text-green-400",
    component: CheckCircle,
  },
};

const getIconConfig = (icon: Announcement["icon"]) => {
  return (
    iconConfig[icon] || {
      class: "bg-gray-500/20 text-gray-400",
      component: Megaphone,
    }
  );
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const getPreview = (content: string) => {
  if (!content) return "";
  const text = content.replace(/\s+/g, " ").trim();
  return text;
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
  <div class="min-h-screen bg-dark-300 py-8 px-4">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <Megaphone class="w-6 h-6 text-primary-400" />
          公告列表
        </h1>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-primary-400 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" />
          返回首页
        </NuxtLink>
      </div>

      <!-- Tab 切换 -->
      <div class="flex items-center gap-1 mb-6 border-b border-gray-800">
        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            activeTab === 'ACTIVE'
              ? 'text-primary-400 border-primary-400'
              : 'text-gray-400 border-transparent hover:text-gray-300'
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
              ? 'text-primary-400 border-primary-400'
              : 'text-gray-400 border-transparent hover:text-gray-300'
          "
          @click="switchTab('ARCHIVED')"
        >
          <Archive class="w-4 h-4" />
          归档公告
        </button>
      </div>

      <div v-if="pending" class="space-y-4">
        <div
          v-for="i in 3"
          :key="i"
          class="card p-6 animate-pulse"
        >
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-lg bg-gray-800 flex-shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-gray-800 rounded w-1/3"></div>
              <div class="h-3 bg-gray-800/50 rounded w-1/4"></div>
              <div class="h-3 bg-gray-800/50 rounded w-full"></div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="announcements.length === 0"
        class="card p-12 text-center"
      >
        <Megaphone class="w-12 h-12 mx-auto text-gray-600 mb-3" />
        <p class="text-gray-500">
          {{ activeTab === "ARCHIVED" ? "暂无归档公告" : "暂无公告" }}
        </p>
      </div>

      <div v-else class="space-y-4">
        <NuxtLink
          v-for="item in announcements"
          :key="item.id"
          :to="`/announcement/${item.id}`"
          class="card p-6 block hover:border-primary-500/50 transition-colors"
        >
          <div class="flex items-start gap-4">
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
                <h2 class="text-base font-medium text-white truncate">
                  {{ item.title }}
                </h2>
                <span
                  v-if="item.status === 'ARCHIVED'"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 flex-shrink-0"
                >
                  已归档
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1">
                {{ formatDate(item.createdAt) }}
              </p>
              <p
                v-if="getPreview(item.content)"
                class="text-sm text-gray-400 mt-2 line-clamp-2"
              >
                {{ getPreview(item.content) }}
              </p>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- 分页 -->
      <div
        v-if="totalPages > 1"
        class="flex items-center justify-between mt-6 px-4"
      >
        <div class="text-sm text-gray-400">共 {{ total }} 条</div>
        <div class="flex items-center gap-1">
          <button
            :disabled="currentPage === 1"
            class="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            @click="onPageChange(currentPage - 1)"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <button
            v-for="p in pageNumbers"
            :key="p"
            :class="[
              'min-w-[36px] h-8 px-2 text-sm rounded transition-colors',
              p === currentPage
                ? 'bg-primary-500 text-white'
                : p === '...'
                  ? 'text-gray-500 cursor-default'
                  : 'text-gray-400 hover:text-white',
            ]"
            @click="typeof p === 'number' && onPageChange(p)"
          >
            {{ p }}
          </button>
          <button
            :disabled="currentPage === totalPages"
            class="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            @click="onPageChange(currentPage + 1)"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
