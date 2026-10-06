<script setup lang="ts">
import { Loader2 } from "@lucide/vue";
import type { SourceItem } from "~/components/LocalResourceItem.vue";
import type { ApiErrorResponse } from "~/utils/type";

const route = useRoute();
const router = useRouter();

const categoryId = computed(() => Number(route.params.id));

interface CategoryDetail {
  name: string;
}

interface CategoryListData {
  category: CategoryDetail;
  data: SourceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const {
  data,
  pending,
  error: fetchApiError,
} = await useLazyFetch<CategoryListData, ApiErrorResponse>(
  () => `/api/category/${categoryId.value}`,
  {
    // key 用函数形式，随 categoryId / page 变化生成不同缓存键，
    // 避免不同分类/页码互相覆盖缓存造成数据错乱
    key: () =>
      `category-${categoryId.value}-page-${Number(route.query.page) || 1}`,
    query: computed(() => ({
      page: Number(route.query.page) || 1,
      pageSize: 20,
    })),
    server: true,
    default: () => ({
      category: { id: 0, name: "", image: "" },
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    }),
  },
);

// 分类不存在时显示 404
watch(
  fetchApiError,
  (err) => {
    if (err) {
      throw createError({
        statusCode: err?.data?.statusCode || err.status || 404,
        message: err?.data?.message || err?.data?.error || "分类不存在",
      });
    }
  },
  { immediate: true },
);

const currentPage = computed(() => data.value?.page || 1);
const totalPages = computed(() => data.value?.totalPages || 0);
const items = computed(() => data.value?.data || []);
const category = computed(() => data.value?.category);

const { siteShortTitle } = await useSiteSeo();

const pageTitle = computed(() =>
  category.value?.name
    ? `${category.value.name} - 网盘资源分类`
    : "网盘资源分类",
);

const pageDescription = computed(() =>
  category.value?.name
    ? `${category.value.name}分类下的网盘资源，免费下载。`
    : `${siteShortTitle}资源分类，各类网盘资源免费下载。`,
);

const canonicalUrl = `/categorie/${categoryId.value}`;

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogType: "article",
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  ogUrl: canonicalUrl,
  twitterCard: "summary",
  twitterTitle: pageTitle,
  twitterDescription: pageDescription,
});

useHead({
  link: [
    {
      rel: "canonical",
      href: canonicalUrl,
    },
  ],
});

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  router.push({
    path: `/categorie/${categoryId.value}`,
    query: { ...route.query, page: page > 1 ? String(page) : undefined },
  });
  window.scrollTo({ top: 0 });
};

const { submitPanCheck, getCheckStatus, stopPanCheck } = usePanCheck();

watch(
  [data],
  () => {
    if (import.meta.client) {
      stopPanCheck();
      const ids = (data.value.data as SourceItem[])
        .filter(
          (item) =>
            item.type !== "magnet" &&
            item.type !== "guangya" &&
            item.type !== "139",
        )
        .map((item) => item.id);
      submitPanCheck(ids);
    }
  },
  { immediate: true },
);

const showTreeModal = ref(false);
const treeModalTitle = ref("");
const treeModalContent = ref("");
const treeModalLoading = ref(false);
const treeModalError = ref("");

const openTreeModal = async ({ item }: { item: SourceItem }) => {
  treeModalTitle.value = item.title || "";
  treeModalContent.value = "";
  treeModalError.value = "";
  treeModalLoading.value = true;
  showTreeModal.value = true;

  try {
    const query = `id=${(item as SourceItem).id}`;
    const res = await fetch(`/api/source/tree?${query}`);
    const data = await res.json();
    if (res.ok && data.success) {
      treeModalContent.value = data.tree || "（空目录）";
    } else {
      treeModalError.value = data.message || "获取目录失败";
    }
  } catch {
    treeModalError.value = "获取目录失败";
  } finally {
    treeModalLoading.value = false;
  }
};

const showModal = ref(false);
const modalTitle = ref("");
const modalUrl = ref("");
const modalFetching = ref(false);
const modalError = ref("");

const { currentText: funnyText, bindFetching } = useFunnyLoading();
bindFetching([modalFetching, treeModalLoading]);

const setModalLoading = (title: string) => {
  modalTitle.value = title;
  modalUrl.value = "";
  modalError.value = "";
  modalFetching.value = true;
  showModal.value = true;
};

const openModal = async ({ item }: { item: SourceItem }) => {
  setModalLoading(item.title || "");

  try {
    const res = await fetch("/api/source/geturl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    const data = await res.json();
    if (res.ok && data?.url) {
      modalUrl.value = data.url;
    } else {
      modalError.value = data.message || data.error || "获取下载链接失败";
    }
  } catch {
    modalError.value = "获取下载链接失败";
  } finally {
    modalFetching.value = false;
  }
};

const closeModal = () => {
  console.log("closeModal");
  modalTitle.value = "";
  modalUrl.value = "";
};
</script>

<template>
  <div v-if="!pending && category" class="mb-6">
    <h1 class="text-2xl font-bold mb-2">
      {{ category.name }}
    </h1>
    <p class="text-muted text-sm">共 {{ data?.total || 0 }} 个资源</p>
  </div>

  <div v-if="pending" class="text-center space-y-3" aria-busy="true">
    <USkeleton class="h-8 w-16" />
    <USkeleton class="h-5 w-32" />
    <div class="py-12 space-y-4">
      <Loader2 class="size-8 text-primary-400 animate-spin mx-auto" />
      <p class="text-muted">分类列表加载中...</p>
    </div>
  </div>

  <div v-else-if="!items || items.length === 0" class="text-center py-12">
    <p class="text-muted">暂无资源</p>
  </div>

  <div v-else class="space-y-3">
    <LocalResourceItem
      v-for="item in items"
      :key="item.id"
      :item="item"
      :check-status="getCheckStatus(item.id)"
      @open-tree="openTreeModal({ item })"
      @open-modal="openModal({ item })"
    />
  </div>

  <Pagination
    :current-page="currentPage"
    :total-pages="totalPages"
    @change="goToPage"
  />

  <DownloadLinkPanel
    v-model:open="showModal"
    :title="modalTitle"
    :url="modalUrl"
    :loading="modalFetching"
    :error="modalError"
    @close="closeModal"
  />

  <UModal v-model:open="showTreeModal">
    <template #title>
      目录结构<span class="text-xs text-muted">（最多显示5层、150个文件）</span>
    </template>

    <template #body>
      <h4 v-if="treeModalTitle" class="text-sm font-medium truncate mb-3">
        {{ treeModalTitle }}
      </h4>
      <div v-if="treeModalLoading" class="text-center py-8">
        <div
          class="size-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
        />
        <p class="text-muted text-sm">{{ funnyText }}</p>
      </div>
      <div v-else-if="treeModalError" class="text-center py-8">
        <p class="text-red-400 text-sm">{{ treeModalError }}</p>
      </div>
      <pre
        v-else
        class="bg-elevated rounded-lg p-4 text-sm overflow-auto max-h-[60vh] whitespace-pre font-mono"
        >{{ treeModalContent }}</pre
      >
    </template>
  </UModal>
</template>
