<script setup lang="ts">
import type { Music } from "~/stores/music";
import {
  Music as MusicIcon,
  ArrowRight,
  TrashIcon,
  FolderKanban,
  Folder,
  Flame,
  History,
  CircleCheck,
  Search,
} from "@lucide/vue";
import SearchBarBig from "~/components/SearchBarBig.vue";
import { useMounted, useResizeObserver } from "@vueuse/core";

defineOptions({
  name: "IndexPage",
});

const config = useRuntimeConfig();
const musicStore = useMusicStore();
const searchBarRef = ref<typeof SearchBarBig>();
const sectionRef = ref<HTMLElement | null>(null);
const sectionExpanded = ref(false);
const sectionOverflowing = ref(true);

const checkSectionOverflow = () => {
  if (!sectionRef.value || sectionExpanded.value) return;
  sectionOverflowing.value =
    sectionRef.value.scrollHeight > sectionRef.value.clientHeight;
};

useResizeObserver(sectionRef, checkSectionOverflow);

const { data: hotMusic } = await useFetch<Music[]>("/api/music/recent", {
  method: "GET",
  key: "home-music",
  server: true,
  lazy: true,
  default: () => [],
});

interface HotWord {
  word: string;
  weight: number;
  type: "music" | "resource";
}

const { data: hotwordsData } = await useFetch<{ data: HotWord[] }>(
  "/api/hotwords",
  {
    key: "home-hotwords",
    server: true,
    lazy: true,
    default: () => ({ data: [] }),
  },
);

const hotwords = computed(() => hotwordsData.value?.data || []);

const hasHotwords = computed(() => hotwords.value.length > 0);
const hasHistory = computed(() => musicStore.searchHistory.length > 0);

const isMounted = useMounted();
onMounted(() => {
  isMounted.value = true;
});

const showHistorySection = computed(() => {
  if (hasHotwords.value) return true;
  if (isMounted.value && hasHistory.value) return true;
  return false;
});

const activeHistoryTab = ref(hasHotwords.value ? "hot" : "history");

const hasCategory = computed(
  () =>
    (!!categoriesWithLatest.value && categoriesWithLatest.value.length > 0) ||
    (!!hotMusic.value && hotMusic.value.length > 0),
);
const activeContentTab = ref<"category" | "douban">("category");

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

useSeoMeta({
  ogUrl: config.app.baseURL,
  ogImage: config.app.baseURL + "img/og-image.png",
});

useHead({
  link: [{ rel: "canonical", href: config.app.baseURL }],
});

onMounted(async () => {
  await nextTick();
  checkSectionOverflow();
});

watch(activeHistoryTab, async () => {
  await nextTick();
  checkSectionOverflow();
});

const clearHistory = () => {
  musicStore.clearSearchHistory();
};

const handleHotwordClick = (hotword: HotWord) => {
  musicStore.searchType = hotword.type;
  nextTick(() => {
    searchBarRef.value?.handleSearch(hotword.word);
  });
};

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
  // 接口返回的图片地址可能为空或非标准 URL，直接 new URL() 会抛 TypeError 导致渲染崩溃
  let urlObj: URL;
  try {
    urlObj = new URL(url || "");
  } catch {
    return "";
  }

  if (urlObj.hostname.endsWith(".doubanio.com")) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}&referer=https://m.douban.com`;
  } else if (urlObj.hostname.endsWith(".iqiyipic.com")) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}&referer=https://www.iqiyi.com`;
  }
  return url;
};
</script>

