<script setup lang="ts">
import { ref, computed } from "vue";
import { Download, FolderOpen, Clock, Link, Loader2 } from "@lucide/vue";
import Qrcode from "~/components/Qrcode.vue";
import {
  getStorageTypeFriendShortFromFilter,
  type PanFilter,
} from "#shared/utils";
import { useMusicStore } from "~/stores/music";
import { safeMarkdownPlugins } from "~/utils/comark";
import type { ApiErrorResponse } from "~/utils/type";
import { useShare } from "@vueuse/core";

const { share, isSupported: isShareSupported } = useShare();

const route = useRoute();
const router = useRouter();

// 使用响应式 computed，保证 SPA 内 /source/A → /source/B 切换时 useFetch 会重新请求
const sourceId = computed(() => route.params.id as string);

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
  () => `/api/source/${sourceId.value}?similar=1`,
  {
    key: () => `source-${sourceId.value}`,
    lazy: true,
    server: true,
    default: (): SourceResponse => ({
      data: {
        id: sourceId.value,
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

const canonicalUrl = `/source/${sourceId.value}`;

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
      `/api/source/tree?id=${encodeURIComponent(sourceId.value)}`,
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
      body: JSON.stringify({ id: sourceId.value }),
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
  <div v-if="loading" class="space-y-6" aria-busy="true" aria-label="正在加载">
    <UCard
      :ui="{
        body: 'sm:p-6 p-3 animate-pulse',
      }"
    >
      <template #header>
        <div class="flex flex-col gap-6">
          <div class="space-y-3">
            <div class="h-6 bg-elevated rounded w-1/2" />
            <div class="h-4 bg-elevated rounded w-1/4" />
          </div>
        </div>
      </template>

      <div class="flex flex-col gap-3">
        <div class="h-6 bg-elevated rounded w-1/4" />
        <div class="w-full bg-elevated rounded-xl h-32" />
      </div>

      <template #footer>
        <div class="flex flex-col gap-3">
          <div class="h-4 bg-elevated rounded w-1/4" />
          <div class="h-12 bg-elevated rounded" />
        </div>
      </template>
    </UCard>
  </div>

  <div v-else-if="source" class="space-y-6">
    <UCard
      :ui="{
        body: 'flex flex-col gap-6',
      }"
    >
      <template #header>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-semibold mb-2 line-clamp-2">
            {{ source.title }}
          </h1>
          <div class="flex items-center gap-3 text-sm text-gray-500">
            <span class="flex items-center gap-1">
              <Link class="size-4" />
              {{ getStorageTypeFriendFromFilter(source.type) }}
            </span>
            <span class="flex items-center gap-1">
              <Clock class="size-4" />
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
      </template>

      <div class="wrap-break-word" v-if="source.description">
        <Markdown
          :value="source.description"
          :plugins="safeMarkdownPlugins"
          class="*:first:mt-0 *:last:mb-0"
        />
      </div>

      <section v-if="source.menu || fetchedMenu">
        <div class="flex items-center justify-between mb-3">
          <div class="font-bold">文件内容:</div>
          <UButton
            v-if="source.menu"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="fetchingMenu"
            :disabled="fetchingMenu"
            @click="fetchMenu"
          >
            {{ fetchingMenu ? "获取中..." : "获取最新目录" }}
          </UButton>
        </div>
        <pre
          class="bg-elevated p-2 rounded-sm text-xs border border-muted max-h-56 overflow-auto text-toned"
          >{{ fetchedMenu || source.menu }}</pre
        >
        <p v-if="menuError" class="text-xs text-red-400 mt-1">
          {{ menuError }}
        </p>
      </section>

      <section v-else-if="!source.menu">
        <div class="font-bold mb-3">文件内容:</div>
        <div
          class="flex flex-col items-center justify-center gap-3 bg-elevated border border-muted rounded-sm p-6 text-center"
        >
          <p class="text-sm text-muted">
            该资源暂未生成文件菜单，点击按钮获取文件目录。
          </p>
          <UButton
            size="lg"
            :disabled="fetchingMenu"
            @click="fetchMenu"
            icon="i-lucide-folder"
            :loading="fetchingMenu"
          >
            {{ fetchingMenu ? "获取中..." : "获取菜单" }}
          </UButton>
          <p v-if="menuError" class="text-xs text-red-400">
            {{ menuError }}
          </p>
        </div>
      </section>

      <template #footer>
        <div v-if="source.status === 1" class="space-y-3">
          <h4>获取下载链接:</h4>

          <div v-if="!fetchedUrl && !fetchingUrl" class="space-y-3">
            <p class="text-xs text-zinc-500">
              点击下方按钮获取网盘的下载链接，有效期为30分钟，请及时转存，失效后可重新获取。
            </p>
            <UButton
              icon="i-lucide-download"
              block
              :disabled="fetchingUrl"
              @click="fetchDirectUrl"
              class="h-12"
            >
              获取下载链接
            </UButton>
            <p v-if="fetchError" class="text-xs text-red-400">
              {{ fetchError }}
            </p>
          </div>

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
          <p class="text-center text-error">该资源已被删除或不存在</p>
        </div>
      </template>
    </UCard>

    <UCard
      v-if="similarList.length"
      :ui="{
        body: 'md:p-6 p-3',
      }"
    >
      <template #header>
        <h4>相似资源</h4>
      </template>
      <ul class="space-y-2">
        <li v-for="item in similarList" :key="item.id">
          <NuxtLink
            :to="`/source/${item.id}`"
            class="flex items-center gap-2 p-3 bg-elevated hover:bg-accented rounded-lg transition-colors"
          >
            <UBadge class="shrink-0">{{
              getStorageTypeFriendShortFromFilter(item.type)
            }}</UBadge>
            <span class="text-sm truncate">{{ item.title }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UCard>

    <UCard
      :ui="{
        body: 'sm:p-6 p-3 flex gap-2',
      }"
    >
      <UButton
        icon="i-lucide-arrow-left"
        block
        :disabled="fetchingUrl"
        @click="goBack"
        class="h-12"
      >
        返回上一页
      </UButton>

      <ClientOnly>
        <UButton
          v-if="isShareSupported"
          icon="i-lucide-share"
          block
          :disabled="fetchingUrl"
          @click="shareUrl"
          class="h-12"
        >
          分享本页
        </UButton>
      </ClientOnly>
    </UCard>
  </div>

  <div v-else class="card p-8 text-center space-y-4">
    <FolderOpen class="size-16 text-toned mx-auto" />
    <h2 class="text-lg font-medium text-toned">资源不存在</h2>
    <p class="text-sm text-muted">该资源可能已被删除或不存在</p>
    <UButton size="lg" @click="goBack"> 返回上一页 </UButton>
  </div>
</template>
