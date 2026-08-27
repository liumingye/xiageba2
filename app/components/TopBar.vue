<script setup lang="ts">
import { ArrowLeft, Home, BookOpen } from "@lucide/vue";
import SearchBar from "~/components/SearchBar.vue";
import { useBackHistory } from "~/composables/useBackHistory";

interface Props {
  showSearch?: boolean;
  searchQuery?: string;
  placeholder?: string;
  showThemeSwitcher?: boolean;
  showMenu?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showSearch: true,
  searchQuery: "",
  placeholder: "",
  showThemeSwitcher: false,
  showMenu: true,
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

const menu = computed(() => [
  {
    to: "/",
    name: "资源添加",
    show: props.showMenu,
  },
  {
    to: "/",
    name: "test",
    show: props.showMenu,
  },
  {
    to: "/",
    name: "侵权屏蔽",
    show: props.showMenu,
  },
  {
    to: "/book",
    name: "搜小说",
    show: props.showMenu,
    icon: BookOpen,
  },
]);
</script>

<template>
  <nav class="mb-6 bg-zinc-900 border-b border-zinc-800">
    <div
      class="flex items-center gap-1 max-w-4xl mx-auto px-2 py-2 text-zinc-400 text-sm h-[56px]"
    >
      <NuxtLink
        to="/"
        class="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        aria-label="首页"
        title="首页"
      >
        <Home class="w-5 h-5" />
      </NuxtLink>
      <button
        class="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        @click="goBack"
        aria-label="返回"
        title="返回"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>

      <template v-for="item in menu" :key="item.to">
        <NuxtLink
          :to="item.to"
          v-if="item.show"
          class="flex items-center gap-1 p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          :aria-label="item.name"
          :title="item.name"
        >
          <component :is="item.icon" class="w-5 h-5" />
          {{ item.name }}
        </NuxtLink>
      </template>

      <div class="flex-1"></div>

      <SearchBar
        class="ml-auto max-w-md"
        v-if="showSearch"
        v-model="localQuery"
        :placeholder="placeholder"
        @search="handleSearch"
      />
      <ThemeSwitcher v-if="showThemeSwitcher" />
    </div>
  </nav>
</template>
