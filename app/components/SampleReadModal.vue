<script setup lang="ts">
import { ChevronLeft, ChevronRight, Key, X } from "@lucide/vue";
import { useScrollLock } from "@vueuse/core";

defineOptions({
  name: "SampleReadModal",
});

export interface SampleReadBook {
  bookId: string;
  bookName: string;
  author?: string;
}

interface SampleReadChapter {
  chapterTitle?: string;
  content?: string;
}

const props = defineProps<{
  book: SampleReadBook | null;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "get-code", book: SampleReadBook): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

const sampleReadContentRef = ref<HTMLDivElement>();
const chapters = ref<SampleReadChapter[]>([]);
const currentIndex = ref(0);
const loading = ref(false);
const error = ref("");

// 打开时锁定 body 滚动，关闭（含外部切换）自动解锁
useScrollLock(window, visible);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open || !props.book) return;
    chapters.value = [];
    currentIndex.value = 0;
    error.value = "";
    loading.value = true;

    try {
      const res = await fetch("/api/novel/sample-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: props.book.bookId }),
      });
      const data = await res.json();
      if (res.ok && data?.chapters) {
        chapters.value = data.chapters;
      } else {
        error.value = data.message || data.error || "获取试读内容失败";
      }
    } catch {
      error.value = "获取试读内容失败";
    } finally {
      loading.value = false;
    }
  },
);

const close = () => {
  visible.value = false;
  chapters.value = [];
  currentIndex.value = 0;
  error.value = "";
};

const prevChapter = () => {
  if (currentIndex.value > 0) currentIndex.value--;
  nextTick(() => sampleReadContentRef.value?.scrollTo({ top: 0 }));
};

const nextChapter = () => {
  if (currentIndex.value < chapters.value.length - 1) currentIndex.value++;
  nextTick(() => sampleReadContentRef.value?.scrollTo({ top: 0 }));
};

const requestGetCode = () => {
  if (props.book) emit("get-code", props.book);
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible && book"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
        @click.self="close"
      >
        <div
          class="flex flex-col max-h-[90vh] modal-content bg-color-100 rounded-xl max-w-2xl w-full border border-color-300 shadow-2xl overflow-hidden"
        >
          <div
            class="flex items-center justify-between py-2 px-3 border-b border-color-300"
          >
            <h3 class="font-medium truncate flex-1 mr-2">
              {{ book.bookName }} - 试读
            </h3>
            <button
              class="text-color-400 transition-all opacity-80 hover:opacity-100 hover:bg-color-300 rounded-md p-2"
              @click="close"
              aria-label="关闭"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- 章节导航 -->
          <div
            v-if="chapters.length > 0"
            class="flex items-center justify-between gap-2 p-3 border-b border-color-300 bg-color-300"
          >
            <button
              class="flex items-center shrink-0 gap-1 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-color-300 bg-color-400 enabled:hover:bg-color-500"
              :disabled="currentIndex === 0"
              @click="prevChapter"
            >
              <ChevronLeft class="w-4 h-4" />
              上一章
            </button>
            <span class="text-sm text-color-300 truncate max-w-[50%]">
              {{ chapters[currentIndex]?.chapterTitle }}
              <span class="text-color-400 ml-1"
                >({{ currentIndex + 1 }}/{{ chapters.length }})</span
              >
            </span>
            <button
              class="flex items-center shrink-0 gap-1 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-color-300 bg-color-400 enabled:hover:bg-color-500"
              :disabled="currentIndex >= chapters.length - 1"
              @click="nextChapter"
            >
              下一章
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>

          <div ref="sampleReadContentRef" class="p-4 flex-1 overflow-auto">
            <div v-if="loading" class="text-center py-12">
              <div
                class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
              />
              <p class="text-zinc-400 text-sm">正在加载试读内容...</p>
            </div>
            <div v-else-if="error" class="text-center py-12">
              <p class="text-red-400 text-sm">{{ error }}</p>
            </div>
            <div v-else-if="chapters.length > 0" class="space-y-4">
              <h4 class="text-lg font-medium text-center">
                {{ chapters[currentIndex]?.chapterTitle }}
              </h4>
              <div
                class="text-color-300 text-sm leading-relaxed whitespace-pre-wrap break-words"
              >
                {{ chapters[currentIndex]?.content }}
              </div>
              <button
                v-if="currentIndex < chapters.length - 1"
                class="flex w-full justify-center items-center gap-1 px-3 py-8 rounded-md text-sm transition-colors bg-color-400 hover:bg-color-500 text-color-300"
                @click="nextChapter"
              >
                下一章
                <ChevronRight class="w-4 h-4" />
              </button>
              <button
                class="flex w-full justify-center items-center gap-1 px-2 py-1.5 !mb-48 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
                @click="requestGetCode"
              >
                <Key class="w-3.5 h-3.5" />
                获取口令
              </button>
            </div>
            <div v-else class="text-center py-12">
              <p class="text-zinc-500 text-sm">暂无试读内容</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
