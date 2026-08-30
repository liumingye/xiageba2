<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useEventListener, useMediaQuery, useMounted } from "@vueuse/core";
import {
  Download,
  Play,
  Pause,
  Disc3,
  Key,
  MicVocal,
  Search,
} from "@lucide/vue";
import TopBar from "~/components/TopBar.vue";
import DownloadModal from "~/components/DownloadModal.vue";
import SiteFooter from "~/components/SiteFooter.vue";
import type { Music } from "~/stores/music";
import { useMusicStore } from "~/stores/music";
import { extractPwd } from "~/utils";
import type { ApiErrorResponse } from "~/utils/type";

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

// 使用响应式 computed，保证 SPA 内 /music/A → /music/B 切换时 useFetch 会重新请求
const musicId = computed(() => route.params.id as string);

const {
  data: music,
  pending: loading,
  error: fetchApiError,
} = await useFetch<Music, ApiErrorResponse>(
  () => `/api/music/${musicId.value}`,
  {
    key: () => `music-${musicId.value}`,
    lazy: true,
    server: true,
    default: () => {
      return {
        id: musicId.value,
        title: "",
        artist: "",
        album: "",
        cover: "",
        lyrics: "",
        playUrl: "",
        downloads: [],
      };
    },
  },
);

// ID 不存在时显示 404
watch(
  fetchApiError,
  (err) => {
    if (err) {
      throw createError({
        statusCode: err?.data?.statusCode || err.status || 404,
        message: err?.data?.message || err?.data?.error || "音乐不存在",
      });
    }
  },
  { immediate: true },
);

const pageTitle = computed(() => {
  let title = [];
  if (music.value.title) {
    title.push(music.value.title);
  }
  if (music.value.artist) {
    title.push(music.value.artist);
  }
  if (music.value.album) {
    title.push(`《${music.value.album}》`);
  }
  if (title.length === 0) {
    title.push("全盘搜 - 免费下载高品质音乐");
  }
  return `${title.join(" - ")} - 全盘搜`;
});

const pageDescription = computed(() => {
  if (music.value) {
    const parts = [music.value.title, music.value.artist];
    if (music.value.album) parts.push(music.value.album);
    return `${parts.join(" - ")} - 在全盘搜免费下载高品质MP3与FLAC音乐，支持在线试听。`;
  }
  return "全盘搜，提供高品质MP3与FLAC音乐免费下载，支持在线试听、搜索与歌词展示。";
});

const pageKeywords = computed(() => {
  if (music.value) {
    const parts = [music.value.title, music.value.artist];
    if (music.value.album) parts.push(music.value.album);
    return `${parts.join(", ")}, 音乐下载, FLAC, MP3, 无损音乐, 全盘搜`;
  }
  return "全盘搜, 音乐下载, FLAC, MP3, 无损音乐, 在线试听, 歌词";
});

const formattedLyrics = computed(() => {
  if (!music.value?.lyrics) return [];
  return music.value.lyrics.split("\n").filter((line: string) => line.trim());
});

const canonicalUrl = `/music/${musicId.value}`;

const jsonLd = computed(() => {
  if (!music.value) return null;
  const data: any = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: music.value.title,
    byArtist: {
      "@type": "MusicGroup",
      name: music.value.artist,
    },
    inAlbum: {
      "@type": "MusicAlbum",
      name: music.value.album || music.value.title,
    },
    image: music.value.cover || "",
    url: canonicalUrl,
  };
  if (formattedLyrics.value.length > 0) {
    data.lyrics = formattedLyrics.value.join(" ");
  }
  return data;
});

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  referrer: "same-origin",
  ogType: "music.song",
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  ogUrl: canonicalUrl,
  ogImage: music.value?.cover || "",
  twitterTitle: pageTitle,
  twitterDescription: pageDescription,
  twitterImage: music.value?.cover || "",
});

useHead({
  meta: [
    { name: "keywords", content: pageKeywords },
    { property: "og:music:musician", content: music.value?.artist || "" },
    { property: "og:music:album", content: music.value?.album || "" },
  ],
  link: [{ rel: "canonical", href: canonicalUrl }],
  script: jsonLd.value
    ? [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify(jsonLd.value),
        },
      ]
    : [],
});

