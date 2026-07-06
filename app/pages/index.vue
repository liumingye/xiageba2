<script setup lang="ts">
import SiteFooter from "~/components/SiteFooter.vue";
import Qrcode from "~/components/Qrcode.vue";
import type { Music } from "~/stores/music";
import {
  Music as MusicIcon,
  ArrowRight,
  TrashIcon,
  FolderKanban,
} from "@lucide/vue";
import SearchBarBig from "~/components/SearchBarBig.vue";
import { useMediaQuery, useResizeObserver } from "@vueuse/core";

const config = useRuntimeConfig();
const router = useRouter();
const musicStore = useMusicStore();
const searchBarRef = ref<typeof SearchBarBig>();
const historyRef = ref<HTMLElement | null>(null);
const historyExpanded = ref(false);
const historyOverflowing = ref(false);

const checkHistoryOverflow = () => {
  if (!historyRef.value || historyExpanded.value) return;
  historyOverflowing.value =
    historyRef.value.scrollHeight > historyRef.value.clientHeight;
};

useResizeObserver(historyRef, checkHistoryOverflow);

const { data: hotMusic } = await useFetch<Music[]>("/api/music/recent", {
  method: "POST",
  key: "home-music",
  server: true,
  lazy: true,
  default: () => [],
});

interface CategoryLatestItem {
  id: string;
  title: string;
  type: string;
  createdAt: string;
}

interface CategoryWithLatest {
  id: number;
  name: string;
  image: string;
  sort: number;
  latest: CategoryLatestItem[];
}

