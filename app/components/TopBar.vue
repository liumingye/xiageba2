<script setup lang="ts">
import { ArrowLeft, Home, BookOpen, Menu, X, Megaphone } from "@lucide/vue";
import { onClickOutside } from "@vueuse/core";
import SearchBar from "~/components/SearchBar.vue";
import { useBackHistory } from "~/composables/useBackHistory";

interface Props {
  showSearch?: boolean;
  searchQuery?: string;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showSearch: true,
  searchQuery: "",
  placeholder: "",
});

const emit = defineEmits<{
  search: [keyword: string];
}>();

const { hasBackHistory } = useBackHistory();
const localQuery = ref(props.searchQuery);

watch(
  () => props.searchQuery,
  (val) => {
    localQuery.value = val;
  },
);

const goBack = () => {
  if (hasBackHistory.value) {
    history.back();
  } else {
    navigateTo("/");
  }
};

const handleSearch = (keyword: string) => {
  emit("search", keyword);
};

// 移动端汉堡菜单展开状态
const menuOpen = ref(false);

// 点击菜单链接后关闭移动端子菜单
const closeMenu = () => {
  menuOpen.value = false;
};

// 导航栏根元素 ref，用于点击外部关闭子菜单
const navRef = ref<HTMLElement | null>(null);

// 点击组件外部区域时关闭移动端子菜单
onClickOutside(navRef, () => {
  if (menuOpen.value) {
    menuOpen.value = false;
  }
});

const menu = computed(() => [
  // {
  //   to: "/",
  //   name: "资源投稿",
  // },
  {
    to: "/announcement",
    name: "公告列表",
    icon: Megaphone,
  },
  {
    to: "/book",
    name: "搜小说",
    icon: BookOpen,
  },
]);
</script>

<template>
  <nav ref="navRef" class="mb-6 bg-color-100 border-b border-color-300">
    <div
      class="flex gap-1 md:gap-2 max-w-4xl mx-auto px-2 py-2 text-sm h-[56px]"
    >
      <div class="flex gap-1 md:gap-2 max-w-4xl items-center">
        <NuxtLink
          to="/"
          class="p-2 opacity-80 hover:opacity-100 hover:bg-color-300 rounded-lg transition-colors"
          aria-label="首页"
          title="首页"
        >
          <Home class="w-5 h-5" />
        </NuxtLink>
        <button
          class="p-2 opacity-80 hover:opacity-100 hover:bg-color-300 rounded-lg transition-colors"
          @click="goBack"
          aria-label="返回"
          title="返回"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>

        <!-- 桌面端水平菜单 -->
        <template v-for="item in menu" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="hidden md:flex items-center gap-1 p-2 opacity-80 hover:opacity-100 hover:bg-color-300 rounded-lg transition-colors"
            :aria-label="item.name"
            :title="item.name"
          >
            <component :is="item.icon" class="w-5 h-5" />
            {{ item.name }}
          </NuxtLink>
        </template>
      </div>

      <div
        class="ml-auto flex gap-1 md:gap-2 max-w-xs flex-1 justify-end items-center"
      >
        <SearchBar
          v-if="showSearch"
          v-model="localQuery"
          :placeholder="placeholder"
          @search="handleSearch"
        />

        <ThemeSwitcher v-if="!showSearch" />

        <!-- 移动端汉堡菜单按钮 -->
        <button
          class="md:hidden p-2 opacity-80 hover:opacity-100 hover:bg-color-300 rounded-lg transition-colors"
          :aria-label="menuOpen ? '关闭菜单' : '打开菜单'"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <X v-if="menuOpen" class="w-5 h-5" />
          <Menu v-else class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- 移动端展开的子菜单 -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-2"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-2"
    >
      <div
        v-if="menuOpen"
        class="absolute left-0 right-0 md:hidden border-y border-color-300 bg-color-100 rounded-b-xl"
      >
        <ThemeSwitcher v-if="showSearch" class="!absolute right-2 top-2.5" />
        <nav class="max-w-4xl mx-auto p-2 flex flex-col">
          <template v-for="item in menu" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="flex items-center gap-2 p-2 rounded-lg opacity-80 hover:opacity-100 hover:bg-color-300 transition-colors"
              :aria-label="item.name"
              @click="closeMenu"
            >
              <component :is="item.icon" class="w-5 h-5" />
              {{ item.name }}
            </NuxtLink>
          </template>
        </nav>
      </div>
    </transition>
  </nav>
</template>