const showFeedbackModal = ref(false);
const showDownloadModal = ref(false);
const isPlaying = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);
const selectedDownload = ref<DownloadOption | null>(null);

// 没有下载链接时，跳转全网搜网盘资源（关键词：歌名 + 歌手）
const searchNetdisk = () => {
  if (!music.value) return;
  const keyword = [music.value.title, music.value.artist]
    .filter(Boolean)
    .join(" ");
  router.push({
    path: "/search",
    query: { type: "resource", q: keyword },
  });
};

useEventListener(audioElement, "ended", () => {
  isPlaying.value = false;
});

useEventListener(audioElement, "error", () => {
  isPlaying.value = false;
  alert("播放失败，请检查网络或播放地址");
});

onUnmounted(() => {
  if (audioElement.value) {
    audioElement.value.pause();
    audioElement.value.src = "";
    audioElement.value = null;
  }
});

const togglePlay = () => {
  if (!music.value?.playUrl) {
    alert("暂无播放地址");
    return;
  }

  if (isPlaying.value) {
    if (audioElement.value) {
      audioElement.value.pause();
    }
    isPlaying.value = false;
  } else {
    if (!audioElement.value) {
      audioElement.value = new Audio(music.value.playUrl);
      audioElement.value.preload = "metadata";
    }
    audioElement.value.play();
    isPlaying.value = true;
  }
};

const openDownloadModal = (download: DownloadOption) => {
  showDownloadModal.value = true;
  selectedDownload.value = download;
};

const closeDownloadModal = () => {
  showDownloadModal.value = false;
};

const musicStore = useMusicStore();
onMounted(() => {
  musicStore.searchType = "music";
});

const isMobile = useMediaQuery("(max-width: 639px)");

