<script setup lang="ts">
import { ArrowLeft, Home, LoaderCircle } from "@lucide/vue";
import SearchBar from "~/components/SearchBar.vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { isMobileOrTablet } from "@/utils";
import type { PublicLayoutConfig, PublicLayoutLink } from "~/utils/page";

/* ---------------- 布局装修配置（后台「页面装修」）---------------- */
// 两个请求必须并行发起：服务端 await useFetch() 会阻塞 SSR，串行写法会把
// TTFB 变成两次往返。Promise.all 里的调用是同步触发的，请求同时在途。
const [{ icpLicence, siteShortTitle }, { data: layoutData }] = await Promise.all(
  [
    useSiteSeo(),
    useFetch<{ data: PublicLayoutConfig }>("/api/layout/default", {
      default: () => ({
        data: { menuItems: [], footerLinks: [] },
      }),
      key: "layout-default",
      dedupe: "defer",
    }),
  ],
);

// ---------------- 全局壳（UHeader / UFooter）----------------

const route = useRoute();

const menuLinks = computed<PublicLayoutLink[]>(() => {
  const list = layoutData.value?.data?.menuItems;
  return list?.length ? list : [];
});

const footerLinks = computed<PublicLayoutLink[]>(() => {
  const list = layoutData.value?.data?.footerLinks;
  return list?.length ? list : [];
});

const menuItems = computed<NavigationMenuItem[]>(() =>
  menuLinks.value.map((item) => {
    const external = /^https?:\/\//i.test(item.to);
    return {
      to: item.to,
      label: item.label,
      // 图标选填：未配置则不传 icon，导航项只展示文案
      icon: item.icon ? `i-lucide-${item.icon}` : undefined,
      target: external ? "_blank" : undefined,
      active: !external && route.path.startsWith(item.to),
    };
  }),
);

// 是否展示头部搜索框
const showHeaderSearch = computed(
  () => !(route.path === "/" || route.path.startsWith("/book")),
);

const showFooter = computed(
  () => !(route.path === "/search" && route.query.type === "ai"),
);

// 头部搜索框内容跟随当前路由关键字
const searchQuery = computed(() => (route.query.q as string) || "");

// 搜索聚焦状态：移动端聚焦搜索时收起主题按钮，避免挤占宽度

const searchBarRef =
  useTemplateRef<InstanceType<typeof SearchBar>>("searchBarRef");
const isSearchFocused = computed(
  () => searchBarRef.value?.isInputFocused || false,
);

// ---------------- 页脚 ----------------
const year = new Date().getFullYear();

const extraLinks = [
  {
    to: "https://github.com/liumingye/xiageba2",
    label: "GitHub",
    external: true,
  },
  { to: "/sitemap.xml", label: "网站地图" },
  { to: "/admin/login", label: "管理员登录", external: true },
];

if (icpLicence) {
  extraLinks.unshift({
    to: "https://beian.miit.gov.cn",
    label: icpLicence,
    external: true,
  });
}

const disableBack = computed(() => {
  // use _path as dependency to force computed update
  // eslint-disable-next-line
  const _path = route.path;
  return window.history.state.back === null;
});

const isMobile = isMobileOrTablet();
</script>

<template>
  <UHeader
    :style="{ '--ui-container': 'var(--container-4xl)' }"
    :ui="{
      left: 'lg:flex-0 gap-0.5 sm:gap-1.5',
      right: 'flex-1 gap-0.5 sm:gap-1.5',
      container: 'px-2 sm:px-2 lg:px-2 gap-0.5 sm:gap-1.5',
      header: 'px-2 sm:px-2 lg:px-2 gap-0.5 sm:gap-1.5',
      center: 'hidden md:flex',
      content: 'bottom-auto rounded-b-xl',
      body: 'p-2 sm:p-2',
      toggle: `md:hidden transition-[max-width,opacity,padding] shrink-0 me-0 duration-100 ${
        isSearchFocused
          ? 'max-sm:max-w-0 max-sm:opacity-0 max-sm:p-0'
          : 'max-sm:max-w-19'
      }`,
    }"
  >
    <template #left>
      <UTooltip ignoreNonKeyboardFocus text="首页">
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          square
          aria-label="首页"
          :active="route.path === '/'"
          active-color="primary"
          active-class="bg-elevated"
          class="hover:bg-elevated"
        >
          <Home class="size-5" />
        </UButton>
      </UTooltip>
      <ClientOnly>
        <UTooltip ignoreNonKeyboardFocus :disabled="disableBack" text="返回">
          <UButton
            color="neutral"
            variant="ghost"
            square
            aria-label="返回"
            :disabled="disableBack"
            @click="$router.back()"
          >
            <ArrowLeft class="size-5" />
          </UButton>
        </UTooltip>
        <template #fallback>
          <UButton
            color="neutral"
            variant="ghost"
            square
            disabled
            aria-label="返回"
          >
            <ArrowLeft class="size-5" />
          </UButton>
        </template>
      </ClientOnly>
    </template>

    <UNavigationMenu :items="menuItems" />

    <template #right>
      <div class="flex items-center gap-1 md:gap-2 flex-1 sm:max-w-md">
        <div class="flex-1">
          <SearchBar
            ref="searchBarRef"
            v-if="showHeaderSearch"
            :model-value="searchQuery"
            class="w-full"
          />
        </div>
        <div
          class="flex transition-[max-width,opacity] shrink-0 duration-100"
          :class="[
            isSearchFocused
              ? 'max-sm:max-w-0 max-sm:opacity-0'
              : 'max-sm:max-w-19',
          ]"
        >
          <ClientOnly>
            <ThemeSwitcher />
            <template #fallback>
              <UButton
                color="neutral"
                variant="ghost"
                square
                disabled
                aria-label="主题设置"
              >
                <LoaderCircle class="size-5 animate-spin" />
              </UButton>
            </template>
          </ClientOnly>
        </div>
      </div>
    </template>

    <template #body>
      <UNavigationMenu
        :items="menuItems"
        orientation="vertical"
        :ui="{
          link: 'py-3',
        }"
      />
    </template>
  </UHeader>

  <UMain
    class="flex-1 pt-6"
    :ui="{
      base: 'min-h-0',
    }"
  >
    <div class="max-w-4xl mx-auto px-2">
      <slot />
    </div>
  </UMain>

  <UFooter
    v-if="showFooter"
    :style="{}"
    :ui="{
      container: 'px-1 sm:px-4 lg:px-6 py-4 lg:py-8 text-sm',
      center: 'flex-col',
    }"
  >
    <p>&copy; 2015-{{ year }} {{ siteShortTitle }} - 公开网盘资源搜索引擎</p>

    <div class="flex items-center justify-center gap-x-2 flex-wrap mt-2">
      <ULink v-for="item in footerLinks" :key="item.to" :to="item.to">
        {{ item.label }}
      </ULink>
    </div>

    <div class="flex items-center justify-center gap-x-2 flex-wrap mt-2">
      <ULink
        v-for="item in extraLinks"
        :key="item.to"
        :to="item.to"
        target="_blank"
        :no-rel="!item.external"
      >
        {{ item.label }}
      </ULink>
    </div>
  </UFooter>
  <ClientOnly>
    <Qrcode v-if="!isMobile" />
  </ClientOnly>
</template>
