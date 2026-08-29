<script setup lang="ts">
import { Clipboard, X } from "@lucide/vue";
import { useClipboard, refAutoReset } from "@vueuse/core";

defineOptions({
  name: "GetCodeModal",
});

export interface GetCodeBook {
  bookId: string;
  bookName: string;
  author?: string;
}

const props = defineProps<{
  book: GetCodeBook | null;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

const pcode = ref("");
const msg = ref("");
const loading = ref(false);
const error = ref("");

const { success } = useToast();
const { copy } = useClipboard();

const message = refAutoReset("复制口令", 3000);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open || !props.book) return;
    pcode.value = "";
    msg.value = "";
    error.value = "";
    loading.value = true;

    try {
      const res = await fetch("/api/novel/get-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: props.book.bookId,
          content_title: props.book.bookName,
          content_author: props.book.author,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.pcode) {
        pcode.value = data.pcode;
        msg.value = data.msg || "";
        copy(pcode.value);
      } else {
        error.value = data.message || data.error || "获取口令失败";
      }
    } catch {
      error.value = "获取口令失败";
    } finally {
      loading.value = false;
    }
  },
);

const close = () => {
  visible.value = false;
  pcode.value = "";
  msg.value = "";
  error.value = "";
};

const copyCode = () => {
  copy(pcode.value);
  success("口令已复制");
  message.value = "口令已复制";
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
          class="modal-content bg-color-100 rounded-xl max-w-md w-full border border-color-300 shadow-2xl overflow-hidden"
        >
          <div
            class="flex items-center justify-between py-2 px-3 border-b border-color-300"
          >
            <h3 class="font-medium truncate">获取口令</h3>
            <button
              class="text-color-400 transition-all opacity-80 hover:opacity-100 hover:bg-color-300 rounded-md p-2"
              @click="close"
              aria-label="关闭"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="p-5">
            <div v-if="loading" class="text-center py-8">
              <div
                class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
              />
              <p class="text-gray-500 text-sm">正在生成口令...</p>
            </div>
            <div v-else-if="error" class="text-center py-8">
              <p class="text-red-400 text-sm">{{ error }}</p>
            </div>
            <div v-else-if="pcode" class="space-y-4">
              <p class="font-medium text-center text-lg truncate">
                {{ book.bookName }}
              </p>
              <div
                class="bg-primary-500/10 border border-primary-500/30 rounded-xl p-5 text-center"
              >
                <p class="text-xs text-color-400 mb-2">网盘口令</p>
                <p
                  class="text-3xl font-mono font-bold text-primary-400 tracking-wider select-all"
                >
                  {{ pcode }}
                </p>
              </div>
              <button
                class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                @click="copyCode"
              >
                <Clipboard class="w-4 h-4" />
                {{ message }}
              </button>
              <p class="text-xs text-color-400 text-center">
                复制口令后，打开百度网盘APP即可阅读全本小说
              </p>
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
