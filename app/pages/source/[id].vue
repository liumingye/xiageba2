<script setup lang="ts">
import { ref, computed } from "vue";
import { useClipboard, useMediaQuery } from "@vueuse/core";
import {
  Download,
  ExternalLink,
  FolderOpen,
  Clock,
  Link,
  QrCode,
  Loader2,
  Clipboard,
} from "@lucide/vue";
import TopBar from "~/components/TopBar.vue";
import SiteFooter from "~/components/SiteFooter.vue";
import Qrcode from "~/components/Qrcode.vue";
import { getTypeName } from "~/utils/index";
import { useMusicStore } from "~/stores/music";

const { copy } = useClipboard();

const toast = useToast();

const copyFetchedUrl = async () => {
  if (!fetchedUrl.value) return;
  try {
    await copy(fetchedUrl.value);
    toast.success("链接已复制");
  } catch {
    toast.error("复制链接失败");
  }
};

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const sourceId = route.params.id as string;

interface Source {
  id: string;
  title: string;
  description: string;
  menu: string;
  createdAt: string;
  type: string;
}

const { data: sourceData, pending: loading } = await useFetch<{ data: Source }>(
  () => `/api/source/${sourceId}`,
  {
    key: () => `source-${sourceId}`,
    lazy: true,
    server: true,
    default: () => ({
      data: {
        id: sourceId,
        title: "",
        description: "",
        menu: "",
        createdAt: "",
        type: "",
      },
    }),
  },
);

const source = computed(() => sourceData.value?.data);

const pageTitle = computed(() => {
  if (source.value) {
    return `${source.value.title} - ${getTypeName(source.value.type)}资源分享 - 下歌吧`;
  }
  return "资源详情 - 下歌吧";
});

const pageDescription = computed(() => {
  if (source.value) {
    return `${source.value.title} - ${source.value.description || "网盘资源分享"}`;
  }
  return "下歌吧网盘资源详情页";
});

const pageKeywords = computed(() => {
  if (source.value) {
    return `${source.value.title}, 网盘资源, 夸克网盘, 百度网盘, 迅雷网盘, UC网盘`;
  }
  return "下歌吧, 网盘资源, 夸克网盘, 百度网盘";
});

const canonicalUrl = `/source/${sourceId}`;

useHead({
  title: pageTitle,
  meta: [
    { name: "description", content: pageDescription },
    { name: "keywords", content: pageKeywords },
    { name: "robots", content: "index, follow" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "author", content: "下歌吧" },
    { name: "theme-color", content: "#0f172a" },

    { property: "og:type", content: "article" },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: pageDescription },
    { property: "og:site_name", content: "下歌吧" },
    { property: "og:url", content: canonicalUrl },

    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: pageTitle },
    { name: "twitter:description", content: pageDescription },
  ],
  link: [{ rel: "canonical", href: canonicalUrl }],
});

const fetchingUrl = ref(false);
const fetchedUrl = ref("");
const fetchError = ref("");
const qrCodeUrl = ref("");

