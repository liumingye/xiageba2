<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { watchDebounced } from "@vueuse/core";

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
}>();

const suggestions = ref<SuggestionItem[]>([]);
const isVisible = computed(
  () =>
    props.visible && suggestions.value.length > 0 && props.query.trim() !== "",
);
const loading = ref(false);

let scriptElement: HTMLScriptElement | null = null;
let callbackName = "";

const clearSuggestions = () => {
  suggestions.value = [];
  removeScript();
};

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
  () => props.query,
  (newVal) => {
    fetchSuggestions(newVal);
  },
  { debounce: 200 },
);

// 联想面板不可见时清空面板。
// watch(isVisible, (val) => {
//   if (!val) {
//     clearSuggestions();
//   }
// });

const handleSelect = (word: string) => {
  emit("select", word);
};

const handleClose = () => {
  emit("close");
};

onBeforeUnmount(() => {
  removeScript();
});
</script>

<template>
  <transition name="fade">
    <div
      v-if="isVisible && (suggestions.length > 0 || loading)"
      class="suggestions-container"
    >
      <div class="scroll">
        <div v-if="loading" class="suggestion-item loading">
          <span class="loading-dot"></span>
          <span class="loading-dot"></span>
          <span class="loading-dot"></span>
        </div>
        <button
          v-for="(item, index) in suggestions"
          :key="index"
          class="suggestion-item"
          @click="handleSelect(item.word)"
          type="button"
        >
          <svg
            class="w-4 h-4 text-zinc-500 mr-3 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            ></path>
          </svg>
          <span class="truncate">{{ item.word }}</span>
        </button>
      </div>
      <div class="footer">
        <button class="close-btn" type="button" @click="handleClose">
          关闭
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.suggestions-container {
  @apply bg-color-100 border border-color-300 rounded-xl;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  z-index: 100;
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 防止滚动条超出容器 */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.footer {
  border-top: 1px solid rgba(113, 113, 122, 0.2);
  background: inherit;
  flex-shrink: 0;
}

.close-btn {
  @apply text-color-200 rounded-lg transition-colors;
  display: block;
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
}

.suggestion-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.suggestion-item:hover {
  background: rgba(59, 130, 246, 0.1);
}

.suggestion-item.loading {
  justify-content: center;
  gap: 4px;
  padding: 20px 16px;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #71717a;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.loading-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
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
