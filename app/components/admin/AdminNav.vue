<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { onClickOutside } from "@vueuse/core";

import {
  Music,
  Users,
  Settings,
  MessageSquare,
  FolderOpen,
  Database,
  Tags,
  UserCog,
  Webhook,
  Megaphone,
  Cloud,
  FileText,
  HardDrive,
  Menu,
  X,
  ChevronDown,
  MoreHorizontal,
} from "@lucide/vue";

/* =========================================================
 * 类型
 * ======================================================= */

interface NavChild {
  label: string;
  path: string;
  icon: any;
}

interface NavItem {
  label: string;
  path?: string;
  icon: any;
  children?: NavChild[];
}

/* =========================================================
 * 导航数据
 * ======================================================= */

const navItems: NavItem[] = [
  {
    label: "资源",
    icon: FolderOpen,
    children: [
      {
        label: "资源管理",
        path: "/admin/resource",
        icon: Database,
      },
      {
        label: "分类管理",
        path: "/admin/category",
        icon: Tags,
      },
      {
        label: "账号管理",
        path: "/admin/account",
        icon: UserCog,
      },
      {
        label: "接口配置",
        path: "/admin/apiList",
        icon: Webhook,
      },
    ],
  },
  {
    label: "文件",
    icon: Cloud,
    children: [
      {
        label: "文件管理",
        path: "/admin/storage/files",
        icon: FileText,
      },
      {
        label: "存储配置",
        path: "/admin/storage/config",
        icon: HardDrive,
      },
    ],
  },
  {
    label: "音乐管理",
    path: "/admin",
    icon: Music,
  },
  {
    label: "反馈管理",
    path: "/admin/feedback",
    icon: MessageSquare,
  },
  {
    label: "公告管理",
    path: "/admin/announcement",
    icon: Megaphone,
  },
  {
    label: "管理员管理",
    path: "/admin/admins",
    icon: Users,
  },
  {
    label: "系统配置",
    path: "/admin/maintain",
    icon: Settings,
  },
];

/* =========================================================
 * 路由
 * ======================================================= */

const route = useRoute();
const router = useRouter();

/* =========================================================
 * 菜单状态
 * ======================================================= */

/**
 * 桌面端当前打开的菜单
 *
 * null       = 没有打开
 * "__more__" = 更多菜单
 * 其他字符串 = 某个普通下拉菜单
 */
const activeDropdown = ref<string | null>(null);

/**
 * 手机端抽屉
 */
const mobileMenuOpen = ref(false);

/**
 * 抽屉中的分组展开状态
 */
const expandedDrawerGroups = ref<Record<string, boolean>>({});

/**
 * 桌面端菜单容器
 */
const desktopNavRef = ref<HTMLElement | null>(null);

/**
 * 隐藏测量容器
 */
const measureContainerRef = ref<HTMLElement | null>(null);

/**
 * 每个菜单的测量 DOM
 */
const measureItemRefs = ref<HTMLElement[]>([]);

/**
 * 「更多」按钮测量 DOM
 */
const measureMoreRef = ref<HTMLElement | null>(null);

/**
 * 当前桌面端显示多少个菜单
 */
const visibleCount = ref(navItems.length);

/**
 * 是否已经完成首次布局计算
 *
 * 在完成计算之前隐藏桌面菜单，
 * 避免首次加载时出现：
 *
 * 全部菜单
 * -> 更多
 * -> 最终状态
 *
 * 的闪烁。
 */
const layoutReady = ref(false);

/**
 * 当前是否桌面端
 */
const isDesktop = ref(false);

/**
 * ResizeObserver
 */
let resizeObserver: ResizeObserver | null = null;

/**
 * MediaQuery
 */
let mediaQuery: MediaQueryList | null = null;

/**
 * requestAnimationFrame ID
 */
let resizeFrame = 0;

/**
 * 缓存上一次的布局 key。
 *
 * 如果宽度和每个菜单宽度完全没变，
 * 则不重复计算。
 */
let lastLayoutKey = "";

/* =========================================================
 * 响应式断点
 * ======================================================= */

const updateMediaQuery = () => {
  isDesktop.value = window.matchMedia("(min-width: 768px)").matches;
};

/* =========================================================
 * 路径判断
 * ======================================================= */

const isPathActive = (path?: string) => {
  if (!path) {
    return false;
  }

  /**
   * 首页 /admin 必须精确匹配。
   *
   * 否则：
   *
   * /admin
   *
   * 会同时匹配：
   *
   * /admin/resource
   * /admin/category
   * ...
   */
  if (path === "/admin") {
    return route.path === "/admin";
  }

  return route.path.startsWith(path);
};

