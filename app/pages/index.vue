<script setup lang="ts">
import SiteFooter from "~/components/SiteFooter.vue";
import Qrcode from "~/components/Qrcode.vue";
import type { Music } from "~/stores/music";
import { Music as MusicIcon, ArrowRight } from "@lucide/vue";
import SearchBarBig from "~/components/SearchBarBig.vue";

const config = useRuntimeConfig();
const router = useRouter();
const musicStore = useMusicStore();
const searchBarRef = ref<typeof SearchBarBig>();

const { data: hotMusic, pending: loading } = await useFetch<Music[]>(
  "/api/music/recent",
  {
    method: "POST",
    key: "home-music",
    server: true,
    lazy: true,
    default: () => [],
  },
);

useHead({
  title: "下歌吧 - 免费下载高品质MP3与FLAC无损音乐",
  meta: [
    {
      name: "description",
      content:
        "下歌吧是一个免费高品质音乐下载平台，提供MP3与FLAC无损音乐下载、在线试听、歌词展示等功能。",
    },
    {
      name: "keywords",
      content:
        "下歌吧, 音乐下载, FLAC, MP3, 无损音乐, 免费下载, 在线试听, 歌词",
    },
    { name: "robots", content: "index, follow" },
    { name: "author", content: "下歌吧" },
    { name: "theme-color", content: "#0f172a" },
    { property: "og:type", content: "website" },
    {
      property: "og:title",
      content: "下歌吧 - 免费下载高品质MP3与FLAC无损音乐",
    },
    {
      property: "og:description",
      content:
        "下歌吧是一个免费高品质音乐下载平台，提供MP3与FLAC无损音乐下载、在线试听、歌词展示等功能。",
    },
    { property: "og:site_name", content: "下歌吧" },
    { property: "og:url", content: config.app.baseURL },
    { property: "og:image", content: config.app.baseURL + "img/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "下歌吧 - 免费下载高品质音乐" },
    {
      name: "twitter:description",
      content: "免费高品质音乐下载，MP3与FLAC无损格式。",
    },
  ],
  link: [{ rel: "canonical", href: config.app.baseURL }],
});

onMounted(() => {
  musicStore.loadSearchHistory();
});

const goToDetail = (music: Music) => {
  musicStore.setCurrentMusic(music);
  router.push(`/music/${music.id}`);
};

const clearHistory = () => {
  musicStore.clearSearchHistory();
};

const skeletonItems = Array.from({ length: 6 });

const isMobile = ref<boolean | null>(null);

const checkMobile = () => {
  isMobile.value =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
};

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-8 px-4">
    <div class="max-w-4xl mx-auto">
      <header class="text-center mb-6">
        <div class="flex items-center justify-center gap-3 mb-6">
          <div
            class="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center"
            aria-hidden="true"
          >
            <MusicIcon />
          </div>
          <h1 class="text-4xl font-bold text-white">下歌吧</h1>
        </div>
        <SearchBarBig ref="searchBarRef" />
        <div class="text-sm text-gray-400 mt-3" v-if="isMobile !== null">
          {{
            isMobile
              ? "打开浏览器菜单，点击加入书签不迷路"
              : "按下Ctrl + D收藏网站不迷路"
          }}
        </div>
      </header>

      <section
        v-if="musicStore.searchHistory.length > 0"
        class="mb-8"
        aria-labelledby="history-title"
      >
        <h2 id="history-title" class="text-lg font-medium text-gray-300 mb-4">
          搜索历史
        </h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="keyword in musicStore.searchHistory"
            :key="keyword"
            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full text-sm transition-colors"
            @click="searchBarRef?.handleSearch(keyword)"
          >
            {{ keyword }}
          </button>
          <button
            class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors ml-2"
            @click="clearHistory"
            aria-label="清空搜索历史"
          >
            清空
          </button>
        </div>
      </section>

      <section aria-labelledby="hot-title">
        <h2 id="hot-title" class="text-lg font-medium text-gray-300 mb-4">
          最新音乐
        </h2>

        <!-- 骨架屏：数据还没回来时展示 -->
        <div
          v-if="loading"
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          aria-busy="true"
          aria-label="正在加载最新音乐"
        >
          <div
            v-for="(_, i) in skeletonItems"
            :key="i"
            class="card p-4 animate-pulse"
          >
            <div class="flex gap-4">
              <div class="w-20 h-20 bg-gray-700 rounded-lg" />
              <div class="flex-1 space-y-3 py-1">
                <div class="h-4 bg-gray-700 rounded w-3/4" />
                <div class="h-3 bg-gray-700 rounded w-1/2" />
                <div class="h-4 bg-gray-700 rounded w-1/3 mt-4 ml-auto" />
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="!hotMusic || hotMusic.length === 0"
          class="text-center py-12"
        >
          <p class="text-gray-500">暂无最新音乐</p>
          <p class="text-gray-600 text-sm mt-2">请通过管理员后台添加音乐</p>
        </div>

        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <article
            v-for="music in hotMusic"
            :key="music.id"
            class="card p-4 cursor-pointer hover:border-primary-500/50 transition-colors"
            @click="goToDetail(music)"
            role="article"
            :aria-label="music.title"
          >
            <div class="flex gap-4">
              <img
                :src="music.cover || config.app.baseURL + 'img/cover.png'"
                :alt="music.title"
                class="w-20 h-20 rounded-lg object-cover"
                loading="lazy"
                decoding="async"
                @error="
                  ($event.target as HTMLImageElement).src =
                    config.app.baseURL + 'img/cover.png'
                "
              />
              <div class="flex-1 min-w-0 flex flex-col justify-between py-1">
                <div>
                  <h3 class="font-medium text-white truncate">
                    {{ music.title }}
                  </h3>
                  <p class="text-sm text-gray-500 truncate">
                    {{ music.artist }}
                  </p>
                </div>
                <ArrowRight class="w-5 h-5 text-gray-600 self-end" />
              </div>
            </div>
          </article>
        </div>
      </section>

      <Qrcode />

      <SiteFooter />
    </div>
  </div>
</template>
