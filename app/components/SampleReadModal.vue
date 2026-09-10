<script setup lang="ts">
import { ChevronLeft, ChevronRight, Key, LoaderCircle } from "@lucide/vue";
import { useVModels } from "@vueuse/core";

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

const { modelValue } = useVModels(props, emit, {
  passive: true,
});

const sampleReadContentRef = useTemplateRef("sampleReadContentRef");
const chapters = ref<SampleReadChapter[]>([]);
const currentIndex = ref(0);
const loading = ref(false);
const error = ref("");

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

const scrollToTop = () => {
  nextTick(() => sampleReadContentRef.value?.scrollTo({ top: 0 }));
};

const prevChapter = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    scrollToTop();
  }
};

const nextChapter = () => {
  if (currentIndex.value < chapters.value.length - 1) {
    currentIndex.value++;
    scrollToTop();
  }
};

const requestGetCode = () => {
  if (props.book) emit("get-code", props.book);
};
</script>

<template>
  <UModal
    v-model:open="modelValue"
    :title="book ? `${book.bookName} - 试读` : '试读'"
    :ui="{
      body: 'p-2 sm:p-4',
      content: 'max-w-3xl',
    }"
  >
    <template #body>
      <div class="flex flex-col min-h-0">
        <!-- 章节导航 -->
        <div
          v-if="chapters.length > 0"
          class="flex items-center justify-between gap-2 mb-3 rounded-lg bg-muted px-3 py-2"
        >
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="currentIndex === 0"
            @click="prevChapter"
          >
            <ChevronLeft class="w-4 h-4" />
            上一章
          </UButton>
          <span class="text-sm text-muted truncate max-w-[50%]">
            {{ currentIndex + 1 }}/{{ chapters.length }}
          </span>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="currentIndex >= chapters.length - 1"
            @click="nextChapter"
          >
            下一章
            <ChevronRight class="w-4 h-4" />
          </UButton>
        </div>

        <!-- 内容滚动区 -->
        <div
          ref="sampleReadContentRef"
          class="min-h-0 overflow-auto max-h-[58vh] pr-1"
        >
          <div v-if="loading" class="text-center py-12">
            <LoaderCircle
              class="w-10 h-10 animate-spin text-primary-500 mx-auto mb-3"
            />
            <p class="text-muted text-sm">正在加载试读内容...</p>
          </div>

          <UAlert
            v-else-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="加载失败"
            :description="error"
            class="mb-2"
          />

          <div v-else-if="chapters.length > 0" class="space-y-4">
            <h4 class="text-lg font-medium text-center">
              {{ chapters[currentIndex]?.chapterTitle }}
            </h4>
            <div
              class="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word"
            >
              {{ chapters[currentIndex]?.content }}
            </div>
            <UButton
              v-if="currentIndex < chapters.length - 1"
              color="neutral"
              variant="soft"
              block
              class="py-8"
              @click="nextChapter"
            >
              下一章
              <ChevronRight class="w-4 h-4" />
            </UButton>
            <UButton
              color="primary"
              variant="solid"
              block
              class="mb-8 text-xs"
              @click="requestGetCode"
            >
              <template #leading>
                <Key class="w-3.5 h-3.5" />
              </template>
              获取口令
            </UButton>
          </div>

          <div v-else class="text-center py-12">
            <p class="text-muted text-sm">暂无试读内容</p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