/**
 * 判断一个导航项是否激活
 */
const isGroupActive = (item: NavItem) => {
  if (item.path) {
    return isPathActive(item.path);
  }

  return item.children?.some((child) => isPathActive(child.path)) ?? false;
};

/**
 * 当前页面标题
 *
 * 手机端顶部显示这个标题。
 */
const currentPageLabel = computed(() => {
  for (const item of navItems) {
    if (item.path && isPathActive(item.path)) {
      return item.label;
    }

    if (item.children) {
      const child = item.children.find((child) => isPathActive(child.path));

      if (child) {
        return child.label;
      }
    }
  }

  return "管理后台";
});

/* =========================================================
 * 当前显示 / 溢出菜单
 * ======================================================= */

const visibleNavItems = computed(() => {
  return navItems.slice(0, visibleCount.value);
});

const overflowNavItems = computed(() => {
  return navItems.slice(visibleCount.value);
});

/**
 * 是否存在更多菜单
 */
const hasOverflow = computed(() => {
  return overflowNavItems.value.length > 0;
});

/**
 * 当前激活菜单是否在更多里面
 *
 * 注意：
 *
 * 这个值只用于样式。
 * 不参与布局计算。
 *
 * 这样路由变化不会引起菜单重新布局。
 */
const activeInOverflow = computed(() => {
  if (!hasOverflow.value) {
    return false;
  }

  for (let i = visibleCount.value; i < navItems.length; i++) {
    const item = navItems[i];
    if (item && isGroupActive(item)) {
      return true;
    }
  }

  return false;
});

/* =========================================================
 * 测量 DOM
 * ======================================================= */

const setMeasureItemRef = (
  el: Element | ComponentPublicInstance | null,
  index: number,
) => {
  if (el instanceof HTMLElement) {
    measureItemRefs.value[index] = el;
  }
};

/* =========================================================
 * 桌面菜单布局计算
 * ======================================================= */

/**
 * 实际计算桌面端能显示多少菜单
 *
 * 注意：
 *
 * 这个函数只依赖：
 *
 * 1. 容器宽度
 * 2. 菜单自身宽度
 * 3. 更多按钮宽度
 *
 * 不依赖 route.path。
 *
 * 所以切换菜单时不会重新计算。
 */
const calculateDesktopLayout = async () => {
  /**
   * 手机端不需要布局计算。
   */
  if (!isDesktop.value) {
    visibleCount.value = navItems.length;
    layoutReady.value = true;
    return;
  }

  await nextTick();

  const container = desktopNavRef.value;

  if (!container) {
    return;
  }

  /**
   * 容器实际可用宽度。
   */
  const containerWidth = container.clientWidth;

  if (containerWidth <= 0) {
    return;
  }

  /**
   * 确保测量 DOM 数量正确。
   */
  if (
    !measureContainerRef.value ||
    measureItemRefs.value.length !== navItems.length
  ) {
    return;
  }

  /**
   * 每个菜单实际宽度。
   */
  const itemWidths = measureItemRefs.value.map((el) => el?.offsetWidth || 0);

  /**
   * 更多按钮宽度。
   *
   * 正常情况下可以测量出来。
   *
   * 极端情况下没有拿到 DOM，
   * 使用一个安全默认值。
   */
  const moreWidth = measureMoreRef.value?.offsetWidth || 88;

  /**
   * Tailwind：
   *
   * gap-1 = 0.25rem = 4px
   */
  const GAP = 4;

  /**
   * 生成布局缓存 key。
   *
   * 只要这些值没变化，
   * 就说明没有必要重新计算。
   */
  const layoutKey = [
    Math.round(containerWidth),
    ...itemWidths.map((width) => Math.round(width)),
    Math.round(moreWidth),
  ].join("|");

  /**
   * 布局完全没变化。
   *
   * 直接结束。
   */
  if (layoutKey === lastLayoutKey) {
    layoutReady.value = true;
    return;
  }

  lastLayoutKey = layoutKey;

  /* -------------------------------------------------------
   * 计算全部菜单是否可以一次性放下
   * ----------------------------------------------------- */

  const totalWidth =
    itemWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(navItems.length - 1, 0) * GAP;

  /**
   * 全部菜单都放得下。
   */
  if (totalWidth <= containerWidth) {
    visibleCount.value = navItems.length;
    layoutReady.value = true;

    return;
  }

  /* -------------------------------------------------------
   * 需要显示「更多」
   *
   * 所以要提前预留：
   *
   * 更多按钮宽度
   * +
   * 一个 gap
   * ----------------------------------------------------- */

  const availableForItems = containerWidth - moreWidth - GAP;

  let count = 0;
  let usedWidth = 0;

  /**
   * 按导航数据顺序尽量放菜单。
   */
  for (let i = 0; i < itemWidths.length; i++) {
    const itemWidth = itemWidths[i];

    if (itemWidth) {
      const nextWidth = count === 0 ? itemWidth : usedWidth + GAP + itemWidth;

      /**
       * 再放一个就超出空间了。
       */
      if (nextWidth > availableForItems) {
        break;
      }

      usedWidth = nextWidth;
      count++;
    }
  }

  /**
   * 至少保留一个菜单。
   */
  count = Math.max(count, 1);

  /**
   * 不能超过总菜单数量。
   */
  count = Math.min(count, navItems.length);

  visibleCount.value = count;

  layoutReady.value = true;
};

