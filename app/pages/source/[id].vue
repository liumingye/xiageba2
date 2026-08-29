<script setup lang="ts">
import { ref, computed } from "vue";
import { Download, FolderOpen, Clock, Link, Loader2 } from "@lucide/vue";
import TopBar from "~/components/TopBar.vue";
import SiteFooter from "~/components/SiteFooter.vue";
import Qrcode from "~/components/Qrcode.vue";
import {
  getStorageTypeFriendShortFromFilter,
  type PanFilter,
} from "#shared/utils";
import { useMusicStore } from "~/stores/music";
import { marked } from "marked";
import type { ApiErrorResponse } from "~/utils/type";
import { useShare } from "@vueuse/core";

marked.setOptions({ gfm: true, breaks: true, async: false });

const { share, isSupported: isShareSupported } = useShare();

const route = useRoute();
const router = useRouter();

const sourceId = route.params.id as string;

interface Source {
  id: string;
  title: string;
  description: string;
  menu: string;
  createdAt: string;
  type: PanFilter;
  status: number;
}

interface SimilarItem {
  id: string;
  title: string;
  type: PanFilter;
}

interface SourceResponse {
  data: Source;
  similar?: SimilarItem[];
}

const shareUrl = () => {
  share({
    title: pageTitle.value,
    text: pageDescription.value,
    url: location.href,
  });
};

const {
  data: responseData,
  pending: loading,
  error: fetchApiError,
} = await useFetch<SourceResponse, ApiErrorResponse>(
  () => `/api/source/${sourceId}?similar=1`,
  {
    key: () => `source-${sourceId}`,
    lazy: true,
    server: true,
    default: (): SourceResponse => ({
      data: {
        id: sourceId,
        title: "",
        description: "",
        menu: "",
        createdAt: "",
        type: "other",
        status: 1,
      },
      similar: [],
    }),
  },
);

// ID 不存在时显示 404
watch(
  fetchApiError,
  (err) => {
    if (err) {
      throw createError({
        statusCode: err?.data?.statusCode || err.status || 404,
        message: err?.data?.message || err?.data?.error || "资源不存在",
      });
    }
  },
  { immediate: true },
);

const source = computed(() => responseData.value?.data);
const similarList = computed(() => responseData.value?.similar || []);

const renderedDescription = computed(() =>
  source.value?.description
    ? (marked.parse(source.value.description) as string)
    : "",
);

const pageTitle = computed(() => {
  if (source.value.title) {
    return `${source.value.title} - ${getStorageTypeFriendFromFilter(source.value.type)}资源分享 - 全盘搜`;
  }
  return "资源详情 - 全盘搜";
});

const pageDescription = computed(() => {
  if (source.value) {
    return `${source.value.title} - ${source.value.description || "网盘资源分享"}`;
  }
  return "全盘搜网盘资源详情页";
});

const pageKeywords = computed(() => {
  if (source.value) {
    return `${source.value.title}, 网盘资源, 夸克网盘, 百度网盘, 迅雷网盘, UC网盘`;
  }
  return "全盘搜, 网盘资源, 夸克网盘, 百度网盘, 迅雷网盘, UC网盘";
});

const canonicalUrl = `/source/${sourceId}`;

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
  meta: [{ name: "keywords", content: pageKeywords }],
  link: [{ rel: "canonical", href: canonicalUrl }],
});

const fetchingMenu = ref(false);
const fetchedMenu = ref("");
const menuError = ref("");

const fetchMenu = async () => {
  if (fetchingMenu.value) return;
  fetchingMenu.value = true;
  menuError.value = "";

  try {
    const res = await fetch(
      `/api/source/tree?id=${encodeURIComponent(sourceId)}`,
    );
    const data = await res.json();
    if (res.ok && data?.tree) {
      fetchedMenu.value = data.tree;
    } else {
      menuError.value = data.message || data.error || "获取文件菜单失败";
    }
  } catch {
    menuError.value = "获取文件菜单失败";
  } finally {
    fetchingMenu.value = false;
  }
};

const fetchingUrl = ref(false);
const fetchedUrl = ref("");
const fetchError = ref("");
// 搞笑加载文案（详情页自己调 funnyLoading）
const {
  currentText: funnyText,
  start: funnyStart,
  stop: funnyStop,
} = useFunnyLoading();

const fetchDirectUrl = async () => {
  if (fetchingUrl.value) return;
  fetchingUrl.value = true;
  fetchError.value = "";
  fetchedUrl.value = "";
  funnyStart();

  try {
    const res = await fetch("/api/source/geturl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sourceId }),
    });
    const data = await res.json();
    if (res.ok && data?.url) {
      fetchedUrl.value = data.url;
    } else {
      fetchError.value = data.message || data.error || "获取下载链接失败";
    }
  } catch (e) {
    fetchError.value = "获取下载链接失败";
  } finally {
    fetchingUrl.value = false;
    funnyStop();
  }
};

const goBack = () => {
  router.back();
};

