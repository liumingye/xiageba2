<script setup lang="ts">
import { Megaphone } from "@lucide/vue";
import { getIconConfig, type Announcement } from "~/utils/announcement";
import { markdownPlugins } from "~/utils/comark";

defineOptions({
  name: "AnnouncementListPage",
});

useSeoMeta({
  title: "公告列表 - 全盘搜",
  description: "查看全盘搜的最新公告与站点通知。",
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
  // key 用函数形式并包含筛选参数，避免不同 tab/页码共享同一缓存键造成数据错乱
  key: () => `announcement-list-${activeTab.value}-${currentPage.value}`,
  server: true,
  default: () => ({ data: [], total: 0, page: 1, pageSize, totalPages: 0 }),
  query: {
    status: activeTab,
    page: currentPage,
    pageSize,
  },
});

const announcements = computed(() => announcementData.value?.data || []);
const totalPages = computed(() => announcementData.value?.totalPages || 0);

// getIconConfig 已统一抽取到 ~/utils/announcement

const switchTab = (tab: "ACTIVE" | "ARCHIVED") => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  currentPage.value = 1;
  updateUrl();
};

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
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold flex items-center gap-2">
      <Megaphone class="w-6 h-6 text-primary-400" />
      公告列表
    </h1>
  </div>

  <!-- Tab 切换 -->
  <UTabs
    :model-value="activeTab"
    class="mb-6"
    color="primary"
    variant="link"
    :ui="{
      content: 'mt-1',
    }"
    :items="[
      {
        label: '最新公告',
        icon: 'i-lucide-megaphone',
        value: 'ACTIVE',
        slot: 'active',
      },
      {
        label: '归档公告',
        icon: 'i-lucide-archive',
        value: 'ARCHIVED',
        slot: 'archived',
      },
    ]"
    @update:model-value="switchTab($event as 'ACTIVE' | 'ARCHIVED')"
  >
    <!-- 最新公告 -->
    <template #active>
      <div v-if="pending" class="space-y-4">
        <UCard
          v-for="i in 3"
          :key="i"
          :ui="{
            body: 'p-3 md:p-6',
          }"
          variant="subtle"
        >
          <div class="flex items-start gap-4 mb-6">
            <USkeleton class="size-10 bg-accented"></USkeleton>
            <div class="flex-1 space-y-2">
              <USkeleton class="h-4 bg-accented w-1/4 my-2"></USkeleton>
              <USkeleton class="h-3 bg-accented w-1/2"></USkeleton>
            </div>
          </div>
          <USkeleton class="h-5 bg-accented w-full mb-2"></USkeleton>
          <USkeleton class="h-5 bg-accented w-full"></USkeleton>
        </UCard>
      </div>

      <UCard
        v-else-if="announcements.length === 0"
        :ui="{
          body: 'p-12 text-center',
        }"
        variant="subtle"
      >
        <Megaphone class="w-12 h-12 mx-auto text-muted mb-3" />
        <p class="text-muted">暂无公告</p>
      </UCard>

      <div v-else class="space-y-4">
        <UPageCard
          v-for="item in announcements"
          :key="item.id"
          as="NuxtLink"
          :to="`/announcement/${item.id}`"
          class="block transition-colors hover:border-primary-500/50"
          :ui="{
            body: 'p-3 md:p-6',
          }"
          variant="subtle"
        >
          <div class="flex items-center gap-4">
            <div
              class="size-10 rounded-lg flex items-center justify-center shrink-0"
              :class="getIconConfig(item.icon).class"
            >
              <component
                :is="getIconConfig(item.icon).component"
                class="size-5"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-base font-medium truncate">
                  {{ item.title }}
                </h2>
              </div>
              <p class="text-xs text-muted mt-1">
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
          <div v-if="item.content" class="text-[0.875rem] line-clamp-2">
            <Markdown
              :value="item.content"
              :plugins="markdownPlugins"
              class="*:first:mt-0 *:last:mb-0"
            />
          </div>
        </UPageCard>
      </div>

      <!-- 分页 -->
      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        @change="onPageChange"
      />
    </template>

    <!-- 归档公告 -->
    <template #archived>
      <div v-if="pending" class="space-y-4">
        <UCard
          v-for="i in 3"
          :key="i"
          :ui="{
            body: 'p-3 md:p-6',
          }"
          variant="subtle"
        >
          <div class="flex items-start gap-4 mb-6">
            <USkeleton class="size-10 bg-accented"></USkeleton>
            <div class="flex-1 space-y-2">
              <USkeleton class="h-4 bg-accented w-1/4 my-2"></USkeleton>
              <USkeleton class="h-3 bg-accented w-1/2"></USkeleton>
            </div>
          </div>
          <USkeleton class="h-5 bg-accented w-full mb-2"></USkeleton>
          <USkeleton class="h-5 bg-accented w-full"></USkeleton>
        </UCard>
      </div>

      <UCard
        v-else-if="announcements.length === 0"
        :ui="{
          body: 'p-12 text-center',
        }"
        variant="subtle"
      >
        <Megaphone class="w-12 h-12 mx-auto text-muted mb-3" />
        <p class="text-muted">暂无归档公告</p>
      </UCard>

      <div v-else class="space-y-4">
        <UPageCard
          v-for="item in announcements"
          :key="item.id"
          as="NuxtLink"
          :to="`/announcement/${item.id}`"
          class="block transition-colors hover:border-primary-500/50"
          :ui="{
            body: 'p-3 md:p-6',
          }"
          variant="subtle"
        >
          <div class="flex items-center gap-4">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                  class="text-xs px-1.5 py-0.5 rounded bg-accented text-toned shrink-0"
                >
                  已归档
                </span>
              </div>
              <p class="text-xs text-muted mt-1">
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
          <div v-if="item.content" class="text-[0.875rem] line-clamp-2">
            <Markdown
              :value="item.content"
              :plugins="markdownPlugins"
              class="*:first:mt-0 *:last:mb-0"
            />
          </div>
        </UPageCard>
      </div>

      <!-- 分页 -->
      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        @change="onPageChange"
      />
    </template>
  </UTabs>
</template>
