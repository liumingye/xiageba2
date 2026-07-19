<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useMusicStore, storeToRefs } from "~/stores/music";
import { Search, X, Music, FolderOpen, Sparkles } from "@lucide/vue";

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "search", value: string): void;
}>();

const router = useRouter();
const musicStore = useMusicStore();

const { searchType } = storeToRefs(musicStore);

const searchQuery = ref(props.modelValue || "");
const isFocused = ref(false);
const isClientMounted = ref(false);
const searchInput = ref<HTMLInputElement>();

onMounted(() => {
  isClientMounted.value = true;
  if (document.activeElement === searchInput.value) {
    isFocused.value = true;
  }
});

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
  let q = keywords ? keywords.trim() : searchQuery.value.trim();
  if (!q) return;
  if (q.length > MAX_KEYWORD_LENGTH) {
    q = q.slice(0, MAX_KEYWORD_LENGTH);
  }

  musicStore.addSearchHistory(q);
  emit("search", q);

  if (searchType.value === "music") {
    router.push(`/search?type=music&q=${encodeURIComponent(q)}`);
  } else if (searchType.value === "resource") {
    router.push(`/search?type=resource&q=${encodeURIComponent(q)}`);
  } else if (searchType.value === "ai") {
    router.push(`/search?type=ai&q=${encodeURIComponent(q)}`);
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

const placeholderText = computed(() => {
  if (!isClientMounted.value) return "";
  if (searchType.value === "music") return "搜你想要的音乐";
  if (searchType.value === "resource") return "搜你想要的网盘资源";
  if (searchType.value === "ai") return "和 AI 聊聊你想找什么... 例如：推荐一些搞笑的动漫、推荐一些周杰伦的热门歌曲";
  return "";
});

defineExpose({
  handleSearch,
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
          :placeholder="placeholderText"
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
          <template v-if="!isClientMounted">
            <div class="icon-btn placeholder-skeleton"></div>
            <div class="icon-btn placeholder-skeleton ml-2"></div>
            <div class="icon-btn placeholder-skeleton ml-2"></div>
          </template>
          <template v-else>
            <button
              class="icon-btn"
              :class="{ primary: searchType === 'music' }"
              @click="searchType = 'music'"
              title="搜索音乐"
            >
              <Music class="w-5 h-5" />
            </button>
            <button
              class="icon-btn ml-2"
              :class="{ primary: searchType === 'resource' }"
              @click="searchType = 'resource'"
              title="搜索资源"
            >
              <FolderOpen class="w-5 h-5" />
            </button>
            <button
              class="icon-btn ml-2"
              :class="{ primary: searchType === 'ai' }"
              @click="searchType = 'ai'"
              title="AI 搜索"
            >
              <Sparkles class="w-5 h-5" />
            </button>
          </template>
        </div>
        <button
          class="bg-primary-500 hover:bg-primary-600 text-white rounded-full w-8 h-8 transition-all duration-200 flex items-center justify-center"
          @click="handleSearch()"
          type="button"
        >
          <Search class="w-4 h-4" />
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
.placeholder-skeleton {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
