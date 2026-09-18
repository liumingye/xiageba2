<script setup lang="ts">
import { Search } from "@lucide/vue";
import { watchDebounced, useVModels } from "@vueuse/core";

interface SuggestionItem {
  word: string;
}

const props = defineProps<{
  query: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "select", value: string): void;
  (e: "close"): void;
  (e: "update:visible", value: boolean): void;
}>();

const { query, visible } = useVModels(props, emit, {
  passive: true,
});

const suggestions = ref<SuggestionItem[]>([]);
const loading = ref(false);

const isVisible = computed(
  () =>
    visible.value && suggestions.value.length > 0 && query.value.trim() !== "",
);

let scriptElement: HTMLScriptElement | null = null;
let callbackName = "";

const removeScript = () => {
  if (scriptElement && scriptElement.parentNode) {
    scriptElement.parentNode.removeChild(scriptElement);
    scriptElement = null;
  }
  if (callbackName && (window as any)[callbackName]) {
    delete (window as any)[callbackName];
    callbackName = "";
  }
};

const clearSuggestions = () => {
  suggestions.value = [];
  removeScript();
};

const fetchSuggestions = async (keyword: string) => {
  // 面板已隐藏时不发起请求（防抖回调可能在失焦后触发）
  if (!props.visible || !keyword.trim()) {
    clearSuggestions();
    return;
  }

  removeScript();

  loading.value = true;
  callbackName = `baidu_sug_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  (window as any)[callbackName] = (data: any) => {
    if (data && data.g) {
      suggestions.value = data.g.map((word: { q: string }) => ({
        word: word.q,
      }));
    } else {
      suggestions.value = [];
    }
    loading.value = false;
    removeScript();
  };

  scriptElement = document.createElement("script");
  scriptElement.src = `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(keyword)}&cb=${callbackName}`;
  scriptElement.onerror = () => {
    suggestions.value = [];
    loading.value = false;
    removeScript();
  };
  document.body.appendChild(scriptElement);
};

// 查询词变化防抖 200ms 后请求联想词，watchDebounced 自动管理计时与清理
watchDebounced(
  query,
  (newVal) => {
    // visible.value = true;
    fetchSuggestions(newVal);
  },
  { debounce: 150 },
);

const handleSelect = (word: string) => {
  emit("select", word);
  visible.value = false;
};

const handleClose = () => {
  emit("close");
  visible.value = false;
};

onBeforeUnmount(() => {
  removeScript();
});
</script>

<template>
  <transition name="fade">
    <div v-if="isVisible" class="suggestions-container">
      <div class="scroll">
        <div
          v-for="(item, index) in suggestions"
          :key="index"
          @mousedown.prevent
        >
          <UButton
            color="neutral"
            variant="soft"
            block
            :ui="{
              base: 'justify-start rounded-none py-3',
            }"
            @click="handleSelect(item.word)"
          >
            <Search class="size-4 shrink-0 text-muted" />
            <span class="truncate">{{ item.word }}</span>
          </UButton>
        </div>
      </div>

      <!-- 底部关闭 -->
      <div class="footer shrink-0" @mousedown.prevent>
        <UButton
          color="neutral"
          variant="soft"
          block
          :ui="{
            base: 'rounded-none py-2.5',
          }"
          @click="handleClose"
        >
          关闭
        </UButton>
      </div>
    </div>
  </transition>
</template>

<style scoped>
@reference "~/assets/css/main.css";

.suggestions-container {
  @apply bg-default border border-accented;

  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  z-index: 100;
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 0.75rem;
}

/* 防止滚动条超出容器 */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.footer {
  @apply border-t border-accented;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
