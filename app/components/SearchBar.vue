<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useMusicStore } from "~/stores/music";
import { Search, X } from "@lucide/vue";
import SearchSuggestions from "./SearchSuggestions.vue";

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "search", value: string): void;
}>();

const router = useRouter();
const route = useRoute();
const musicStore = useMusicStore();

const searchQuery = ref(props.modelValue || "");
const isInputFocused = ref(false);
const searchInput = ref<HTMLInputElement>();

watch(
  () => props.modelValue,
  (val) => {
    searchQuery.value = val || "";
  },
);

const MAX_KEYWORD_LENGTH = 30;

const updateSearchQuery = (e: Event) => {
  let value = (e.target as HTMLInputElement).value;
  if (value.length > MAX_KEYWORD_LENGTH) {
    value = value.slice(0, MAX_KEYWORD_LENGTH);
  }
  searchQuery.value = value;
  emit("update:modelValue", value);
};

const handleSearch = (keywords?: string) => {
  const q = keywords ? keywords.trim() : searchQuery.value.trim();
  if (!q) return;
  if (q.length > MAX_KEYWORD_LENGTH) return;
  const type = (route.query.type as string) || musicStore.searchType || "music";
  musicStore.addSearchHistory(q);
  emit("search", q);
  if (route.path === "/search") {
    router.push({
      path: "/search",
      query: { ...route.query, q, page: 1 },
    });
  } else {
    router.push({
      path: "/search",
      query: { type, q },
    });
  }
  searchInput.value?.blur();
  isInputFocused.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    handleSearch();
  }
};

const clearInput = () => {
  searchQuery.value = "";
  emit("update:modelValue", "");
  nextTick(() => {
    searchInput.value?.focus();
  });
};

const handleSuggestionSelect = (word: string) => {
  searchQuery.value = word;
  emit("update:modelValue", word);
  handleSearch(word);
};
</script>

<template>
  <div class="flex items-center w-full">
    <div class="flex items-center relative flex-1">
      <input
        ref="searchInput"
        :value="searchQuery"
        :maxlength="MAX_KEYWORD_LENGTH"
        type="text"
        placeholder="请输入搜索内容"
        class="input-search pl-3 pr-10"
        @input="updateSearchQuery"
        @keydown="handleKeydown"
        @focus="isInputFocused = true"
        @blur="isInputFocused = false"
        aria-label="搜索"
      />
      <button
        v-if="searchQuery"
        class="absolute right-2 py-0.5 px-0.5 text-zinc-500 hover:text-white transition-colors bg-zinc-700 rounded-full"
        @click="clearInput"
        aria-label="清除"
        type="button"
      >
        <X class="w-4 h-4" />
      </button>
      <SearchSuggestions
        :query="searchQuery"
        :visible="isInputFocused"
        @select="handleSuggestionSelect"
      />
    </div>
    <button
      class="ml-1 px-2 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
      @click="handleSearch()"
      type="button"
    >
      <Search class="w-6 h-6" />
    </button>
  </div>
</template>