<template>
  <header class="text-center mb-6">
    <div class="mb-6">
      <div class="max-md:hidden font-bold text-2xl md:text-3xl">
        找网盘资源，<span class="slogan">全盘搜</span>帮你搞定
      </div>
      <div class="md:hidden flex items-center justify-center gap-3">
        <div
          class="w-12 h-12 bg-linear-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center text-white"
          aria-hidden="true"
        >
          <Search />
        </div>
        <h1 class="text-4xl font-bold">全盘搜</h1>
      </div>
    </div>
    <SearchBarBig ref="searchBarRef" />
    <div class="text-sm text-muted justify-center gap-4 hidden md:flex">
      <span class="flex items-center"
        ><CircleCheck class="w-4 h-4 mr-1 text-primary" />百万网盘资源</span
      >
      <span class="flex items-center"
        ><CircleCheck class="w-4 h-4 mr-1 text-primary" />链接有效性检测</span
      >
      <span class="flex items-center"
        ><CircleCheck class="w-4 h-4 mr-1 text-primary" />真免费无广告</span
      >
    </div>
    <div class="text-sm text-muted md:hidden">
      打开浏览器菜单，点击加入书签不迷路
    </div>
  </header>

  <AnnouncementDisplay />

  <section
    v-if="showHistorySection"
    :class="{
      'mask-bottom': !sectionExpanded && sectionOverflowing,
    }"
    ref="sectionRef"
    class="mb-8 overflow-hidden"
    aria-labelledby="history-title"
  >
    <UTabs
      v-model="activeHistoryTab"
      color="primary"
      variant="link"
      :ui="{
        content: 'mt-1',
      }"
      :items="[
        {
          label: '热门搜索',
          icon: 'i-lucide-flame',
          value: 'hot',
          slot: 'hot',
          disabled: !hasHotwords,
        },
        {
          label: '搜索历史',
          icon: 'i-lucide-history',
          value: 'history',
          slot: 'history',
        },
      ]"
    >
      <template #list-trailing>
        <div class="flex ml-auto">
          <template v-if="activeHistoryTab === 'history'">
            <button
              v-if="activeHistoryTab === 'history'"
              class="flex items-center gap-1 opacity-65 hover:opacity-90 transition-all px-2"
              @click="clearHistory"
              aria-label="清空搜索历史"
            >
              <TrashIcon class="w-3.5 h-3.5" />
              清空
            </button>
            <span
              v-if="sectionOverflowing"
              class="border-l border-color-300 h-4 mt-2"
            ></span>
          </template>
          <button
            v-if="sectionOverflowing"
            class="opacity-65 hover:opacity-90 transition-colors px-2"
            @click="sectionExpanded = !sectionExpanded"
          >
            {{ sectionExpanded ? "收起" : "展开" }}
          </button>
        </div>
      </template>

      <template #hot>
        <div
          class="flex flex-wrap gap-2"
          :class="sectionExpanded ? '' : 'max-h-50'"
        >
          <button
            v-for="(hotword, index) in hotwords"
            :key="hotword.word"
            class="button-radius"
            @click="handleHotwordClick(hotword)"
          >
            <span
              v-if="index < 3"
              class="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium"
              :class="{
                'bg-red-500 text-white': index === 0,
                'bg-orange-500 text-white': index === 1,
                'bg-yellow-500 text-white': index === 2,
              }"
            >
              {{ index + 1 }}
            </span>
            {{ hotword.word }}
          </button>
        </div>
      </template>

      <template #history>
        <div
          class="flex flex-wrap gap-2 transition-all duration-300"
          :class="sectionExpanded ? '' : 'max-h-50'"
        >
          <button
            v-for="keyword in musicStore.searchHistory"
            :key="keyword"
            class="button-radius"
            @click="searchBarRef?.handleSearch(keyword)"
          >
            {{ keyword }}
          </button>
        </div>
      </template>
    </UTabs>
  </section>

  <section
    v-if="hasCategory || doubanClasses.length > 0"
    aria-labelledby="content-title"
    class="mb-8"
  >
    <UTabs
      v-model="activeContentTab"
      color="primary"
      variant="link"
      :ui="{
        content: 'mt-1',
      }"
      :items="[
        {
          label: '资源分类',
          icon: 'i-lucide-folder-kanban',
          value: 'category',
          slot: 'category',
          disabled: !hasCategory,
        },
        {
          label: '热门影视',
          icon: 'i-lucide-flame',
          value: 'douban',
          slot: 'douban',
        },
      ]"
    >
      <template #category>
        <div
          v-if="hasCategory"
          class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4"
        >
          <div
            v-if="hotMusic && hotMusic.length > 0"
            class="card p-2 md:p-4 flex flex-col"
          >
            <div class="flex items-center gap-2 mb-3">
              <div
                class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              >
                <MusicIcon class="w-6 h-6 text-primary-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate">最新音乐</h3>
              </div>
            </div>

            <ul class="flex-1 space-y-1.5 min-w-0">
              <li
                v-for="music in hotMusic.slice(0, 11)"
                :key="music.id"
                class="flex items-center gap-1 md:gap-1.5 min-w-0"
              >
                <MusicIcon class="w-3 h-3 text-primary-400 shrink-0" />
                <NuxtLink
                  :to="`/music/${music.id}`"
                  class="link"
                  :title="music.title + ' - ' + music.artist"
                >
                  {{ music.title }} - {{ music.artist }}
                </NuxtLink>
              </li>
            </ul>
          </div>

          <div
            v-for="cat in categoriesWithLatest"
            :key="cat.id"
            class="card p-2 md:p-4 flex flex-col"
          >
            <NuxtLink
              :to="`/categorie/${cat.id}`"
              class="flex items-center gap-2 mb-3 group"
            >
              <div
                class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              >
                <img v-if="cat.image" :src="cat.image" class="w-6 h-6" />
                <Folder
                  v-else
                  class="w-6 h-6 text-primary-400 fill-primary-400"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h3
                  class="font-medium truncate group-hover:text-[--primary] transition-colors"
                >
                  {{ cat.name }}
                </h3>
              </div>
            </NuxtLink>

            <ul class="flex-1 space-y-1.5 min-w-0 pb-3 border-b border-muted">
              <li v-if="cat.latest.length === 0" class="text-sm text-muted">
                暂无资源
              </li>
              <li
                v-else
                v-for="item in cat.latest.slice(0, 10)"
                :key="item.id"
                class="flex items-center gap-1 md:gap-1.5 min-w-0"
              >
                <div
                  v-if="item.type !== 'other'"
                  :class="`icon-${item.type} w-3 h-3`"
                ></div>
                <NuxtLink
                  :to="`/source/${item.id}`"
                  class="link"
                  :title="item.title"
                >
                  {{ item.title }}
                </NuxtLink>
              </li>
            </ul>

            <UButton
              variant="link"
              :to="`/categorie/${cat.id}`"
              class="justify-center mt-1 -mb-3 group"
            >
              查看更多
              <ArrowRight
                class="size-3 group-hover:-rotate-45 transition-transform"
              />
            </UButton>
          </div>
        </div>
      </template>
      <template #douban>
        <div class="space-y-3 mb-4">
          <div class="flex items-center gap-3">
            <div
              class="text-xs text-color-400 whitespace-nowrap shrink-0 flex items-center h-8"
            >
              分类
            </div>
            <div
              class="overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing flex-1 min-w-0 [&::-webkit-scrollbar]:hidden"
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
                  class="inline-flex items-center justify-center text-sm font-medium transition-all outline-none h-8 rounded-full gap-1.5 px-3 whitespace-nowrap shrink-0 border"
                  :class="
                    activeCategoryId === cls.type_id
                      ? 'bg-muted shadow-sm border-muted'
                      : 'opacity-80 hover:bg-muted hover:opacity-100 border-transparent'
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
              class="text-xs text-color-400 whitespace-nowrap shrink-0 flex items-center h-8"
            >
              {{ filter.name }}
            </div>
            <div
              class="overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing flex-1 min-w-0 [&::-webkit-scrollbar]:hidden"
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
                  class="inline-flex items-center justify-center text-sm font-medium transition-all outline-none h-8 rounded-full gap-1.5 px-3 whitespace-nowrap shrink-0 border"
                  :class="
                    activeFilters[filter.key] === opt.value
                      ? 'bg-muted shadow-sm border-muted'
                      : 'opacity-80 hover:bg-muted hover:opacity-100 border-transparent'
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
          class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4"
          aria-busy="true"
        >
          <div
            v-for="(_, i) in Array.from({ length: 10 })"
            :key="i"
            class="card animate-pulse"
          >
            <USkeleton class="aspect-2/3 bg-accented" />
          </div>
        </div>

        <div v-else-if="doubanList.length === 0" class="text-center py-12">
          <p class="text-color-400">暂无豆瓣推荐数据</p>
        </div>

        <div
          v-else
          class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4"
        >
          <article
            v-for="item in doubanList"
            :key="item.vod_id"
            class="card cursor-pointer hover:border-primary-500 transition-colors relative"
            @click="goToResourceSearch(item)"
            :title="item.vod_name"
          >
            <div class="aspect-2/3 overflow-hidden bg-black">
              <img
                v-if="item.vod_pic"
                :src="getPic(item.vod_pic)"
                :alt="item.vod_name"
                class="w-full h-full object-cover bg-muted mask-bottom2"
                loading="lazy"
                decoding="async"
                @error="
                  ($event.target as HTMLImageElement).style.display = 'none'
                "
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-sm bg-muted mask-bottom2"
              >
                暂无封面
              </div>
            </div>
            <div class="p-2 absolute bottom-0 left-0 right-0 text-white">
              <h3 class="font-medium text-sm truncate">
                {{ item.vod_name }}
              </h3>
              <p
                class="text-xs text-white/80 truncate mt-1"
                :title="(item.vod_subtitle || '').replaceAll(/\s/g, '')"
              >
                {{ item.vod_subtitle || "-" }}
              </p>
            </div>
          </article>
        </div>

        <div
          v-if="doubanLoading && doubanPage > 1"
          class="text-center py-4 text-sm text-color-400"
          aria-busy="true"
        >
          加载中...
        </div>

        <InfiniteLoad
          v-if="doubanList.length > 0 && doubanPage < doubanPageCount"
          @infinite-load="loadMoreDouban"
        />
        <div v-else class="text-center py-4 text-sm text-color-400">
          — 已经到底了 —
        </div>
      </template>
    </UTabs>
  </section>

  <Qrcode />
</template>

<style scoped>
@reference "~/assets/css/main.css";

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

.mask-bottom2 {
  mask: linear-gradient(
    180deg,
    #fff,
    #fff,
    #fff 20%,
    #fff 70%,
    hsla(0deg, 0%, 100%, 0.5) 80%,
    hsla(0deg, 0%, 100%, 0)
  );
}

.slogan {
  background: url(/img/title_bg.webp) no-repeat right 95%;
  background-size: 100%;
  padding-bottom: 5px;
}

.link {
  @apply text-sm hover:text-primary truncate transition-colors;
}

.button-radius {
  @apply px-3 py-2 rounded-full text-sm transition-colors bg-muted border border-muted;
  &:hover {
    @apply bg-accented;
  }
}
</style>