/* =========================================================
 * 布局调度
 * ======================================================= */

const scheduleLayout = () => {
  /**
   * 防止短时间内重复 requestAnimationFrame。
   */
  cancelAnimationFrame(resizeFrame);

  resizeFrame = requestAnimationFrame(() => {
    calculateDesktopLayout();
  });
};

/* =========================================================
 * 导航操作
 * ======================================================= */

const handleNavigate = (path?: string) => {
  if (!path) {
    return;
  }

  /**
   * 先关闭菜单，
   * 再切换路由。
   *
   * 这样视觉上更加稳定。
   */
  activeDropdown.value = null;
  mobileMenuOpen.value = false;

  router.push(path);
};

/**
 * 桌面端普通下拉菜单
 */
const toggleDropdown = (label: string) => {
  activeDropdown.value = activeDropdown.value === label ? null : label;
};

/**
 * 更多菜单
 */
const toggleMoreMenu = () => {
  activeDropdown.value =
    activeDropdown.value === "__more__" ? null : "__more__";
};

/**
 * 更多 / 手机抽屉中的分组
 */
const toggleDrawerGroup = (label: string) => {
  expandedDrawerGroups.value[label] = !expandedDrawerGroups.value[label];
};

/* =========================================================
 * 生命周期
 * ======================================================= */