const { data: categoriesWithLatest } = await useAsyncData(
  "home-categories",
  async () => {
    try {
      const res = await $fetch<{ data: CategoryWithLatest[] }>(
        "/api/category",
        { query: { withLatest: "true" } },
      );
      return res.data || [];
    } catch {
      return [];
    }
  },
  {
    server: true,
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

onMounted(async () => {
  musicStore.loadSearchHistory();
  await nextTick();
  checkHistoryOverflow();
});

const goToDetail = (music: Music) => {
  musicStore.setCurrentMusic(music);
  router.push(`/music/${music.id}`);
};

const clearHistory = () => {
  musicStore.clearSearchHistory();
};

const isMobile = useMediaQuery("(max-width: 768px)");

interface DoubanFilterOption {
  name: string;
  value: string;
}

interface DoubanFilter {
  key: string;
  name: string;
  init: string;
  value: DoubanFilterOption[];
}

interface DoubanClass {
  type_id: string;
  type_name: string;
}

interface DoubanItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_subtitle: string;
}

interface DoubanHomeData {
  class: DoubanClass[];
  filters: Record<string, DoubanFilter[]>;
}

interface DoubanListData {
  list: DoubanItem[];
  page: number;
  pagecount: number;
}

const doubanClasses = ref<DoubanClass[]>([]);
const doubanFilters = ref<Record<string, DoubanFilter[]>>({});
const activeCategoryId = ref("short_drama");
const activeFilters = ref<Record<string, string>>({});
const doubanList = ref<DoubanItem[]>([]);
const doubanLoading = ref(false);
const doubanPage = ref(1);
const doubanPageCount = ref(0);

const currentFilters = computed(() => {
  return doubanFilters.value[activeCategoryId.value] || [];
});

let cancelToken: AbortController | null = null;
let signal: AbortSignal | null = null;

const fetchDoubanList = async (page: number = 1, append: boolean = false) => {
  if (doubanLoading.value) {
    cancelToken?.abort();
    cancelToken = null;
    signal = null;
  }
  doubanLoading.value = true;
  try {
    cancelToken = new AbortController();
    signal = cancelToken.signal;
    const data = await $fetch<DoubanListData>("/api/douban", {
      query: {
        categoryId: activeCategoryId.value,
        page,
        filters: JSON.stringify(activeFilters.value),
      },
      signal,
    });
    if (append) {
      doubanList.value.push(...(data.list || []));
    } else {
      doubanList.value = data.list || [];
    }
    doubanPage.value = data.page || page;
    doubanPageCount.value = data.pagecount || 0;
  } catch {
    if (!append) {
      doubanList.value = [];
    }
  } finally {
    doubanLoading.value = false;
  }
};

const loadMoreDouban = () => {
  if (doubanLoading.value) return;
  if (doubanPage.value >= doubanPageCount.value) return;
  fetchDoubanList(++doubanPage.value, true);
};

const resetActiveFilters = () => {
  const filters: Record<string, string> = {};
  for (const filter of currentFilters.value) {
    filters[filter.key] = filter.init;
  }
  activeFilters.value = filters;
};

const onCategoryChange = (categoryId: string) => {
  activeCategoryId.value = categoryId;
  resetActiveFilters();
  doubanPage.value = 1;
  doubanPageCount.value = 0;
  fetchDoubanList(1, false);
};

const onFilterChange = () => {
  doubanPage.value = 1;
  doubanPageCount.value = 0;
  fetchDoubanList(1, false);
};

const goToResourceSearch = async (item: DoubanItem) => {
  musicStore.searchType = "resource";
  await nextTick();
  searchBarRef.value?.handleSearch(item.vod_name);
};

const dragState = ref<{
  el: HTMLElement | null;
  isDown: boolean;
  startX: number;
  scrollLeft: number;
}>({ el: null, isDown: false, startX: 0, scrollLeft: 0 });

const onDragMouseDown = (e: MouseEvent, el: HTMLElement) => {
  dragState.value = {
    el,
    isDown: true,
    startX: e.pageX - el.offsetLeft,
    scrollLeft: el.scrollLeft,
  };
};

const onDragMouseMove = (e: MouseEvent) => {
  if (!dragState.value.isDown || !dragState.value.el) return;
  e.preventDefault();
  const x = e.pageX - dragState.value.el.offsetLeft;
  const walk = (x - dragState.value.startX) * 1.5;
  dragState.value.el.scrollLeft = dragState.value.scrollLeft - walk;
};

const onDragMouseUpOrLeave = () => {
  dragState.value.isDown = false;
  dragState.value.el = null;
};

const { data: doubanInitial } = await useAsyncData(
  "douban-home",
  async () => {
    try {
      const homeData = await $fetch<DoubanHomeData>("/api/douban");
      const categoryId = activeCategoryId.value;
      const filters: Record<string, string> = {};
      const categoryFilters = (homeData.filters || {})[categoryId] || [];
      for (const filter of categoryFilters) {
        filters[filter.key] = filter.init;
      }
      const listData = await $fetch<DoubanListData>("/api/douban", {
        query: {
          categoryId,
          page: 1,
          filters: JSON.stringify(filters),
        },
      });
      return {
        class: homeData.class || [],
        filters: homeData.filters || {},
        list: listData.list || [],
        page: listData.page || 1,
        pagecount: listData.pagecount || 0,
      };
    } catch {
      return { class: [], filters: {}, list: [], page: 1, pagecount: 0 };
    }
  },
  {
    server: true,
    default: () => ({
      class: [],
      filters: {},
      list: [],
      page: 1,
      pagecount: 0,
    }),
  },
);

doubanClasses.value = doubanInitial.value?.class || [];
doubanFilters.value = doubanInitial.value?.filters || {};
doubanList.value = doubanInitial.value?.list || [];
doubanPage.value = doubanInitial.value?.page || 1;
doubanPageCount.value = doubanInitial.value?.pagecount || 0;
resetActiveFilters();

const getPic = (url: string) => {
  const urlObj = new URL(url);

  if (urlObj.hostname.endsWith(".doubanio.com")) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}&referer=m.douban.com`;
  }
  return url;
};
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
        <div class="text-sm text-gray-400 mt-3">
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
        :class="{
          'mask-bottom': !historyExpanded && historyOverflowing,
        }"
        aria-labelledby="history-title"
      >
        <div class="flex items-center">
          <h2
            id="history-title"
            class="text-lg font-medium text-gray-300 mb-4 flex-1"
          >
            搜索历史
          </h2>
          <button
            v-if="historyOverflowing"
            class="text-primary-400 hover:text-primary-300 transition-colors px-2 border-r border-gray-500/50"
            @click="historyExpanded = !historyExpanded"
          >
            {{ historyExpanded ? "收起" : "展开" }}
          </button>
          <button
            class="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors px-2"
            @click="clearHistory"
            aria-label="清空搜索历史"
          >
            <TrashIcon class="w-4 h-4" />
          </button>
        </div>
        <div
          ref="historyRef"
          class="flex flex-wrap gap-2 transition-all duration-300"
          :class="historyExpanded ? '' : 'max-h-[72px] overflow-hidden'"
        >
          <button
            v-for="keyword in musicStore.searchHistory"
            :key="keyword"
            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full text-sm transition-colors"
            @click="searchBarRef?.handleSearch(keyword)"
          >
            {{ keyword }}
          </button>
        </div>
      </section>

      <section
        v-if="
          (categoriesWithLatest && categoriesWithLatest.length > 0) ||
          (hotMusic && hotMusic.length > 0)
        "
        aria-labelledby="categories-title"
        class="mb-8"
      >
        <h2
          id="categories-title"
          class="text-lg font-medium text-gray-300 mb-4"
        >
          资源分类
        </h2>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-if="hotMusic && hotMusic.length > 0"
            class="card p-4 flex flex-col"
          >
            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center flex-shrink-0"
              >
                <MusicIcon class="w-5 h-5 text-primary-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-white truncate">最新音乐</h3>
              </div>
            </div>

            <ul class="flex-1 space-y-1.5 min-w-0">
              <li
                v-for="music in hotMusic.slice(0, 11)"
                :key="music.id"
                class="flex items-center gap-2 min-w-0 cursor-pointer group"
                @click="goToDetail(music)"
              >
                <MusicIcon class="w-3 h-3 text-primary-400 flex-shrink-0" />
                <span
                  class="text-sm text-gray-400 group-hover:text-primary-400 truncate transition-colors"
                  :title="music.title + ' - ' + music.artist"
                >
                  {{ music.title }} - {{ music.artist }}
                </span>
              </li>
            </ul>
          </div>

          <div
            v-for="cat in categoriesWithLatest"
            :key="cat.id"
            class="card p-4 flex flex-col"
          >
            <NuxtLink
              :to="`/categorie/${cat.id}`"
              class="flex items-center gap-3 mb-3 group"
            >
              <div
                class="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary-500/30 transition-colors"
              >
                <FolderKanban class="w-5 h-5 text-primary-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h3
                  class="font-medium text-white truncate group-hover:text-primary-400 transition-colors"
                >
                  {{ cat.name }}
                </h3>
              </div>
            </NuxtLink>

            <ul class="flex-1 space-y-1.5 min-w-0">
              <li
                v-for="item in cat.latest.slice(0, 10)"
                :key="item.id"
                class="flex items-center gap-2 min-w-0"
              >
                <img
                  v-if="item.type !== 'other'"
                  :src="`/img/pan/${item.type}.png`"
                  class="w-3 h-3 flex-shrink-0"
                />
                <NuxtLink
                  :to="`/source/${item.id}`"
                  class="text-sm text-gray-400 hover:text-primary-400 truncate transition-colors"
                  :title="item.title"
                >
                  {{ item.title }}
                </NuxtLink>
              </li>
              <li v-if="cat.latest.length === 0" class="text-sm text-gray-600">
                暂无资源
              </li>
            </ul>

            <NuxtLink
              :to="`/categorie/${cat.id}`"
              class="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-gray-800 text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              查看更多
              <ArrowRight class="w-3 h-3" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="douban-title" class="mt-10">
        <h2 id="douban-title" class="text-lg font-medium text-gray-300 mb-4">
          热门影视
        </h2>

        <div class="space-y-3 mb-4">
          <div class="flex items-center gap-3">
            <div
              class="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 flex items-center h-8"
            >
              分类
            </div>
            <div
              class="overflow-x-auto overflow-y-hidden select-none touch-pan-x cursor-grab active:cursor-grabbing flex-1 min-w-0 [&::-webkit-scrollbar]:hidden"
              @mousedown="
                onDragMouseDown($event, $event.currentTarget as HTMLElement)
              "
              @mousemove="onDragMouseMove"
              @mouseup="onDragMouseUpOrLeave"
              @mouseleave="onDragMouseUpOrLeave"
            >
              <div class="flex gap-2 min-w-max items-center h-8">
                <button
                  v-for="cls in doubanClasses"
                  :key="cls.type_id"
                  type="button"
                  class="inline-flex items-center justify-center text-sm font-medium transition-all disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 h-8 rounded-full gap-1.5 px-3 whitespace-nowrap flex-shrink-0"
                  :class="
                    activeCategoryId === cls.type_id
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  "
                  @click="onCategoryChange(cls.type_id)"
                >
                  {{ cls.type_name }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-for="filter in currentFilters"
            :key="filter.key"
            class="flex items-center gap-3"
          >
            <div
              class="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 flex items-center h-8"
            >
              {{ filter.name }}
            </div>
            <div
              class="overflow-x-auto overflow-y-hidden select-none touch-pan-x cursor-grab active:cursor-grabbing flex-1 min-w-0 [&::-webkit-scrollbar]:hidden"
              @mousedown="
                onDragMouseDown($event, $event.currentTarget as HTMLElement)
              "
              @mousemove="onDragMouseMove"
              @mouseup="onDragMouseUpOrLeave"
              @mouseleave="onDragMouseUpOrLeave"
            >
              <div class="flex gap-2 min-w-max items-center h-8">
                <button
                  v-for="opt in filter.value"
                  :key="opt.value"
                  type="button"
                  class="inline-flex items-center justify-center text-sm font-medium transition-all disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 h-8 rounded-full gap-1.5 px-3 whitespace-nowrap flex-shrink-0"
                  :class="
                    activeFilters[filter.key] === opt.value
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  "
                  @click="
                    activeFilters[filter.key] = opt.value;
                    onFilterChange();
                  "
                >
                  {{ opt.name }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="doubanLoading && doubanPage === 1"
          class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
          aria-busy="true"
        >
          <div
            v-for="(_, i) in Array.from({ length: 10 })"
            :key="i"
            class="card p-3 animate-pulse"
          >
            <div class="aspect-[2/3] bg-gray-700 rounded-lg mb-3" />
            <div class="h-4 bg-gray-700 rounded w-3/4 mb-2" />
            <div class="h-3 bg-gray-700 rounded w-full" />
          </div>
        </div>

        <div v-else-if="doubanList.length === 0" class="text-center py-12">
          <p class="text-gray-500">暂无豆瓣推荐数据</p>
        </div>

        <div
          v-else
          class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
        >
          <article
            v-for="item in doubanList"
            :key="item.vod_id"
            class="card p-3 cursor-pointer hover:border-primary-500/50 transition-colors"
            @click="goToResourceSearch(item)"
          >
            <div
              class="aspect-[2/3] rounded-lg overflow-hidden mb-3 bg-gray-800"
            >
              <img
                v-if="item.vod_pic"
                :src="getPic(item.vod_pic)"
                :alt="item.vod_name"
                class="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                @error="
                  ($event.target as HTMLImageElement).style.display = 'none'
                "
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-gray-600 text-sm"
              >
                暂无封面
              </div>
            </div>
            <h3
              class="font-medium text-white text-sm truncate"
              :title="item.vod_name"
            >
              {{ item.vod_name }}
            </h3>
            <p
              class="text-xs text-gray-500 truncate mt-1"
              :title="item.vod_subtitle.replaceAll(/\s/g, '')"
            >
              {{ item.vod_subtitle || "-" }}
            </p>
          </article>
        </div>

        <div
          v-if="doubanLoading && doubanPage > 1"
          class="text-center py-4 text-sm text-gray-500"
          aria-busy="true"
        >
          加载中...
        </div>

        <InfiniteLoad
          v-if="doubanList.length > 0 && doubanPage < doubanPageCount"
          @infinite-load="loadMoreDouban"
        />
        <div v-else class="text-center py-4 text-sm text-gray-500">
          — 已经到底了 —
        </div>
      </section>

      <Qrcode />

      <SiteFooter />
    </div>
  </div>
</template>

<style scoped>
.mask-bottom {
  mask: linear-gradient(
    180deg,
    #fff,
    #fff,
    #fff 25%,
    #fff 75%,
    hsla(0deg, 0%, 100%, 0.6) 85%,
    hsla(0deg, 0%, 100%, 0)
  );
}
</style>
