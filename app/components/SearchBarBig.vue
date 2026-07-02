<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useMusicStore } from "~/stores/music";
import { Search, X, Music, Video, FolderOpen } from "@lucide/vue";
import { on } from "events";

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
const isFocused = ref(false);

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
  musicStore.addSearchHistory(q);
  emit("search", q);
  if (currentSearchType.value === "music") {
    router.push(`/search?type=music&q=${encodeURIComponent(q)}`);
  } else if (currentSearchType.value === "resource") {
    router.push(`/search?type=resource&q=${encodeURIComponent(q)}`);
  } else {
    // ponytail: video 仍走外部站点
    window.open(`https://pan.liumingye.cn/s/${q}`);
  }
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

const currentSearchType = ref("music");

const searchInput = ref<HTMLInputElement>();

onMounted(() => {
  if (searchInput.value?.focus) {
    isFocused.value = true;
  }
});
</script>

<template>
  <div class="w-full max-w-[720px] mx-auto mb-6">
    <div
      class="border-2 rounded-3xl transition-all duration-300 h-32 relative bg-gray-800"
      :class="
        isFocused
          ? 'border-primary-500 shadow-lg shadow-primary-500/20'
          : 'border-white/20 hover:border-white/40'
      "
      @click.stop="searchInput?.focus()"
    >
      <div class="top-0 left-4 right-4 absolute flex items-center py-4">
        <input
          ref="searchInput"
          :value="searchQuery"
          :maxlength="MAX_KEYWORD_LENGTH"
          type="text"
          :placeholder="
            currentSearchType === 'music'
              ? '搜你想要的歌'
              : currentSearchType === 'resource'
                ? '搜你想要的网盘资源'
                : '搜你想要的视频'
          "
          class="flex-1 bg-transparent text-white text-lg outline-none placeholder-white/50"
          @input="updateSearchQuery"
          @keydown="handleKeydown"
          @focus="isFocused = true"
          @blur="isFocused = false"
          aria-label="搜索"
          autofocus
        />
        <button
          v-if="searchQuery"
          class="px-3 text-white/60 hover:text-white transition-colors"
          @click="clearInput"
          aria-label="清除"
          type="button"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      <div
        class="bottom-3 left-4 right-4 absolute flex items-center justify-center"
      >
        <div class="flex flex-1">
          <button
            class="icon-btn"
            :class="{ primary: currentSearchType === 'music' }"
            @click="currentSearchType = 'music'"
            title="搜索音乐"
          >
            <Music class="w-5 h-5" />
          </button>
          <button
            class="icon-btn ml-2"
            :class="{ primary: currentSearchType === 'resource' }"
            @click="currentSearchType = 'resource'"
            title="搜索资源"
          >
            <FolderOpen class="w-5 h-5" />
          </button>
          <button
            class="icon-btn ml-2"
            :class="{ primary: currentSearchType === 'video' }"
            @click="currentSearchType = 'video'"
            title="搜索视频"
          >
            <Video class="w-5 h-5" />
          </button>
        </div>
        <button
          class="bg-primary-500 hover:bg-primary-600 text-white rounded-full w-8 h-8 transition-all duration-200"
          @click="handleSearch"
          type="button"
        >
          <Search class="mx-auto w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s ease;
  pointer-events: auto;
  position: relative;
  z-index: 10;
}
.icon-btn.primary {
  background-color: rgb(246, 248, 255);
  color: #3b82f6;
}
</style>
