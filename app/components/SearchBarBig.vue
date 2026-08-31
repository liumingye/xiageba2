<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useMusicStore, storeToRefs } from "~/stores/music";
import { Search, X, Music, FolderOpen, Sparkles } from "@lucide/vue";
import SearchSuggestions from "./SearchSuggestions.vue";
import { useMounted } from "@vueuse/core";

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

const MAX_KEYWORD_LENGTH = 30;

const searchQuery = ref(props.modelValue || "");
const isFocused = ref(false);
const isMounted = useMounted();
const searchInput = ref<HTMLInputElement>();

onMounted(() => {
  if (document.activeElement === searchInput.value) {
    isFocused.value = true;
  }
});

// 监听父组件传参
watch(
  () => props.modelValue,
  (val) => {
    if (val !== searchQuery.value) {
      searchQuery.value = val || "";
    }
  },
);

// v-model 仅在汉字落盘/输入完成后触发 watch
watch(searchQuery, (val) => {
  let value = val || "";
  if (value.length > MAX_KEYWORD_LENGTH) {
    value = value.slice(0, MAX_KEYWORD_LENGTH);
    searchQuery.value = value;
  }
  emit("update:modelValue", value);
});

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
  // 避免回车确认拼音时误触发搜索提交
  if (e.key === "Enter" && !e.isComposing) {
    handleSearch();
  }
};

const clearInput = () => {
  searchQuery.value = "";
  // nextTick(() => {
  //   searchInput.value?.focus();
  // });
};

const handleSuggestionSelect = (word: string) => {
  searchQuery.value = word;
  handleSearch(word);
};

const handleSuggestionsClose = () => {
  searchInput.value?.blur();
  isFocused.value = false;
};

const placeholderText = computed(() => {
  if (!isMounted.value) return "";
  if (searchType.value === "music") return "搜你想要的音乐";
  if (searchType.value === "resource") return "搜你想要的网盘资源";
  if (searchType.value === "ai") return "和 AI 聊聊你想找什么...";
  return "";
});

onActivated(() => {
  searchQuery.value = "";
});

defineExpose({
  handleSearch,
});
</script>

<template>
  <div class="w-full max-w-[720px] mx-auto mb-6">
    <div
      class="border-2 rounded-3xl transition-all duration-300 h-28 md:h-32 relative bg-color-100 px-4 py-4"
      :class="
        isFocused
          ? 'border-primary-500 shadow-lg shadow-primary-500/20'
          : 'border-color-300'
      "
    >
      <input
        ref="searchInput"
        v-model="searchQuery"
        :maxlength="MAX_KEYWORD_LENGTH"
        type="text"
        :placeholder="placeholderText"
        class="w-full bg-transparent text-lg outline-none placeholder-zinc-500"
        @keydown="handleKeydown"
        @focus="isFocused = true"
        @blur="isFocused = false"
        aria-label="搜索"
        autofocus
      />

      <div
        class="bottom-3 left-4 right-4 absolute flex items-center justify-center"
        @click.stop="searchInput?.focus()"
      >
        <div class="flex flex-1 gap-2">
          <template v-if="!isMounted">
            <div class="icon-btn placeholder-skeleton"></div>
            <div class="icon-btn placeholder-skeleton"></div>
            <div class="icon-btn placeholder-skeleton"></div>
          </template>
          <template v-else>
            <button
              class="icon-btn"
              :class="{ primary: searchType === 'resource' }"
              @click="searchType = 'resource'"
              title="搜索资源"
              type="button"
            >
              <FolderOpen class="w-5 h-5" />
            </button>
            <button
              class="icon-btn"
              :class="{ primary: searchType === 'music' }"
              @click="searchType = 'music'"
              title="搜索音乐"
              type="button"
            >
              <Music class="w-5 h-5" />
            </button>
            <button
              class="icon-btn"
              :class="{ primary: searchType === 'ai' }"
              @click="searchType = 'ai'"
              title="AI 搜索"
              type="button"
            >
              <Sparkles class="w-5 h-5" />
            </button>
          </template>
        </div>
        <button
          v-if="searchQuery"
          class="px-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors flex-shrink-0"
          @click="clearInput"
          aria-label="清除"
          type="button"
        >
          <X class="w-5 h-5" />
        </button>
        <button
          class="bg-primary-600 hover:bg-primary-500 text-white rounded-full w-8 h-8 transition-all duration-200 flex items-center justify-center cursor-pointer"
          @click.stop="handleSearch()"
          type="button"
        >
          <Search class="w-4 h-4" />
        </button>
      </div>

      <SearchSuggestions
        :query="searchQuery"
        :visible="isFocused"
        @select="handleSuggestionSelect"
        @close="handleSuggestionsClose"
      />
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

  &:hover {
    background-color: rgba(133, 133, 133, 0.16);
  }
}

.icon-btn.primary {
  background-color: var(--primary);
  color: #ffffff;
}

.placeholder-skeleton {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