const isMounted = useMounted();
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar />
    <div class="max-w-4xl mx-auto px-2">
      <main>
        <!-- 骨架屏 -->
        <div
          v-if="loading"
          class="space-y-6"
          aria-busy="true"
          aria-label="正在加载"
        >
          <section class="card p-6 animate-pulse">
            <div class="flex flex-col sm:flex-row gap-6 items-center">
              <div class="w-48 h-48 bg-zinc-700 rounded-xl" />
              <div class="flex-1 w-full space-y-3">
                <div class="h-6 bg-zinc-700 rounded w-3/4 mx-auto sm:mx-0" />
                <div class="h-4 bg-zinc-700 rounded w-1/2 mx-auto sm:mx-0" />
                <div
                  class="flex flex-wrap gap-3 justify-center sm:justify-start mt-4"
                >
                  <div class="h-10 bg-zinc-700 rounded-lg w-28" />
                  <div class="h-10 bg-zinc-700 rounded-lg w-28" />
                </div>
              </div>
            </div>
          </section>

          <section class="card p-6 animate-pulse">
            <div class="h-5 bg-zinc-700 rounded w-1/4 mb-4" />
            <div class="space-y-2">
              <div
                v-for="i in 5"
                :key="i"
                class="h-4 bg-zinc-700 rounded w-3/4"
              />
            </div>
          </section>
        </div>

        <article
          v-else-if="music"
          class="space-y-6"
          itemscope
          itemtype="https://schema.org/MusicRecording"
        >
          <meta itemprop="name" :content="music.title" />
          <meta itemprop="byArtist" :content="music.artist" />
          <meta itemprop="inAlbum" :content="music.album" />
          <meta itemprop="image" :content="music.cover || ''" />
          <meta itemprop="url" :content="canonicalUrl" />

          <section class="card p-6">
            <div class="flex flex-col sm:flex-row gap-6 items-center">
              <div class="relative flex-shrink-0">
                <img
                  :src="music.cover || config.app.baseURL + 'img/cover.png'"
                  :alt="music.title"
                  class="w-48 h-48 rounded-xl object-cover"
                  loading="lazy"
                  decoding="async"
                  @error="
                    ($event.target as HTMLImageElement).src =
                      config.app.baseURL + 'img/cover.png'
                  "
                />
                <div
                  v-if="music.playUrl"
                  class="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  @click="togglePlay"
                  role="button"
                  tabindex="0"
                  aria-label="播放/暂停"
                  @keydown.enter="togglePlay"
                >
                  <div
                    class="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center text-white"
                  >
                    <Play v-if="!isPlaying" class="w-8 h-8 ml-1" />
                    <Pause v-else class="w-8 h-8" />
                  </div>
                </div>
              </div>

              <div
                class="flex-1 flex flex-col justify-center items-center sm:items-start text-center sm:text-left"
              >
                <h1
                  class="text-2xl sm:text-3xl font-bold mb-2"
                  :title="music.title"
                >
                  {{ music.title }}
                </h1>
                <p
                  class="text-gray-500 mb-4"
                  itemprop="byArtist"
                  :title="music.artist"
                >
                  <button
                    class="hover:text-primary-400 transition-colors"
                    @click="
                      router.push(
                        `/search?q=${encodeURIComponent(music.artist)}`,
                      )
                    "
                  >
                    {{ music.artist }}
                  </button>
                </p>

                <div
                  class="flex flex-wrap gap-3 justify-center sm:justify-start"
                >
                  <a
                    v-for="(download, index) in music.downloads"
                    :key="index"
                    class="cursor-pointer flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors text-white"
                    :aria-label="`${download.quality}下载`"
                    :target="isMobile && isMounted ? '_blank' : undefined"
                    :href="isMobile && isMounted ? download.url : undefined"
                    @click="!isMobile && openDownloadModal(download)"
                    :title="`${download.quality}下载`"
                  >
                    <Download class="w-5 h-5" />
                    {{ download.quality }}
                    <template
                      v-if="isMobile && isMounted && extractPwd(download.url)"
                    >
                      (提取码: {{ extractPwd(download.url) }})
                    </template>
                  </a>
                  <button
                    v-if="music.downloads.length === 0"
                    class="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors text-white"
                    @click="searchNetdisk"
                    aria-label="搜网盘"
                  >
                    <Search class="w-5 h-5" />
                    搜网盘
                  </button>
                  <button
                    v-if="music.playUrl"
                    class="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors text-white"
                    @click="togglePlay"
                    aria-label="播放或暂停"
                  >
                    <Play v-if="!isPlaying" class="w-5 h-5" />
                    <Pause v-else class="w-5 h-5" />
                    {{ isPlaying ? "暂停" : "播放" }}
                  </button>
                </div>
                <button
                  @click="showFeedbackModal = true"
                  aria-label="反馈问题"
                  class="text-gray-500 mt-2 sm:hidden block"
                >
                  反馈问题
                </button>
              </div>
            </div>
          </section>

          <section
            v-if="music.album"
            class="card p-4 md:p-6"
            itemscope
            itemtype="https://schema.org/MusicAlbum"
          >
            <div
              class="text-lg font-medium flex items-center gap-2 text-color-400 mb-4"
            >
              <Disc3 class="w-5 h-5" />
              <span>所属专辑</span>
            </div>
            <p class="text-lg" itemprop="name">{{ music.album }}</p>
          </section>

          <section
            class="card p-4 md:p-6"
            itemscope
            itemtype="https://schema.org/lyrics"
          >
            <div
              class="text-lg font-medium flex items-center gap-2 text-color-400 mb-4"
            >
              <MicVocal class="w-5 h-5" />
              <span>歌词</span>
            </div>
            <div
              v-if="formattedLyrics.length > 0"
              class="space-y-2"
              itemprop="lyrics"
            >
              <p
                v-for="(line, index) in formattedLyrics"
                :key="index"
                class="py-1"
              >
                {{ line }}
              </p>
            </div>
            <p v-else class="text-zinc-500 text-center py-8">暂无歌词</p>
          </section>
        </article>

        <div v-else class="text-center py-20">
          <p class="text-zinc-500">音乐不存在</p>
          <button
            class="mt-4 text-primary-500 hover:text-primary-400 transition-colors"
            @click="navigateTo('/')"
          >
            返回首页
          </button>
        </div>
      </main>

      <Qrcode />

      <DownloadModal
        v-if="!isMobile"
        :show="showDownloadModal"
        :music="music"
        :selectedDownload="selectedDownload"
        @close="closeDownloadModal"
      />

      <FeedbackModal
        v-else-if="music?.id"
        :show="showFeedbackModal"
        :music-id="music.id"
        @close="showFeedbackModal = false"
      />

      <SiteFooter />
    </div>
  </div>
</template>
