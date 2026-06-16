<script setup lang="ts">
import { ref, computed } from "vue";
import { ArrowLeft, Home, Download, Play, Pause, Disc3 } from "lucide-vue-next";
import SearchBar from "~/components/SearchBar.vue";
import DownloadModal from "~/components/DownloadModal.vue";
import type { Music } from "~/stores/music";
import { useBackHistory } from "~/composables/useBackHistory";

const route = useRoute();
const router = useRouter();

const musicId = route.params.id as string;

const { data: music, pending: loading } = await useAsyncData(
  "music-" + musicId,
  async () => {
    try {
      const res = await $fetch<Music>(`/api/music/${musicId}`);
      return res;
    } catch (e) {
      return null;
    }
  },
  { lazy: false },
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

const canonicalUrl = computed(() => {
  if (typeof window !== "undefined") {
    return window.location.href;
  }
  return `/music/${musicId}`;
});

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
    url: canonicalUrl.value,
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
  link: [
    { rel: "canonical", href: canonicalUrl },
  ],
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

const { hasBackHistory } = useBackHistory();

const goBack = () => {
  if (hasBackHistory.value) {
    router.back();
  } else {
    router.push("/");
  }
};

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
      audioElement.value.addEventListener("ended", () => {
        isPlaying.value = false;
      });
      audioElement.value.addEventListener("error", () => {
        isPlaying.value = false;
        alert("播放失败，请检查播放地址是否有效");
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
  <div class="min-h-screen bg-dark-300 py-6 px-4">
    <nav class="max-w-3xl mx-auto">
      <div class="flex items-center gap-4 mb-6">
        <button
          class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          @click="goBack"
          :aria-label="hasBackHistory ? '返回' : '主页'"
        >
          <component
            :is="hasBackHistory ? ArrowLeft : Home"
            class="w-5 h-5 text-gray-400"
          />
        </button>
        <SearchBar />
      </div>
    </nav>

    <main class="max-w-3xl mx-auto">
      <div v-if="loading" class="flex justify-center py-20">
        <div
          class="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="加载中"
        ></div>
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
                :src="music.cover || '/img/cover.png'"
                :alt="music.title"
                class="w-48 h-48 rounded-xl object-cover"
                loading="lazy"
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
                {{ music.artist }}
              </p>

              <div class="flex flex-wrap gap-3 justify-center">
                <button
                  class="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                  @click="openDownloadModal"
                  aria-label="下载歌曲"
                >
                  <Download class="w-5 h-5" />
                  下载
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
          @click="goBack"
        >
          返回首页
        </button>
      </div>
    </main>

    <DownloadModal
      :show="showDownloadModal"
      :music="music"
      @close="closeDownloadModal"
    />
  </div>
</template>
