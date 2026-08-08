<script setup lang="ts">
import { ShieldBan, Loader2 } from "@lucide/vue";

defineOptions({ name: "ForbiddenKeywordsPage" });

useHead({
  title: "违禁词列表 - 下歌吧",
  meta: [
    {
      name: "description",
      content:
        "下歌吧违禁词列表，搜索时将屏蔽包含违禁词的关键词，以维护健康搜索环境。",
    },
    { name: "robots", content: "index, follow" },
  ],
});

const { data, pending, error } = await useFetch<{
  data: string[];
  total: number;
}>("/api/forbidden-keywords", { server: false });
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-8 px-4">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldBan class="w-6 h-6 text-primary-400" />
          违禁词列表
        </h1>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-primary-400 transition-colors"
        >
          返回首页
        </NuxtLink>
      </div>

      <article class="card p-6">
        <!-- 加载中 -->
        <div
          v-if="pending"
          class="flex items-center justify-center py-12 text-gray-400"
        >
          <Loader2 class="w-5 h-5 animate-spin mr-2" />
          加载中...
        </div>

        <!-- 加载失败 -->
        <div v-else-if="error" class="py-12 text-center text-gray-400">
          加载失败，请稍后重试
        </div>

        <!-- 词表 -->
        <template v-else>
          <p class="text-sm text-gray-400 mb-4">
            共
            <span class="text-primary-400 font-semibold">{{
              data?.total || 0
            }}</span>
            个违禁词，搜索时将屏蔽
          </p>

          <div v-if="data?.data?.length" class="flex flex-wrap gap-2">
            <span
              v-for="(word, i) in data.data"
              :key="`${word}-${i}`"
              class="word"
            >
              {{ word }}
            </span>
          </div>

          <p v-else class="py-8 text-center text-gray-500 text-sm">
            暂无违禁词
          </p>
        </template>
      </article>
    </div>
  </div>
</template>

<style scoped>
.word {
  @apply inline-flex items-center px-2.5 py-1 text-xs rounded-md bg-gray-800/80 text-gray-300 border border-gray-700;
}
</style>
