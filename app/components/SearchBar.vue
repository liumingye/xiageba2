<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMusicStore } from "~/stores/music";
import { Search, X } from "@lucide/vue";

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

const handleSearch = () => {
  const q = searchQuery.value.trim();
  if (!q) return;
  if (q.length > MAX_KEYWORD_LENGTH) return;
  const type = (route.query.type as string) || musicStore.searchType || "music";
  musicStore.addSearchHistory(q);
  emit("search", q);
  router.push(`/search?type=${type}&q=${encodeURIComponent(q)}`);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    handleSearch();
  }
};

const clearInput = () => {
  searchQuery.value = "";
  emit("update:modelValue", "");
};
</script>

<template>
  <div class="flex items-center w-full relative">
    <input
      :value="searchQuery"
      :maxlength="MAX_KEYWORD_LENGTH"
      type="text"
      placeholder="请输入搜索内容"
      class="input-search pl-3 pr-20"
      @input="updateSearchQuery"
      @keydown="handleKeydown"
      aria-label="搜索"
      autofocus
    />
    <button
      v-if="searchQuery"
      class="absolute right-14 py-2 text-gray-500 hover:text-white transition-colors"
      @click="clearInput"
      aria-label="清除"
      type="button"
    >
      <X class="w-4 h-4" />
    </button>
    <button
      class="absolute right-1 px-2 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
      @click="handleSearch"
      type="button"
    >
      <Search />
    </button>
  </div>
</template>
