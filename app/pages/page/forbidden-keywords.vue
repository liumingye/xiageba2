<script setup lang="ts">
import { ShieldBan, Loader2 } from "@lucide/vue";

defineOptions({ name: "ForbiddenKeywordsPage" });

useHead({
  title: "屏蔽词列表 - 全盘搜",
  meta: [
    {
      name: "description",
      content:
        "全盘搜屏蔽词列表，搜索时将屏蔽包含屏蔽词的关键词，以维护健康搜索环境。",
    },
  ],
});

const { data, pending, error } = await useFetch<{
  data: string[];
  total: number;
}>("/api/forbidden-keywords", { server: false });
</script>

<template>
  <h1 class="text-2xl font-bold flex items-center gap-2 mb-6">
    <ShieldBan class="w-6 h-6 text-primary-400" />
    屏蔽词列表
  </h1>

  <article class="card p-6">
    <!-- 加载中 -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <Loader2 class="w-5 h-5 animate-spin mr-2" />
      加载中...
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="py-12 text-center text-red-500">
      加载失败，请稍后重试
    </div>

    <!-- 词表 -->
    <template v-else>
      <p class="text-sm text-muted mb-4">
        共
        <span class="font-semibold">{{ data?.total || 0 }}</span>
        个屏蔽词，搜索时将屏蔽
      </p>

      <div v-if="data?.data?.length" class="flex flex-wrap gap-2">
        <span v-for="(word, i) in data.data" :key="`${word}-${i}`" class="word">
          {{ word }}
        </span>
      </div>

      <p v-else class="py-8 text-center text-muted text-sm">暂无屏蔽词</p>
    </template>
  </article>
</template>

<style scoped>
@reference "~/assets/css/main.css";

.word {
  @apply inline-flex items-center px-2.5 py-1 text-xs rounded-md bg-accented border border-accented;
}
</style>
