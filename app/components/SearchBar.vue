<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { useMusicStore } from "~/stores/music";
import { Search, X } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
  }>(),
  {
    placeholder: "",
  },
);

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
const showSuggestions = ref(false);

const placeholder = computed(() => props.placeholder || "请输入搜索内容");

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
  isInputFocused.value = false;
  showSuggestions.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  // 避免在拼音输入阶段按回车选字时误触发搜索提交
  if (e.key === "Enter" && !e.isComposing) {
    handleSearch();
  }
};

const clearInput = () => {
  searchQuery.value = "";
};

const handleSuggestionSelect = (word: string) => {
  searchQuery.value = word;
  handleSearch(word);
};

const handleSuggestionsClose = () => {
  // isInputFocused.value = false;
};

defineExpose({
  isInputFocused,
});
</script>

<template>
  <div class="flex items-center w-full">
    <div class="flex items-center relative flex-1 min-w-0">
      <UInput
        v-model="searchQuery"
        :maxlength="MAX_KEYWORD_LENGTH"
        type="text"
        :placeholder="placeholder"
        class="w-full"
        size="md"
        :ui="{
          root: 'w-full',
          trailing: 'pe-1',
        }"
        @keydown="handleKeydown"
        @focus="
          () => {
            isInputFocused = true;
            showSuggestions = true;
          }
        "
        @blur="
          () => {
            isInputFocused = false;
            showSuggestions = false;
          }
        "
        aria-label="搜索"
      >
        <template #trailing>
          <div class="flex items-center gap-0.5">
            <UButton
              v-if="searchQuery"
              color="neutral"
              variant="ghost"
              square
              size="xs"
              :ui="{
                base: 'text-zinc-400 hover:text-zinc-600 dark:hover:text-white',
              }"
              :aria-label="'清除'"
              @click="clearInput"
            >
              <X class="h-4 w-4" />
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              square
              size="xs"
              :ui="{ base: 'text-zinc-400 hover:text-primary-600' }"
              :aria-label="'搜索'"
              @click="handleSearch()"
            >
              <Search class="h-4.5 w-4.5" />
            </UButton>
          </div>
        </template>
      </UInput>
      <SearchSuggestions
        :query="searchQuery"
        v-model:visible="showSuggestions"
        @select="handleSuggestionSelect"
        @close="handleSuggestionsClose"
      />
    </div>
  </div>
</template>
