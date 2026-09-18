<script setup lang="ts">
import {
  ArrowLeft,
  BookOpen,
  Home,
  LoaderCircle,
  Megaphone,
  Menu,
  X,
} from "@lucide/vue";
import SearchBar from "~/components/SearchBar.vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { isMobileOrTablet } from "@/utils";

const keepalive = {
  include: ["IndexPage", "SearchPage"], // 指定需要缓存的页面 name
  max: 5, // 最多缓存 5 个页面
};

const map: Record<string, string> = {
  "so.liumingye.cn": "83440483142f4bb98429a5f41134ee70",
  "xiageba.liumingye.cn": "8b71d9790d3748eaabe7d4e91f0797d5",
  "pan.liumingye.cn": "1f618f8c15b54e95a489b87fb0d534bf",
};

if (import.meta.client && map[location.host]) {
  useScriptCloudflareWebAnalytics({
    token: map[location.host],
    scriptOptions: {
      trigger: "onNuxtReady",
      // 防广告拦截
      // proxy: true,
    },
  });
}

// ---------------- 全局壳（UHeader / UFooter）----------------

const route = useRoute();

// 后台页沿用自身布局，不套用公开站壳
const isAdmin = computed(() => route.path.startsWith("/admin"));

// AI 搜索态原设计不显示页脚
const isAiSearch = computed(
  () => route.path === "/search" && route.query.type === "ai",
);

// 是否展示头部搜索框
const showHeaderSearch = computed(
  () =>
    !isAdmin.value && !(route.path === "/" || route.path.startsWith("/book")),
);

const showChrome = computed(() => !isAdmin.value);

// 头部搜索框内容跟随当前路由关键字
const searchQuery = computed(() => (route.query.q as string) || "");

// 搜索聚焦状态：移动端聚焦搜索时收起主题按钮，避免挤占宽度

const searchBarRef =
  useTemplateRef<InstanceType<typeof SearchBar>>("searchBarRef");
const isSearchFocused = computed(
  () => searchBarRef.value?.isInputFocused || false,
);

const menuItems = computed<NavigationMenuItem[]>(() => [
  {
    to: "/announcement",
    label: "公告列表",
    icon: Megaphone,
    active: route.path.startsWith("/announcement"),
  },
  {
    to: "/book",
    label: "百度小说",
    icon: BookOpen,
    active: route.path.startsWith("/book"),
  },
]);

// ---------------- 页脚 ----------------
const year = new Date().getFullYear();

const legalLinks = [
  { to: "/page/policy", label: "免责声明" },
  { to: "/page/agree", label: "服务协议" },
  { to: "/page/privacy-policy", label: "隐私政策" },
  { to: "/page/version", label: "版权说明" },
  { to: "/page/forbidden-keywords", label: "屏蔽词列表" },
];

const extraLinks = [
  {
    to: "https://beian.miit.gov.cn",
    label: "吉ICP备2026000231号",
    external: true,
  },
  { to: "https://xiageba.apifox.cn/", label: "API", external: true },
  { to: "/sitemap.xml", label: "网站地图" },
  { to: "/admin", label: "管理员登录", external: true },
];

const disableBack = computed(() => {
  // use _path as dependency to force computed update
  // eslint-disable-next-line
  const _path = route.path;
  return window.history.state.back === null;
});

const isMobile = isMobileOrTablet();
</script>

<template>
  <UApp
    :tooltip="{
      delayDuration: 500,
    }"
  >
    <BrowserCompatCheck />
    <NuxtAnnouncer />
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator :height="1" />

    <template v-if="showChrome">
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
            <UTooltip
              ignoreNonKeyboardFocus
              :disabled="disableBack"
              text="返回"
            >
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
          <NuxtLayout>
            <NuxtPage :keepalive="keepalive" />
          </NuxtLayout>
        </div>
      </UMain>

      <UFooter
        :style="{}"
        :ui="{
          container: 'px-1 sm:px-4 lg:px-6 py-4 lg:py-8 text-sm',
          center: 'flex-col',
        }"
      >
        <p>&copy; 2015-{{ year }} 全盘搜 - 公开网盘资源搜索引擎</p>

        <div class="flex items-center justify-center gap-x-2 flex-wrap mt-2">
          <ULink v-for="item in legalLinks" :key="item.to" :to="item.to">
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
      <Qrcode v-if="!isMobile" />
    </template>

    <NuxtLayout v-else>
      <NuxtPage :keepalive="keepalive" />
    </NuxtLayout>
  </UApp>
</template>
