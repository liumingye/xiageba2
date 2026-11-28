import { computed, ref } from "vue";

/**
 * 首页「豆瓣榜单」标签页的数据层
 *
 * 分类、筛选项、列表分页与请求取消原本全写在 index.vue 里，和热词、
 * 番剧、拖拽滚动混在同一个 setup 里。这堆东西只服务于豆瓣这一个标签页，
 * 互相之间高度内聚、和页面其余部分毫无关系，因此整块搬出来。
 *
 * 页面那边只需要拿这些 ref 和几个方法绑定到模板。
 */

export interface DoubanFilterOption {
  name: string;
  value: string;
}

export interface DoubanFilter {
  key: string;
  name: string;
  init: string;
  value: DoubanFilterOption[];
}

export interface DoubanClass {
  type_id: string;
  type_name: string;
}

export interface DoubanItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_subtitle: string;
  vod_douban_score: number;
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

export function useDoubanList() {
  // 大列表（分类/筛选/榜单数据）用 shallowRef：整体替换即可触发更新，
  // 避免对数百个媒体条目做深度响应式代理
  const doubanClasses = shallowRef<DoubanClass[]>([]);
  const doubanFilters = shallowRef<Record<string, DoubanFilter[]>>({});
  const activeCategoryId = ref("tv");
  const activeFilters = ref<Record<string, string>>({});
  const doubanList = shallowRef<DoubanItem[]>([]);
  const doubanLoading = ref(false);
  const doubanPage = ref(1);
  const doubanPageCount = ref(0);

  const currentFilters = computed(() => {
    return doubanFilters.value[activeCategoryId.value] || [];
  });

  /** 当前在途请求；发起新请求时旧的那个被 abort，且不允许再写状态 */
  let cancelToken: AbortController | null = null;

  /**
   * 拉取列表
   *
   * 并发调用（快速切分类 / 连续触底）时先中断上一次请求，避免旧响应
   * 覆盖新结果。
   *
   * 被中断的旧请求也会走自己的 catch / finally，所以写状态前一律核对
   * 「我还是不是当前请求」，否则旧请求会把新请求的 loading 翻回 false、
   * 把刚清空的列表再清一遍。
   */
  const fetchDoubanList = async (page: number = 1, append: boolean = false) => {
    cancelToken?.abort();
    const controller = new AbortController();
    cancelToken = controller;
    doubanLoading.value = true;

    const isCurrent = () => cancelToken === controller;

    try {
      const data = await $fetch<DoubanListData>("/api/home/douban", {
        query: {
          categoryId: activeCategoryId.value,
          page,
          filters: JSON.stringify(activeFilters.value),
        },
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (append) {
        // shallowRef 必须整体替换才能触发更新
        doubanList.value = [...doubanList.value, ...(data.list || [])];
      } else {
        doubanList.value = data.list || [];
      }
      doubanPage.value = data.page || page;
      doubanPageCount.value = data.pagecount || 0;
    } catch {
      // 已被更新的请求取代：状态归新请求管，这里什么都不动
      if (!isCurrent()) return;
      // 真正失败：追加时保留已有内容，刷新时清空
      if (!append) {
        doubanList.value = [];
      }
    } finally {
      if (isCurrent()) {
        cancelToken = null;
        doubanLoading.value = false;
      }
    }
  };

  const loadMoreDouban = () => {
    if (doubanLoading.value) return;
    if (doubanPage.value >= doubanPageCount.value) return;
    fetchDoubanList(++doubanPage.value, true);
  };

  /** 按当前分类的筛选项初始值重置筛选 */
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

  /**
   * 首屏数据：分类 + 筛选项 + 第一页列表一次拿回，服务端渲染。
   *
   * 必须在 setup 里调用（useAsyncData 的限制）。
   */
  const loadInitial = async () => {
    const { data } = await useAsyncData(
      "douban-home",
      async () => {
        try {
          const homeData = await $fetch<DoubanHomeData>("/api/home/douban");
          const categoryId = activeCategoryId.value;
          const filters: Record<string, string> = {};
          const categoryFilters = (homeData.filters || {})[categoryId] || [];
          for (const filter of categoryFilters) {
            filters[filter.key] = filter.init;
          }
          const listData = await $fetch<DoubanListData>("/api/home/douban", {
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

    doubanClasses.value = data.value?.class || [];
    doubanFilters.value = data.value?.filters || {};
    doubanList.value = data.value?.list || [];
    doubanPage.value = data.value?.page || 1;
    doubanPageCount.value = data.value?.pagecount || 0;
    resetActiveFilters();
  };

  return {
    doubanClasses,
    doubanFilters,
    activeCategoryId,
    activeFilters,
    currentFilters,
    doubanList,
    doubanLoading,
    doubanPage,
    doubanPageCount,
    fetchDoubanList,
    loadMoreDouban,
    resetActiveFilters,
    onCategoryChange,
    onFilterChange,
    loadInitial,
  };
}
