<script setup lang="ts">
import { Clipboard, KeyRound, LoaderCircle } from "@lucide/vue";
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

// 无 book 时不打开
const visible = computed({
  get: () => props.modelValue && !!props.book,
  set: (v: boolean) => emit("update:modelValue", v),
});

const pcode = ref("");
const msg = ref("");
const loading = ref(false);
const error = ref("");

const toast = useToast();
const { copy } = useClipboard();

const message = refAutoReset("复制口令", 2000);

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
  toast.add({
    icon: "i-lucide-check",
    title: "口令已复制",
    duration: 2000,
  });
  message.value = "口令已复制";
};
</script>

<template>
  <UModal v-model:open="visible" title="获取口令" @close="close">
    <template #body>
      <div v-if="loading" class="text-center py-10">
        <LoaderCircle
          class="w-9 h-9 animate-spin text-primary-500 mx-auto mb-3"
        />
        <p class="text-zinc-500 dark:text-zinc-400 text-sm">正在生成口令...</p>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="获取失败"
        :description="error"
      />

      <div v-else-if="pcode" class="space-y-4">
        <div class="flex items-center justify-center gap-2">
          <KeyRound class="w-4 h-4 text-primary-500" />
          <p class="font-medium text-center text-lg truncate">
            {{ book?.bookName }}
          </p>
        </div>

        <div
          class="bg-primary-500/10 border border-primary-500/30 rounded-xl p-5 text-center"
        >
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mb-2">网盘口令</p>
          <p
            class="text-3xl font-mono font-bold text-primary-500 tracking-wider select-all break-all"
          >
            {{ pcode }}
          </p>
          <p v-if="msg" class="text-xs text-zinc-400 mt-2">{{ msg }}</p>
        </div>

        <UButton
          color="primary"
          variant="outline"
          block
          size="lg"
          @click="copyCode"
        >
          <template #leading>
            <Clipboard class="w-4 h-4" />
          </template>
          {{ message }}
        </UButton>

        <p class="text-xs text-zinc-500 dark:text-zinc-400 text-center">
          复制口令后，打开百度网盘APP即可阅读全本小说
        </p>
      </div>
    </template>
  </UModal>
</template>
