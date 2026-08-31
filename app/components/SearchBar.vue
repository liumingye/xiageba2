<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
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

const MAX_KEYWORD_LENGTH = 30;

const searchQuery = ref(props.modelValue || "");
const isInputFocused = ref(false);
const searchInput = ref<HTMLInputElement>();

// 监听外部传参变化
watch(
  () => props.modelValue,
  (val) => {
    if (val !== searchQuery.value) {
      searchQuery.value = val || "";
    }
  },
);

// v-model 绑定下，仅在中文拼音选字落盘后触发
watch(searchQuery, (val) => {
  let value = val || "";
  if (value.length > MAX_KEYWORD_LENGTH) {
    value = value.slice(0, MAX_KEYWORD_LENGTH);
    searchQuery.value = value;
  }
  emit("update:modelValue", value);
});

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
  // 避免在拼音输入阶段按回车选字时误触发搜索提交
  if (e.key === "Enter" && !e.isComposing) {
    handleSearch();
  }
};

const clearInput = () => {
  searchQuery.value = "";
  nextTick(() => {
    searchInput.value?.focus();
  });
};

const handleSuggestionSelect = (word: string) => {
  searchQuery.value = word;
  handleSearch(word);
};

const handleSuggestionsClose = () => {
  searchInput.value?.blur();
  isInputFocused.value = false;
};

const blur = () => {
  searchInput.value?.focus();
  searchInput.value?.blur();
};

defineExpose({
  blur,
  isInputFocused,
});
</script>

<template>
  <div class="flex items-center w-full">
    <div class="flex items-center relative flex-1">
      <input
        ref="searchInput"
        v-model="searchQuery"
        :maxlength="MAX_KEYWORD_LENGTH"
        type="text"
        placeholder="请输入搜索内容"
        class="input-search pl-3 pr-16"
        @keydown="handleKeydown"
        @focus="isInputFocused = true"
        @blur="isInputFocused = false"
        aria-label="搜索"
      />
      <button
        v-if="searchQuery"
        class="absolute right-9 py-0.5 px-0.5 opacity-60 hover:opacity-100 transition-all bg-color-400 rounded-full"
        @click="clearInput"
        aria-label="清除"
        type="button"
      >
        <X class="w-4 h-4" />
      </button>
      <button
        class="absolute right-2 py-0.5 px-0.5 opacity-60 hover:opacity-100 transition-all"
        @click="handleSearch()"
        type="button"
      >
        <Search class="w-5 h-5" />
      </button>
      <SearchSuggestions
        :query="searchQuery"
        :visible="isInputFocused"
        @select="handleSuggestionSelect"
        @close="handleSuggestionsClose"
      />
    </div>
  </div>
</template>
