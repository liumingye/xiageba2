<script setup lang="ts">
import { ref, computed } from "vue";
import { Download, Play, Pause, Disc3 } from "@lucide/vue";
import TopBar from "~/components/TopBar.vue";
import DownloadModal from "~/components/DownloadModal.vue";
import SiteFooter from "~/components/SiteFooter.vue";
import type { Music } from "~/stores/music";

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const musicId = route.params.id as string;

const { data: music, pending: loading } = await useFetch<Music>(
  () => `/api/music/${musicId}`,
  {
    key: () => `music-${musicId}`,
    lazy: true,
    server: true,
    default: () => {
      return {
        id: musicId,
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

const pageTitle = computed(() => {
  if (music.value) {
    return `${music.value.title} - ${music.value.artist} - 下歌吧`;
  }
  return "下歌吧 - 免费下载高品质音乐";
});

const pageDescription = computed(() => {
  if (music.value) {
    const parts = [music.value.title, music.value.artist];
    if (music.value.album) parts.push(music.value.album);
    return `${parts.join(" - ")} - 在下歌吧免费下载高品质MP3与FLAC音乐，支持在线试听。`;
  }
  return "下歌吧，提供高品质MP3与FLAC音乐免费下载，支持在线试听、搜索与歌词展示。";
});

const pageKeywords = computed(() => {
  if (music.value) {
    const parts = [music.value.title, music.value.artist];
    if (music.value.album) parts.push(music.value.album);
    return `${parts.join(", ")}, 音乐下载, FLAC, MP3, 无损音乐, 下歌吧`;
  }
  return "下歌吧, 音乐下载, FLAC, MP3, 无损音乐, 在线试听, 歌词";
});

const formattedLyrics = computed(() => {
  if (!music.value?.lyrics) return [];
  return music.value.lyrics.split("\n").filter((line: string) => line.trim());
});

const canonicalUrl = `/music/${musicId}`;

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

useHead({
  title: pageTitle,
  meta: [
    { name: "description", content: pageDescription },
    { name: "keywords", content: pageKeywords },
    { name: "robots", content: "index, follow" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "author", content: "下歌吧" },
    { name: "theme-color", content: "#0f172a" },

    { property: "og:type", content: "music.song" },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: pageDescription },
    { property: "og:site_name", content: "下歌吧" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:image", content: () => music.value?.cover || "" },
    { property: "og:music:musician", content: () => music.value?.artist || "" },
    { property: "og:music:album", content: () => music.value?.album || "" },

    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: pageTitle },
    { name: "twitter:description", content: pageDescription },
    { name: "twitter:image", content: () => music.value?.cover || "" },
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

const showDownloadModal = ref(false);
const isPlaying = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);

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
      audioElement.value.addEventListener("ended", () => {
        isPlaying.value = false;
      });
      audioElement.value.addEventListener("error", () => {
        isPlaying.value = false;
        alert("播放失败，请检查网络或播放地址");
      });
    }
    audioElement.value.play();
    isPlaying.value = true;
  }
};

const openDownloadModal = () => {
  showDownloadModal.value = true;
};

const closeDownloadModal = () => {
  showDownloadModal.value = false;
};
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-4 md:py-6 px-2">
    <div class="max-w-3xl mx-auto">
      <TopBar />

      <main>
        <!-- 骨架屏：数据还没回来时展示 -->
        <div
          v-if="loading"
          class="space-y-6"
          aria-busy="true"
          aria-label="正在加载"
        >
          <section class="card p-6 animate-pulse">
            <div class="flex flex-col sm:flex-row gap-6 items-center">
              <div class="w-48 h-48 bg-gray-700 rounded-xl" />
              <div class="flex-1 w-full space-y-3">
                <div class="h-6 bg-gray-700 rounded w-3/4 mx-auto sm:mx-0" />
                <div class="h-4 bg-gray-700 rounded w-1/2 mx-auto sm:mx-0" />
                <div
                  class="flex flex-wrap gap-3 justify-center sm:justify-start mt-4"
                >
                  <div class="h-10 bg-gray-700 rounded-lg w-28" />
                  <div class="h-10 bg-gray-700 rounded-lg w-28" />
                </div>
              </div>
            </div>
          </section>

          <section class="card p-6 animate-pulse">
            <div class="h-5 bg-gray-700 rounded w-1/4 mb-4" />
            <div class="space-y-2">
              <div
                v-for="i in 5"
                :key="i"
                class="h-4 bg-gray-700 rounded w-3/4"
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
                    class="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center"
                  >
                    <Play v-if="!isPlaying" class="w-8 h-8 text-white ml-1" />
                    <Pause v-else class="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>

              <div
                class="flex-1 flex flex-col justify-center items-center sm:items-start text-center sm:text-left"
              >
                <h1 class="text-2xl sm:text-3xl font-bold text-white mb-2">
                  {{ music.title }}
                </h1>
                <p class="text-gray-400 mb-4" itemprop="byArtist">
                  <button
                    class="hover:text-primary-400 transition-colors"
                    @click="router.push(`/search?q=${encodeURIComponent(music.artist)}`)"
                  >
                    {{ music.artist }}
                  </button>
                </p>

                <div class="flex flex-wrap gap-3 justify-center">
                  <button
                    class="flex items-center gap-2 px-14 sm:px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                    @click="openDownloadModal"
                    aria-label="下载歌曲"
                  >
                    <Download class="w-5 h-5" />
                    点击下载
                  </button>
                  <button
                    v-if="music.playUrl"
                    class="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    @click="togglePlay"
                    aria-label="播放或暂停"
                  >
                    <Play v-if="!isPlaying" class="w-5 h-5" />
                    <Pause v-else class="w-5 h-5" />
                    {{ isPlaying ? "暂停" : "播放" }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section
            v-if="music.album"
            class="card p-6"
            itemscope
            itemtype="https://schema.org/MusicAlbum"
          >
            <div class="flex items-center gap-2 text-gray-400 mb-4">
              <Disc3 class="w-5 h-5" />
              <span>所属专辑</span>
            </div>
            <p class="text-white text-lg" itemprop="name">{{ music.album }}</p>
          </section>

          <section class="card p-6">
            <h3 class="text-lg font-medium text-white mb-4">歌词</h3>
            <div
              v-if="formattedLyrics.length > 0"
              class="space-y-2 text-gray-300"
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
            <p v-else class="text-gray-500 text-center py-8">暂无歌词</p>
          </section>
        </article>

        <div v-else class="text-center py-20">
          <p class="text-gray-500">音乐不存在</p>
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
        :show="showDownloadModal"
        :music="music"
        @close="closeDownloadModal"
      />

      <SiteFooter />
    </div>
  </div>
</template>
