<script setup lang="ts">
import {
  ArrowLeft,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Megaphone,
} from "@lucide/vue";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true, async: false });

defineOptions({
  name: "AnnouncementDetailPage",
});

interface Announcement {
  id: string;
  title: string;
  content: string;
  icon: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  createdAt: string;
}

const route = useRoute();
const announcementId = route.params.id as string;

const { data: responseData } = await useFetch<{
  data: Announcement;
}>(`/api/announcement/${announcementId}`, {
  key: `announcement-${announcementId}`,
  server: true,
  default: () => ({ data: null as any }),
});

const announcement = computed(() => responseData.value?.data || null);
const isNotFound = computed(() => !announcement.value);

const renderedContent = computed(() =>
  announcement.value?.content
    ? (marked.parse(announcement.value.content) as string)
    : "",
);

useHead(() => ({
  title: announcement.value
    ? `${announcement.value.title} - 公告 - 下歌吧`
    : "公告不存在 - 下歌吧",
  meta: [
    {
      name: "description",
      content: announcement.value
        ? announcement.value.content.slice(0, 150)
        : "公告不存在",
    },
    { name: "robots", content: "index, follow" },
  ],
}));

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
      class: "bg-zinc-500/20 text-zinc-400",
      component: Megaphone,
    }
  );
};
</script>

<template>
  <div class="min-h-screen py-8 px-4">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <Megaphone class="w-6 h-6 text-primary-400" />
          公告详情
        </h1>
        <NuxtLink
          to="/announcement"
          class="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-primary-400 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" />
          返回公告列表
        </NuxtLink>
      </div>

      <div v-if="isNotFound" class="card p-12 text-center">
        <Megaphone class="w-12 h-12 mx-auto text-zinc-600 mb-3" />
        <p class="text-zinc-500">公告不存在</p>
      </div>

      <article v-else class="card p-6">
        <div class="flex items-center gap-4 mb-4">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            :class="getIconConfig(announcement.icon).class"
          >
            <component
              :is="getIconConfig(announcement.icon).component"
              class="w-5 h-5"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-xl font-bold text-white break-words">
              {{ announcement.title }}
            </h1>
            <p class="text-xs text-zinc-500 mt-1">
              <NuxtTime
                :datetime="announcement.createdAt"
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

        <div>
          <div
            v-if="renderedContent"
            class="text-sm text-zinc-300 break-words leading-relaxed prose-resource"
          >
            <span v-html="renderedContent" />
          </div>
          <p v-else class="text-sm text-zinc-500">暂无内容</p>
        </div>
      </article>
    </div>
  </div>
</template>
