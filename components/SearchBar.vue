<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMusicStore } from "~/stores/music";
import { Search, X } from "lucide-vue-next";

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "search", value: string): void;
}>();

const router = useRouter();
const musicStore = useMusicStore();

const searchQuery = ref(props.modelValue || "");

watch(
  () => props.modelValue,
  (val) => {
    searchQuery.value = val || "";
  },
);

const updateSearchQuery = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  searchQuery.value = value;
  emit("update:modelValue", value);
};

const handleSearch = () => {
  if (!searchQuery.value.trim()) return;
  musicStore.addSearchHistory(searchQuery.value);
  emit("search", searchQuery.value);
  router.push(`/search?q=${encodeURIComponent(searchQuery.value)}`);
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
    <Search class="absolute left-4 w-5 h-5 text-gray-500" />
    <input
      :value="searchQuery"
      type="text"
      placeholder="请输入搜索内容"
      class="input-search pl-12 pr-20"
      @input="updateSearchQuery"
      @keydown="handleKeydown"
      aria-label="搜索"
    />
    <button
      v-if="searchQuery"
      class="absolute right-20 p-2 text-gray-500 hover:text-white transition-colors"
      @click="clearInput"
      aria-label="清除"
      type="button"
    >
      <X class="w-4 h-4" />
    </button>
    <button
      class="absolute right-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
      @click="handleSearch"
      type="button"
    >
      搜索
    </button>
  </div>
</template>
