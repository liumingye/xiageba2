<script setup lang="ts">
import { computed } from "vue";
import { FileText, Loader2 } from "@lucide/vue";
import { markdownPlugins } from "~/utils/comark";

defineOptions({ name: "CustomPage" });

const route = useRoute();
const slug = computed(() => String(route.params.slug || "").trim());

const { siteShortTitle } = await useSiteSeo();

interface PageDetail {
  id: string;
  slug: string;
  title: string;
  content: string;
  icon: string;
}

const { data, pending } = await useFetch<{ data: PageDetail }>(
  () => `/api/page/${slug.value}`,
  { watch: [slug] },
);

const page = computed<PageDetail | null>(() => data.value?.data || null);

useSeoMeta({
  title: () => page.value?.title || "页面不存在",
  description: () =>
    page.value?.title
      ? `${page.value.title} - ${siteShortTitle}`
      : `页面不存在 - ${siteShortTitle}`,
  ogTitle: () => page.value?.title || "页面不存在",
  ogDescription: () =>
    page.value?.title
      ? `${page.value.title} - ${siteShortTitle}`
      : `页面不存在 - ${siteShortTitle}`,
  twitterTitle: () => page.value?.title || "页面不存在",
  twitterDescription: () =>
    page.value?.title
      ? `${page.value.title} - ${siteShortTitle}`
      : `页面不存在 - ${siteShortTitle}`,
});

// SSR 下必须返回 404 状态码，避免爬虫收录不存在的页面。
// 客户端路由切换时 data 可能短暂为空，这一侧只渲染空态，不打断导航。
if (import.meta.server && !page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "页面不存在或未发布",
    fatal: true,
  });
}
</script>

<template>
  <div v-if="pending && !page" class="flex items-center justify-center py-16">
    <Loader2 class="size-5 animate-spin mr-2" />
    加载中...
  </div>

  <template v-else-if="page">
    <h1 class="text-2xl font-bold flex items-center gap-2 mb-6">
      <UIcon
        :name="`i-lucide-${page.icon || 'file-text'}`"
        class="size-6 text-primary-400"
      />
      {{ page.title }}
    </h1>

    <UCard as="article" :ui="{ body: 'p-0!' }">
      <div class="wrap-break-word leading-relaxed m-6">
        <Markdown
          v-if="page.content"
          :value="page.content"
          :plugins="markdownPlugins"
          class="*:first:mt-0 *:last:mb-0"
        />
        <p v-else class="text-muted text-sm">该页面暂无内容。</p>
      </div>
    </UCard>
  </template>

  <div v-else class="flex flex-col items-center gap-3 py-16">
    <FileText class="size-10 text-color-300" />
    <p class="text-muted text-sm">页面不存在或未发布</p>
    <UButton to="/" color="neutral" variant="soft" size="sm">返回首页</UButton>
  </div>
</template>
