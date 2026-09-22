<script setup lang="ts">
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

const isMounted = useMounted();

const MAX_KEYWORD_LENGTH = 30;

const searchQuery = ref(props.modelValue || "");
const isInputFocused = ref(false);
const showSuggestions = ref(false);

const searchInput = ref(null);

const getNativeInput = (): HTMLInputElement | undefined => {
  const inst = searchInput.value as any;
  const r = inst?.inputRef;
  if (!r) return undefined;
  // inputRef 可能是 Ref（需取 .value），也可能是已解包的元素
  return typeof r === "object" && "value" in r && !("nodeType" in r)
    ? r.value
    : r;
};

onMounted(() => {
  if (document.activeElement === getNativeInput()) {
    isInputFocused.value = true;
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
    router.push(`/search?type=music&q=${encodeURIComponent(q)}&exact=true`);
  } else if (searchType.value === "resource") {
    router.push(`/search?type=resource&q=${encodeURIComponent(q)}&exact=true`);
  } else if (searchType.value === "ai") {
    router.push(`/search?type=ai&q=${encodeURIComponent(q)}`);
  }

  isInputFocused.value = false;
  showSuggestions.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  // 避免回车确认拼音时误触发搜索提交
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
  <div class="w-full max-w-160 mx-auto mb-6">
    <div
      class="relative rounded-2xl border bg-muted transition-all duration-300 px-4 py-3"
      :class="
        isInputFocused
          ? 'border-primary-500 ring-1 ring-primary-500 shadow-lg shadow-primary-500/20'
          : 'border-muted'
      "
      @click.stop="getNativeInput()?.focus()"
    >
      <UInput
        ref="searchInput"
        v-model="searchQuery"
        :maxlength="MAX_KEYWORD_LENGTH"
        type="text"
        :placeholder="placeholderText"
        variant="none"
        size="xl"
        autofocus
        :ui="{
          root: 'mt-1 w-full',
          base: 'placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-lg p-0 rounded-none',
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
      />

      <div class="mt-8 flex items-center justify-center">
        <div class="flex flex-1 items-center gap-1.5">
          <ClientOnly>
            <UTooltip
              ignoreNonKeyboardFocus
              v-for="item in [
                {
                  type: 'resource',
                  icon: FolderOpen,
                  title: '搜索资源',
                },
                {
                  type: 'music',
                  icon: Music,
                  title: '搜索音乐',
                },
                {
                  type: 'ai',
                  icon: Sparkles,
                  title: 'AI 搜索',
                },
              ]"
              :key="item.type"
              :text="item.title"
            >
              <UButton
                color="neutral"
                variant="soft"
                :ui="{ base: 'rounded-full' }"
                square
                size="lg"
                :active="searchType === item.type"
                active-color="primary"
                active-variant="solid"
                :aria-label="item.title"
                @click="searchType = item.type"
              >
                <component :is="item.icon" class="size-5" />
              </UButton>
            </UTooltip>
            <template #fallback>
              <USkeleton
                v-for="n in 3"
                :key="n"
                class="size-9 rounded-full bg-accented"
              />
            </template>
          </ClientOnly>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <UButton
            v-if="searchQuery"
            color="neutral"
            variant="ghost"
            square
            size="lg"
            :ui="{ base: 'rounded-full' }"
            aria-label="清除"
            @click="clearInput"
          >
            <X class="size-5" />
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            square
            size="lg"
            :ui="{
              base: 'rounded-full shadow-md shadow-primary-500/30 cursor-pointer',
            }"
            aria-label="搜索"
            @click.stop="handleSearch()"
          >
            <Search class="size-5" />
          </UButton>
        </div>
      </div>

      <SearchSuggestions
        :query="searchQuery"
        v-model:visible="showSuggestions"
        @select="handleSuggestionSelect"
      />
    </div>
  </div>
</template>
