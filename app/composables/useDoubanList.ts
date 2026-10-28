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
  const doubanClasses = ref<DoubanClass[]>([]);
  const doubanFilters = ref<Record<string, DoubanFilter[]>>({});
  const activeCategoryId = ref("tv");
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

  /**
   * 拉取列表
   *
   * 并发调用（快速切分类 / 连续触底）时先中断上一次请求，避免旧响应
   * 覆盖新结果。
   */
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
      const data = await $fetch<DoubanListData>("/api/home/douban", {
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
      // 中断或失败：追加时保留已有内容，刷新时清空
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
