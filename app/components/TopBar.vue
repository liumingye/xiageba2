<script setup lang="ts">
import { ArrowLeft, Home, Music } from "lucide-vue-next";
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
</script>

<template>
  <nav class="flex items-center gap-4 mb-6">
    <button
      class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
      @click="navigateTo('/')"
      aria-label="主页"
    >
      <Music class="w-5 h-5 text-primary-400" />
    </button>

    <button
      class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
      @click="goBack"
      :aria-label="hasBackHistory ? '返回' : '主页'"
    >
      <component :is="hasBackHistory ? ArrowLeft : Home" class="w-5 h-5 text-gray-400" />
    </button>

    <SearchBar
      v-if="showSearch"
      v-model="localQuery"
      :placeholder="placeholder"
      @search="handleSearch"
    />
  </nav>
</template>
