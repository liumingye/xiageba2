<script setup lang="ts">
import SiteFooter from "~/components/SiteFooter.vue";
import TopBar from "~/components/TopBar.vue";
import Qrcode from "~/components/Qrcode.vue";
import { Loader2, X, QrCode, Clipboard, ExternalLink } from "@lucide/vue";
import { getTypeName } from "~/utils";
import type { SourceItem } from "~/components/LocalResourceItem.vue";
import { useMediaQuery, useClipboard } from "@vueuse/core";

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

const { submitPanCheck, getCheckStatus, stopPanCheck } = usePanCheck({
  enabled: true,
});

watch(
  [data],
  () => {
    if (import.meta.client) {
      stopPanCheck();
      const ids = (data.value.data as SourceItem[]).map((item) => item.id);
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
const modalQrCode = ref("");
const modalFetching = ref(false);
const modalError = ref("");

const { currentText: funnyText, bindFetching } = useFunnyLoading();
bindFetching([modalFetching, treeModalLoading]);

const setModalLoading = (title: string) => {
  modalTitle.value = title;
  modalUrl.value = "";
  modalQrCode.value = "";
  modalError.value = "";
  modalFetching.value = true;
  showModal.value = true;
};

const setModalResult = async (url: string) => {
  modalUrl.value = url;
  const qrcode = await import("qrcode");
  modalQrCode.value = await qrcode.toDataURL(url, {
    width: 200,
    margin: 2,
    color: { dark: "#000", light: "#fff" },
  });
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
      await setModalResult(data.url);
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
  showModal.value = false;
  modalTitle.value = "";
  modalUrl.value = "";
  modalQrCode.value = "";
};

const { success, error: showError } = useToast();
const { copy } = useClipboard();

const copyUrl = async (url: string) => {
  try {
    await copy(url);
    success("复制成功");
  } catch {
    showError("复制失败");
  }
};

const isMobile = useMediaQuery("(max-width: 768px)");
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
        <LocalResourceItem
          v-for="item in items"
          :key="item.id"
          :item="item"
          :check-status="getCheckStatus(item.id)"
          @click-title="router.push(`/source/${item.id}`)"
          @open-tree="openTreeModal({ item, type: 'id' })"
          @open-modal="openModal({ item, type: 'id' })"
        />
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

      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
            @click.self="closeModal"
          >
            <div
              class="flex flex-col max-h-[85vh] modal-content bg-dark-300 rounded-xl max-w-xl w-full border border-gray-700 shadow-2xl overflow-hidden"
            >
              <div
                class="flex items-center justify-between p-4 border-b border-gray-800"
              >
                <h3 class="text-white font-medium">获取下载链接</h3>
                <button
                  class="text-gray-400 hover:text-white transition-colors"
                  @click="closeModal"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>
              <div class="p-4 h-full overflow-auto">
                <div v-if="modalFetching" class="text-center py-8">
                  <div
                    class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
                  />
                  <p class="text-gray-400 text-sm">
                    {{ funnyText }}<br />请耐心等待，这可能需要几秒钟
                  </p>
                </div>
                <div v-else-if="modalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ modalError }}</p>
                </div>
                <div v-else-if="modalUrl" class="space-y-4">
                  <div class="flex flex-col items-center gap-4">
                    <template v-if="!isMobile">
                      <span
                        >可使用
                        <span class="text-primary-500"
                          >{{ getTypeName(getStorageType(modalUrl)) }}网盘</span
                        >
                        APP 扫码获取</span
                      >
                      <div v-if="modalQrCode" class="flex-shrink-0">
                        <img
                          :src="modalQrCode"
                          alt="下载链接二维码"
                          class="w-60 h-auto rounded-lg"
                        />
                      </div>
                      <div
                        v-else
                        class="w-28 h-28 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"
                      >
                        <QrCode class="w-10 h-10 text-gray-600" />
                      </div>
                    </template>
                    <p
                      class="w-full text-white font-medium text-center text-lg line-clamp-5"
                      :class="{ truncate: !isMobile }"
                    >
                      {{ modalTitle }}
                    </p>
                    <p class="text-center break-all">
                      资源地址：<a
                        :href="modalUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-primary-500"
                        >{{ modalUrl }}</a
                      >
                    </p>
                    <div class="w-full flex items-center justify-center gap-2">
                      <button
                        class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border h-9 px-4 py-2 flex-1 border-primary-600 bg-primary-800/10 hover:bg-primary-800/30 text-green-600 hover:text-white"
                        @click="copyUrl(modalUrl)"
                      >
                        <Clipboard class="w-4 h-4" />
                        复制链接
                      </button>
                      <a
                        :href="modalUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all h-9 px-4 py-2 flex-1 bg-primary-600 hover:bg-primary-700 text-white"
                      >
                        <ExternalLink class="w-4 h-4" />
                        打开链接
                      </a>
                    </div>
                    <p class="text-xs text-gray-400">
                      网盘链接有效期为30分钟，请及时转存，失效后可重新获取。<br />
                      文件内容请自行辨别，如发现违规请向网盘平台举报。本站仅供学习交流，无任何收费行为。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showTreeModal"
            class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            @click.self="closeTreeModal"
          >
            <div
              class="modal-content bg-dark-300 rounded-xl max-w-lg w-full border border-gray-700 shadow-2xl"
            >
              <div
                class="flex items-center justify-between p-4 border-b border-gray-800"
              >
                <h3 class="text-white font-medium">
                  目录结构<span class="text-xs text-gray-400"
                    >（最多显示5层、100个文件）</span
                  >
                </h3>
                <button
                  class="text-gray-400 hover:text-white transition-colors"
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
                  <p class="text-gray-400 text-sm">{{ funnyText }}</p>
                </div>
                <div v-else-if="treeModalError" class="text-center py-8">
                  <p class="text-red-400 text-sm">{{ treeModalError }}</p>
                </div>
                <pre
                  v-else
                  class="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 overflow-auto max-h-[60vh] whitespace-pre font-mono"
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
