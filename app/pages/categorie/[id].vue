<script setup lang="ts">
import SiteFooter from "~/components/SiteFooter.vue";
import TopBar from "~/components/TopBar.vue";
import Qrcode from "~/components/Qrcode.vue";
import { ArrowLeft, Calendar, Download, Folder, Loader2 } from "@lucide/vue";
import { getTypeName } from "~/utils";

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const categoryId = computed(() => Number(route.params.id));

interface CategoryItem {
  id: string;
  title: string;
  menu: string;
  type: string;
  createdAt: string;
}

interface CategoryDetail {
  id: number;
  name: string;
  image: string;
  sort: number;
}

interface CategoryListData {
  category: CategoryDetail;
  data: CategoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const { data, pending, refresh } = await useAsyncData(
  () => `category-${categoryId.value}-page-${route.query.page || 1}`,
  async () => {
    const page = Number(route.query.page) || 1;
    const res = await $fetch<CategoryListData>(
      `/api/category/${categoryId.value}`,
      { query: { page, pageSize: 20 } },
    );
    return res;
  },
  {
    server: true,
    default: () => ({
      category: { id: 0, name: "", image: "", sort: 0 },
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    }),
  },
);

const currentPage = computed(() => data.value?.page || 1);
const totalPages = computed(() => data.value?.totalPages || 0);
const items = computed(() => data.value?.data || []);
const category = computed(() => data.value?.category);

useHead({
  title: () =>
    category.value?.name
      ? `${category.value.name} - 下歌吧资源分类`
      : "资源分类 - 下歌吧",
  meta: [
    {
      name: "description",
      content: category.value?.name
        ? `${category.value.name}分类下的网盘资源，免费下载。`
        : "下歌吧资源分类，各类网盘资源免费下载。",
    },
  ],
  link: [
    {
      rel: "canonical",
      href: config.app.baseURL + `categorie/${categoryId.value}`,
    },
  ],
});

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  router.push({
    path: `/categorie/${categoryId.value}`,
    query: { ...route.query, page: page > 1 ? String(page) : undefined },
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const goToSource = (id: string) => {
  router.push(`/source/${id}`);
};

const pages = computed(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  const result: (number | "...")[] = [];
  const range = 2;

  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - range && i <= current + range)
    ) {
      result.push(i);
    } else if (result[result.length - 1] !== "...") {
      result.push("...");
    }
  }
  return result;
});
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-6 px-4">
    <div class="max-w-4xl mx-auto">
      <TopBar />

      <div v-if="category" class="mb-6">
        <h1 class="text-2xl font-bold text-white mb-2">
          {{ category.name }}
        </h1>
        <p class="text-gray-500 text-sm">共 {{ data?.total || 0 }} 个资源</p>
      </div>

      <div v-if="pending" class="text-center py-12" aria-busy="true">
        <Loader2 class="w-8 h-8 text-primary-400 animate-spin mx-auto" />
        <p class="text-gray-500 mt-3">加载中...</p>
      </div>

      <div v-else-if="!items || items.length === 0" class="text-center py-12">
        <p class="text-gray-500">暂无资源</p>
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="item in items"
          :key="item.id"
          class="card p-3 hover:border-primary-500/50 transition-colors cursor-pointer"
          role="article"
          @click="goToSource(item.id)"
        >
          <div class="flex flex-col">
            <div
              class="flex-1 min-w-0 flex justify-between gap-2 md:flex-row flex-col mb-2"
            >
              <h3
                class="text-white truncate hover:text-primary-400 transition-colors"
              >
                {{ item.title }}
              </h3>
              <div
                class="bg-primary-800 text-white px-2 py-1 rounded-sm text-sm self-start flex items-center flex-shrink-0"
              >
                <img
                  v-if="item.type !== 'other'"
                  :src="`/img/pan/${item.type}.png`"
                  class="w-4 h-4 mr-1"
                />
                {{ getTypeName(item.type) }}
              </div>
            </div>
            <template v-if="item.menu">
              <div class="text-sm mb-2 text-gray-300 font-bold">文件内容:</div>
              <pre
                class="bg-gray-700 p-2 rounded-sm text-sm border border-gray-600 max-h-36 overflow-auto text-gray-300"
                >{{ item.menu }}</pre
              >
            </template>
          </div>
          <div
            class="flex justify-between items-center gap-2 border-t border-gray-700 mt-3 pt-3"
          >
            <span class="text-xs text-gray-500 flex items-center gap-1">
              <Calendar class="w-3 h-3" />
              {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
            </span>
            <div class="flex items-center gap-2">
              <NuxtLink
                :to="`/source/${item.id}`"
                class="flex items-center gap-1 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs rounded-sm transition-colors flex-shrink-0"
              >
                <Download class="w-3 h-3" />
                查看详情
              </NuxtLink>
            </div>
          </div>
        </article>
      </div>

      <div
        v-if="totalPages > 1"
        class="flex items-center justify-center gap-2 mt-8 flex-wrap"
      >
        <button
          class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="currentPage <= 1"
          @click="goToPage(currentPage - 1)"
        >
          上一页
        </button>
        <template v-for="(p, idx) in pages" :key="idx">
          <span v-if="p === '...'" class="text-gray-500 px-2"> ... </span>
          <button
            v-else
            class="w-9 h-9 rounded text-sm transition-colors"
            :class="
              p === currentPage
                ? 'bg-primary-500 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            "
            @click="goToPage(p as number)"
          >
            {{ p }}
          </button>
        </template>
        <button
          class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="currentPage >= totalPages"
          @click="goToPage(currentPage + 1)"
        >
          下一页
        </button>
      </div>

      <Qrcode />

      <SiteFooter />
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