onMounted(async () => {
  /**
   * 初始化桌面 / 手机状态。
   */
  updateMediaQuery();

  mediaQuery = window.matchMedia("(min-width: 768px)");

  mediaQuery.addEventListener("change", updateMediaQuery);

  /**
   * 等待 DOM 创建完成。
   */
  await nextTick();

  /**
   * 首次计算。
   */
  scheduleLayout();

  /**
   * 监听桌面导航容器尺寸。
   *
   * 注意不是 window.resize。
   *
   * 因为导航真正需要知道的是：
   *
   * “自己能用多少空间”
   */
  if (desktopNavRef.value) {
    resizeObserver = new ResizeObserver(() => {
      scheduleLayout();
    });

    resizeObserver.observe(desktopNavRef.value);
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(resizeFrame);

  resizeObserver?.disconnect();
  resizeObserver = null;

  mediaQuery?.removeEventListener("change", updateMediaQuery);

  mediaQuery = null;
});

/* =========================================================
 * 点击外部
 * ======================================================= */

onClickOutside(desktopNavRef, () => {
  activeDropdown.value = null;
});

/* =========================================================
 * 路由变化
 * ======================================================= */

/**
 * 非常重要：
 *
 * 路由切换这里【绝对不要】
 *
 * scheduleLayout()
 *
 * 因为菜单宽度没有发生变化。
 *
 * 只需要关闭打开的菜单。
 */
watch(
  () => route.path,
  () => {
    activeDropdown.value = null;
    mobileMenuOpen.value = false;
  },
);

/* =========================================================
 * 桌面 / 手机切换
 * ======================================================= */

watch(isDesktop, async () => {
  /**
   * 断点发生变化。
   *
   * 这时候才需要重新布局。
   */
  activeDropdown.value = null;
  mobileMenuOpen.value = false;

  /**
   * 清掉旧缓存。
   *
   * 因为 desktop / mobile 的 DOM 状态发生了变化。
   */
  lastLayoutKey = "";

  await nextTick();

  scheduleLayout();
});
</script>

<template>
  <nav
    class="bg-color-100 backdrop-blur-md border-b border-color-300 sticky top-0 z-40"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
      <div class="flex items-center h-14 gap-2">
        <!-- =====================================================
             手机端
        ====================================================== -->

        <div class="flex items-center justify-between w-full md:hidden">
          <!-- 当前页面标题 -->

          <span class="font-semibold text-sm truncate pr-4">
            {{ currentPageLabel }}
          </span>

          <!-- 汉堡 -->

          <button
            type="button"
            class="shrink-0 p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
            @click="mobileMenuOpen = !mobileMenuOpen"
            aria-label="Toggle Menu"
            :aria-expanded="mobileMenuOpen"
          >
            <Menu v-if="!mobileMenuOpen" class="w-6 h-6" />

            <X v-else class="w-6 h-6" />
          </button>
        </div>

        <!-- =====================================================
             桌面端
        ====================================================== -->

        <div
          ref="desktopNavRef"
          class="hidden md:flex flex-1 min-w-0 items-center gap-1"
          :class="{
            'justify-between': overflowNavItems.length > 0,
          }"
          :style="{
            visibility: layoutReady ? 'visible' : 'hidden',
          }"
        >
          <!-- ===================================================
               可见菜单
          ==================================================== -->

          <template v-for="item in visibleNavItems" :key="item.label">
            <!-- ================================================
                 有子菜单
            ================================================= -->

            <div v-if="item.children" class="relative shrink-0">
              <button
                type="button"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
                :class="
                  activeDropdown === item.label || isGroupActive(item)
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-color-400 hover:text-color-300 hover:bg-color-300'
                "
                @click="toggleDropdown(item.label)"
              >
                <Component :is="item.icon" class="w-4 h-4 shrink-0" />

                <span>
                  {{ item.label }}
                </span>

                <ChevronDown
                  class="w-3.5 h-3.5 transition-transform duration-200"
                  :class="{
                    'rotate-180': activeDropdown === item.label,
                  }"
                />
              </button>

              <!-- ==========================================
                   下拉菜单
              =========================================== -->

              <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 scale-95 -translate-y-1"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 -translate-y-1"
              >
                <div
                  v-if="activeDropdown === item.label"
                  class="absolute left-0 top-full mt-1.5 w-44 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl py-1.5 z-50 overflow-hidden"
                >
                  <button
                    v-for="child in item.children"
                    :key="child.path"
                    type="button"
                    class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left transition-colors"
                    :class="
                      isPathActive(child.path)
                        ? 'bg-primary-500/10 text-primary-500 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                    "
                    @click="handleNavigate(child.path)"
                  >
                    <Component :is="child.icon" class="w-4 h-4 shrink-0" />

                    <span>
                      {{ child.label }}
                    </span>
                  </button>
                </div>
              </Transition>
            </div>

            <!-- ================================================
                 普通菜单
            ================================================= -->

            <button
              v-else
              type="button"
              class="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              :class="
                isPathActive(item.path)
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-color-400 hover:text-color-300 hover:bg-color-300'
              "
              @click="handleNavigate(item.path)"
            >
              <Component :is="item.icon" class="w-4 h-4 shrink-0" />

              <span>
                {{ item.label }}
              </span>
            </button>
          </template>

          <!-- =================================================
               更多
          ================================================== -->

          <div v-if="hasOverflow" class="relative shrink-0">
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              :class="
                activeInOverflow
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              "
              @click="toggleMoreMenu()"
              :aria-expanded="activeDropdown === '__more__'"
            >
              <MoreHorizontal class="w-4 h-4 shrink-0" />

              <span>更多</span>

              <ChevronDown
                class="w-3.5 h-3.5 transition-transform duration-200"
                :class="{
                  'rotate-180': activeDropdown === '__more__',
                }"
              />
            </button>

            <!-- ==========================================
                 更多菜单
            =========================================== -->

            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 scale-95 -translate-y-1"
              enter-to-class="opacity-100 scale-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 scale-100 translate-y-0"
              leave-to-class="opacity-0 scale-95 -translate-y-1"
            >
              <div
                v-if="activeDropdown === '__more__'"
                class="absolute right-0 top-full mt-1.5 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl py-2 z-50 overflow-hidden"
              >
                <template
                  v-for="item in overflowNavItems"
                  :key="`overflow-${item.label}`"
                >
                  <!-- ====================================
                       更多中的分组
                  ===================================== -->

                  <div v-if="item.children" class="px-2">
                    <button
                      type="button"
                      class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors"
                      :class="
                        isGroupActive(item)
                          ? 'text-primary-400 bg-primary-500/10'
                          : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                      "
                      @click="toggleDrawerGroup(item.label)"
                    >
                      <span class="flex items-center gap-2.5">
                        <Component :is="item.icon" class="w-4 h-4" />

                        <span>
                          {{ item.label }}
                        </span>
                      </span>

                      <ChevronDown
                        class="w-4 h-4 transition-transform duration-200"
                        :class="{
                          'rotate-180': expandedDrawerGroups[item.label],
                        }"
                      />
                    </button>

                    <div
                      v-show="
                        expandedDrawerGroups[item.label] || isGroupActive(item)
                      "
                      class="pl-3 ml-3 border-l border-zinc-700 space-y-1 mb-1"
                    >
                      <button
                        v-for="child in item.children"
                        :key="`overflow-child-${child.path}`"
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors"
                        :class="
                          isPathActive(child.path)
                            ? 'text-primary-400 bg-primary-500/10 font-medium'
                            : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                        "
                        @click="handleNavigate(child.path)"
                      >
                        <Component
                          :is="child.icon"
                          class="w-3.5 h-3.5 shrink-0"
                        />

                        <span>
                          {{ child.label }}
                        </span>
                      </button>
                    </div>
                  </div>

                  <!-- ====================================
                       更多中的普通菜单
                  ===================================== -->

                  <button
                    v-else
                    type="button"
                    class="mx-2 w-[calc(100%-1rem)] flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
                    :class="
                      isPathActive(item.path)
                        ? 'text-primary-400 bg-primary-500/10 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                    "
                    @click="handleNavigate(item.path)"
                  >
                    <Component :is="item.icon" class="w-4 h-4 shrink-0" />

                    <span>
                      {{ item.label }}
                    </span>
                  </button>
                </template>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>

    <!-- =========================================================
         隐藏测量区域
    ========================================================== -->

    <div
      ref="measureContainerRef"
      class="absolute left-[-99999px] top-[-99999px] invisible pointer-events-none flex items-center gap-1 whitespace-nowrap"
      aria-hidden="true"
    >
      <!-- 每个菜单 -->

      <template
        v-for="(item, index) in navItems"
        :key="`measure-${item.label}`"
      >
        <div :ref="(el) => setMeasureItemRef(el, index)" class="shrink-0">
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          >
            <Component :is="item.icon" class="w-4 h-4 shrink-0" />

            <span>
              {{ item.label }}
            </span>

            <ChevronDown v-if="item.children" class="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </template>

      <!-- 测量更多 -->

      <div ref="measureMoreRef" class="shrink-0">
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
        >
          <MoreHorizontal class="w-4 h-4" />

          <span>更多</span>

          <ChevronDown class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- =========================================================
         手机端抽屉
    ========================================================== -->

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="mobileMenuOpen"
        class="absolute left-0 right-0 md:hidden border-t border-zinc-800 bg-zinc-900 px-4 pt-2 pb-4 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto"
      >
        <template v-for="item in navItems" :key="`mobile-${item.label}`">
          <!-- ==========================================
               手机端分组
          =========================================== -->

          <div v-if="item.children" class="space-y-1">
            <button
              type="button"
              class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              :class="
                isGroupActive(item)
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-zinc-300 hover:bg-zinc-800'
              "
              @click="toggleDrawerGroup(item.label)"
            >
              <div class="flex items-center gap-2.5">
                <Component :is="item.icon" class="w-4 h-4" />

                <span>
                  {{ item.label }}
                </span>
              </div>

              <ChevronDown
                class="w-4 h-4 transition-transform duration-200"
                :class="{
                  'rotate-180': expandedDrawerGroups[item.label],
                }"
              />
            </button>

            <div
              v-show="expandedDrawerGroups[item.label] || isGroupActive(item)"
              class="pl-4 space-y-1 border-l-2 border-zinc-800 ml-3 my-1"
            >
              <button
                v-for="child in item.children"
                :key="`mobile-child-${child.path}`"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors"
                :class="
                  isPathActive(child.path)
                    ? 'text-primary-400 font-medium bg-primary-500/10'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                "
                @click="handleNavigate(child.path)"
              >
                <Component :is="child.icon" class="w-3.5 h-3.5 shrink-0" />

                <span>
                  {{ child.label }}
                </span>
              </button>
            </div>
          </div>

          <!-- ==========================================
               手机端普通菜单
          =========================================== -->

          <button
            v-else
            type="button"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            :class="
              isPathActive(item.path)
                ? 'text-primary-400 bg-primary-500/10'
                : 'text-zinc-300 hover:bg-zinc-800'
            "
            @click="handleNavigate(item.path)"
          >
            <Component :is="item.icon" class="w-4 h-4 shrink-0" />

            <span>
              {{ item.label }}
            </span>
          </button>
        </template>
      </div>
    </Transition>
  </nav>
</template>
