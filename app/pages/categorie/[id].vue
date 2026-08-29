<script setup lang="ts">
import SiteFooter from "~/components/SiteFooter.vue";
import TopBar from "~/components/TopBar.vue";
import Qrcode from "~/components/Qrcode.vue";
import { Loader2, X } from "@lucide/vue";
import type { SourceItem } from "~/components/LocalResourceItem.vue";
import type { ApiErrorResponse } from "~/utils/type";

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const categoryId = computed(() => Number(route.params.id));

interface CategoryDetail {
  id: number;
  name: string;
  image: string;
  sort: number;
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
} = await useFetch<CategoryListData, ApiErrorResponse>(
  () => `/api/category/${categoryId.value}`,
  {
    key: `category-${categoryId.value}-page-${route.query.page || 1}`,
    query: computed(() => ({
      page: Number(route.query.page) || 1,
      pageSize: 20,
    })),
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

useSeoMeta({
  title: category.value?.name
    ? `${category.value.name} - 全盘搜资源分类`
    : "资源分类 - 全盘搜",
  description: category.value?.name
    ? `${category.value.name}分类下的网盘资源，免费下载。`
    : "全盘搜资源分类，各类网盘资源免费下载。",
});

useHead({
  link: [
    {
      rel: "canonical",
      href: config.app.baseURL + `categorie/${categoryId.value}`,
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
        .filter((item) => item.type !== "magnet")
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

const openTreeModal = async ({
  item,
  type,
}: {
  item: SourceItem;
  type: "id";
}) => {
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

const closeTreeModal = () => {
  showTreeModal.value = false;
  treeModalTitle.value = "";
  treeModalContent.value = "";
  treeModalError.value = "";
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

const openModal = async ({ item, type }: { item: SourceItem; type: "id" }) => {
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
  modalTitle.value = "";
  modalUrl.value = "";
};
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar />
    <div class="max-w-4xl mx-auto px-2">
      <div v-if="category" class="mb-6">
        <h1 class="text-2xl font-bold mb-2 text-color-300">
          {{ category.name }}
        </h1>
        <p class="text-color-400 text-sm">共 {{ data?.total || 0 }} 个资源</p>
      </div>

      <div v-if="pending" class="text-center py-12" aria-busy="true">
        <Loader2 class="w-8 h-8 text-primary-400 animate-spin mx-auto" />
        <p class="text-color-400 mt-3">加载中...</p>
      </div>

      <div v-else-if="!items || items.length === 0" class="text-center py-12">
        <p class="text-color-300">暂无资源</p>
      </div>

      <div v-else class="space-y-3">
        <LocalResourceItem
          v-for="item in items"
          :key="item.id"
          :item="item"
          :check-status="getCheckStatus(item.id)"
          @open-tree="openTreeModal({ item, type: 'id' })"
          @open-modal="openModal({ item, type: 'id' })"
        />
      </div>

      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        @change="goToPage"
      />

      <Qrcode />

      <SiteFooter />

      <DownloadLinkPanel
        v-model:open="showModal"
        :title="modalTitle"
        :url="modalUrl"
        :loading="modalFetching"
        :error="modalError"
        @close="closeModal"
      />

      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showTreeModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            @click.self="closeTreeModal"
          >
            <div
              class="modal-content bg-color-100 rounded-xl max-w-lg w-full border border-color-300 shadow-2xl"
            >
              <div
                class="flex items-center justify-between py-2 px-3 border-b border-color-300"
              >
                <h3 class="font-medium text-color-300">
                  目录结构<span class="text-xs text-color-500"
                    >（最多显示5层、150个文件）</span
                  >
                </h3>
                <button
                  class="text-color-400 transition-all opacity-80 hover:opacity-100 hover:bg-color-300 rounded-md p-2"
                  @click="closeTreeModal"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
              <div class="p-4">
                <h4
                  v-if="treeModalTitle"
                  class="text-white text-sm font-medium truncate mb-3"
                >
                  {{ treeModalTitle }}
                </h4>
                <div v-if="treeModalLoading" class="text-center py-8">
                  <div
                    class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                  />
                  <p class="text-color-400 text-sm">{{ funnyText }}</p>
                </div>
                <div v-else-if="treeModalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ treeModalError }}</p>
                </div>
                <pre
                  v-else
                  class="bg-color-300 rounded-lg p-4 text-sm text-color-100 overflow-auto max-h-[60vh] whitespace-pre font-mono"
                  >{{ treeModalContent }}</pre
                >
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
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