const fetchDirectUrl = async () => {
  if (fetchingUrl.value) return;
  fetchingUrl.value = true;
  fetchError.value = "";
  fetchedUrl.value = "";
  qrCodeUrl.value = "";

  try {
    const res = await fetch("/api/source/geturl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sourceId }),
    });
    const data = await res.json();
    if (res.ok && data) {
      fetchedUrl.value = data.url;
      // 生成二维码
      const qrcode = await import("qrcode");
      qrCodeUrl.value = await qrcode.toDataURL(fetchedUrl.value, {
        width: 200,
        margin: 2,
        color: { dark: "#000", light: "#fff" },
      });
    } else {
      fetchError.value = data.message || "获取下载链接失败";
    }
  } catch (e) {
    fetchError.value = "获取下载链接失败";
  } finally {
    fetchingUrl.value = false;
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
  <div class="min-h-screen bg-dark-300 py-4 md:py-6 px-2">
    <div class="max-w-3xl mx-auto">
      <TopBar />

      <main>
        <div
          v-if="loading"
          class="space-y-6"
          aria-busy="true"
          aria-label="正在加载"
        >
          <section class="card p-6 animate-pulse">
            <div class="flex flex-col gap-6">
              <div class="w-full bg-gray-700 rounded-xl h-32" />
              <div class="space-y-3">
                <div class="h-6 bg-gray-700 rounded w-3/4" />
                <div class="h-4 bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="source" class="space-y-6">
          <article class="card p-6">
            <header class="flex items-start gap-4 mb-6">
              <div class="flex-1 min-w-0">
                <h1 class="text-xl font-semibold text-white mb-2 line-clamp-2">
                  {{ source.title }}
                </h1>
                <div class="flex items-center gap-3 text-sm text-gray-500">
                  <span class="flex items-center gap-1">
                    <Link class="w-4 h-4" />
                    {{ getTypeName(source.type) }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Clock class="w-4 h-4" />
                    {{ new Date(source.createdAt).toLocaleString() }}
                  </span>
                </div>
              </div>
            </header>

            <div v-if="source.description" class="mb-6">
              <p class="text-gray-400 text-sm leading-relaxed">
                描述：{{ source.description }}
              </p>
            </div>

            <section v-if="source.menu">
              <div class="mb-2">文件内容:</div>
              <pre
                class="bg-gray-700 p-2 rounded-sm text-sm border border-gray-600 max-h-56 overflow-auto"
                >{{ source.menu }}</pre
              >
            </section>

            <footer class="border-t border-gray-800 pt-6">
              <h3 class="font-medium text-gray-300 mb-4">获取下载链接:</h3>
              <div class="space-y-3">
                <div v-if="!fetchedUrl" class="space-y-3">
                  <p class="text-xs text-gray-500">
                    点击下方按钮获取网盘的下载链接，有效期为30分钟，请及时转存。
                  </p>
                  <button
                    class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:bg-primary-400"
                    :disabled="fetchingUrl"
                    @click="fetchDirectUrl"
                  >
                    <Loader2 v-if="fetchingUrl" class="w-5 h-5 animate-spin" />
                    <Download v-else class="w-5 h-5" />
                    {{ fetchingUrl ? "获取中..." : "获取下载链接" }}
                  </button>
                  <p v-if="fetchError" class="text-xs text-red-400">
                    {{ fetchError }}
                  </p>
                </div>
                <div v-else class="space-y-3">
                  <div class="flex flex-col items-center gap-4">
                    <span
                      >可使用
                      <span class="text-primary-500">{{
                        getTypeName(source.type)
                      }}网盘</span>
                      APP 扫码获取</span
                    >
                    <div v-if="qrCodeUrl" class="flex-shrink-0">
                      <img
                        :src="qrCodeUrl"
                        alt="下载链接二维码"
                        class="w-60 h-auto rounded-lg mx-auto"
                      />
                    </div>
                    <div
                      v-else
                      class="w-32 h-32 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"
                    >
                      <QrCode class="w-12 h-12 text-gray-600" />
                    </div>
                    <p
                      class="w-full text-white font-medium truncate text-center text-lg"
                    >
                      {{ source.title }}
                    </p>
                    <p class="text-center break-all">
                      资源地址：<a
                        :href="fetchedUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-primary-500"
                        >{{ fetchedUrl }}</a
                      >
                    </p>
                    <div class="w-full flex items-center justify-center gap-2">
                      <button
                        class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border h-9 px-4 py-2 flex-1 border-primary-600 bg-primary-800/10 hover:bg-primary-800/30 text-green-600 hover:text-white"
                        @click="copyFetchedUrl"
                      >
                        <Clipboard class="w-4 h-4" />
                        复制链接
                      </button>
                      <a
                        :href="fetchedUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all h-9 px-4 py-2 flex-1 bg-primary-600 hover:bg-primary-700 text-white"
                      >
                        <ExternalLink class="w-4 h-4" />
                        打开链接
                      </a>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">
                      本站链接由程序自动收集自公开网盘，不存储、不传播任何文件，跳转链接指向网盘官网。<br />
                      文件内容请自行辨别，如发现违规请向网盘平台举报。本站仅供学习交流，无任何收费行为。
                    </p>
                  </div>
                </div>
              </div>
            </footer>
          </article>

          <section class="card p-6">
            <button
              class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
              @click="goBack"
            >
              返回上一页
            </button>
          </section>
        </div>

        <div v-else class="card p-8 text-center">
          <FolderOpen class="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 class="text-lg font-medium text-gray-400 mb-2">资源不存在</h2>
          <p class="text-sm text-gray-500">该资源可能已被删除或不存在</p>
          <button
            class="mt-4 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
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