const musicStore = useMusicStore();
onMounted(() => {
  musicStore.searchType = "resource";
});
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar />
    <div class="max-w-4xl mx-auto px-2">
      <main>
        <div
          v-if="loading"
          class="space-y-6"
          aria-busy="true"
          aria-label="正在加载"
        >
          <section class="card sm:p-6 p-3 animate-pulse">
            <div class="flex flex-col gap-6">
              <div class="w-full bg-color-300 rounded-xl h-32" />
              <div class="space-y-3">
                <div class="h-6 bg-color-300 rounded w-3/4" />
                <div class="h-4 bg-color-300 rounded w-1/2" />
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="source" class="space-y-6">
          <article class="card sm:p-6 p-3">
            <header
              class="flex items-start gap-4 mb-4 border-b border-color-300 pb-4"
            >
              <div class="flex-1 min-w-0">
                <h1
                  class="text-xl font-semibold mb-2 line-clamp-2 text-color-300"
                >
                  {{ source.title }}
                </h1>
                <div class="flex items-center gap-3 text-sm text-gray-500">
                  <span class="flex items-center gap-1">
                    <Link class="w-4 h-4" />
                    {{ getStorageTypeFriendFromFilter(source.type) }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Clock class="w-4 h-4" />
                    <NuxtTime
                      :datetime="source.createdAt"
                      year="numeric"
                      month="short"
                      day="numeric"
                      hour="numeric"
                      minute="numeric"
                      second="numeric"
                    />
                  </span>
                </div>
              </div>
            </header>

            <div v-if="source.description" class="mb-6">
              <div class="font-bold text-color-300 mb-3">
                <span class="text-lg">描述：</span>
                <div v-html="renderedDescription" />
              </div>
            </div>

            <section v-if="source.menu || fetchedMenu" class="mb-6">
              <div class="font-bold text-color-300 mb-3 text-lg">文件内容:</div>
              <pre
                class="bg-color-300 p-2 rounded-sm text-xs border border-color-300 max-h-56 overflow-auto text-color-300"
                >{{ fetchedMenu || source.menu }}</pre
              >
            </section>

            <section v-else-if="!source.menu" class="mb-6">
              <div class="font-bold text-color-300 mb-3 text-lg">文件内容:</div>
              <div
                class="flex flex-col items-center justify-center gap-3 bg-color-300 border border-color-300 rounded-sm p-6 text-center"
              >
                <p class="text-xs text-zinc-500">
                  该资源暂未生成文件菜单，点击按钮获取文件目录。
                </p>
                <button
                  class="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:bg-primary-400 disabled:cursor-not-allowed"
                  :disabled="fetchingMenu"
                  @click="fetchMenu"
                >
                  <Loader2 v-if="fetchingMenu" class="w-4 h-4 animate-spin" />
                  <FolderOpen v-else class="w-4 h-4" />
                  {{ fetchingMenu ? "获取中..." : "获取菜单" }}
                </button>
                <p v-if="menuError" class="text-xs text-red-400">
                  {{ menuError }}
                </p>
              </div>
            </section>

            <footer>
              <div v-if="source.status === 1" class="space-y-3">
                <h4 class="text-color-300">获取下载链接:</h4>

                <!-- 未获取前：提示 + 获取按钮 -->
                <div v-if="!fetchedUrl && !fetchingUrl" class="space-y-3">
                  <p class="text-xs text-zinc-500">
                    点击下方按钮获取网盘的下载链接，有效期为30分钟，请及时转存，失效后可重新获取。
                  </p>
                  <button
                    class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:bg-primary-400"
                    :disabled="fetchingUrl"
                    @click="fetchDirectUrl"
                  >
                    <Download v-if="!fetchingUrl" class="w-5 h-5" />
                    {{ fetchingUrl ? "获取中..." : "获取下载链接" }}
                  </button>
                  <p v-if="fetchError" class="text-xs text-red-400">
                    {{ fetchError }}
                  </p>
                </div>

                <!-- 获取中 / 已获取 / 报错 → 内嵌公共面板（不弹窗） -->
                <DownloadLinkPanel
                  v-else
                  :as-modal="false"
                  :title="source.title"
                  :url="fetchedUrl"
                  :loading="fetchingUrl"
                  :error="fetchError"
                  :hide-qr-on-mobile="false"
                />
              </div>
              <div v-else>
                <p class="text-center text-zinc-500">该资源已被删除或不存在</p>
              </div>
            </footer>
          </article>

          <section v-if="similarList.length" class="card md:p-6 p-3">
            <h4 class="text-color-300 mb-2 md:mb-4">相似资源</h4>
            <ul class="space-y-2">
              <li v-for="item in similarList" :key="item.id">
                <NuxtLink
                  :to="`/source/${item.id}`"
                  class="flex items-center gap-2 p-3 bg-color-300 hover:bg-color-400 rounded-lg transition-colors"
                >
                  <span
                    class="inline-flex items-center justify-center px-2 py-0.5 text-xs rounded bg-primary-500/90 text-white flex-shrink-0"
                  >
                    {{ getStorageTypeFriendShortFromFilter(item.type) }}
                  </span>
                  <span class="text-color-300 text-sm truncate">{{
                    item.title
                  }}</span>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section class="card sm:p-6 p-3 flex gap-2">
            <button
              class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-color-300 hover:bg-color-400 text-color-300 rounded-lg transition-colors"
              @click="goBack"
            >
              返回上一页
            </button>
            <ClientOnly>
              <button
                v-if="isShareSupported"
                class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-color-300 hover:bg-color-400 text-color-300 rounded-lg transition-colors"
                @click="shareUrl"
              >
                分享
              </button>
            </ClientOnly>
          </section>
        </div>

        <div v-else class="card p-8 text-center">
          <FolderOpen class="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h2 class="text-lg font-medium text-zinc-400 mb-2">资源不存在</h2>
          <p class="text-sm text-zinc-500">该资源可能已被删除或不存在</p>
          <button
            class="mt-4 px-6 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
            @click="goBack"
          >
            返回上一页
          </button>
        </div>
      </main>

      <Qrcode />

      <SiteFooter />
    </div>
  </div>
</template>
