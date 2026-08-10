<script setup lang="ts">
import { ArrowLeft, Home, Music } from "@lucide/vue";
import SearchBar from "~/components/SearchBar.vue";
import { useBackHistory } from "~/composables/useBackHistory";

interface Props {
  showSearch?: boolean;
  searchQuery?: string;
  placeholder?: string;
  showThemeSwitcher?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showSearch: true,
  searchQuery: "",
  placeholder: "",
  showThemeSwitcher: false,
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
</script>

<template>
  <nav class="mb-6 bg-zinc-900 border-b border-zinc-800">
    <div class="flex items-center gap-1 max-w-4xl mx-auto px-2 py-2">
      <button
        class="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        @click="navigateTo('/')"
        aria-label="首页"
        title="首页"
      >
        <Home class="w-5 h-5 text-zinc-400" />
      </button>

      <button
        class="p-2 hover:bg-zinc-800 rounded-lg transition-colors mr-auto"
        @click="goBack"
        aria-label="返回"
        title="返回"
      >
        <ArrowLeft class="w-5 h-5 text-zinc-400" />
      </button>

      <SearchBar
        class="max-w-md"
        v-if="showSearch"
        v-model="localQuery"
        :placeholder="placeholder"
        @search="handleSearch"
      />
      <ClientOnly v-if="showThemeSwitcher">
        <ThemeSwitcher />
      </ClientOnly>
    </div>
  </nav>
</template>
