<script setup lang="ts">
import { ref, watch } from "vue";
import { CheckCircle, MessageSquare, Send } from "@lucide/vue";
import type { RadioGroupItem } from "@nuxt/ui";

const props = defineProps<{
  show: boolean;
  musicId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const isOpen = computed({
  get: () => props.show,
  set: (val) => {
    if (!val) emit("close");
  },
});

const feedbackTypes = ref<RadioGroupItem[]>([
  { value: "BROKEN_LINK", label: "网盘链接失效" },
  { value: "WRONG_CONTENT", label: "网盘内容错误" },
  { value: "WRONG_CODE", label: "网盘提取码错误" },
  { value: "WRONG_QUALITY", label: "网盘音质错误" },
  { value: "WRONG_INFO", label: "歌名/歌手/封面/歌词错误" },
]);

const selectedType = ref("");
const description = ref("");
const email = ref("");
const isSubmitting = ref(false);
const submitted = ref(false);
const errorMsg = ref("");

watch(
  () => props.show,
  (show) => {
    if (show) {
      selectedType.value = "";
      description.value = "";
      email.value = "";
      submitted.value = false;
      errorMsg.value = "";
    }
  },
);

const handleSubmit = async () => {
  if (!selectedType.value) {
    errorMsg.value = "请选择反馈类型";
    return;
  }

  // 验证邮箱格式（如果填写）
  if (email.value.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.value.trim())) {
      errorMsg.value = "请输入正确的邮箱地址";
      return;
    }
  }

  isSubmitting.value = true;
  errorMsg.value = "";

  try {
    const res = await fetch("/api/music/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        musicId: props.musicId,
        type: selectedType.value,
        description: description.value.trim(),
        email: email.value.trim(),
      }),
    });

    if (res.ok) {
      submitted.value = true;
    } else {
      const data = await res.json();
      errorMsg.value = data.message || "提交失败，请稍后重试";
    }
  } catch {
    errorMsg.value = "网络错误，请检查网络连接";
  } finally {
    isSubmitting.value = false;
  }
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="问题反馈"
    :ui="{ width: 'sm:max-w-md' }"
    :close="{
      color: 'neutral',
      variant: 'ghost',
      square: true,
      'aria-label': '关闭',
    }"
    @close="handleClose"
  >
    <template #body>
      <!-- 提交成功 -->
      <div v-if="submitted" class="text-center py-6">
        <div
          class="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle class="w-8 h-8 text-white" />
        </div>
        <h3 class="text-lg font-medium mb-2">反馈已提交</h3>
        <p class="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
          感谢您的反馈，我们会尽快处理
        </p>
        <UButton color="primary" variant="solid" @click="handleClose">
          关闭
        </UButton>
      </div>

      <!-- 反馈表单 -->
      <div v-else class="space-y-4">
        <div class="flex items-center gap-2">
          <MessageSquare class="w-5 h-5 text-primary-500" />
          <h3 class="text-lg font-medium">问题反馈</h3>
        </div>

        <URadioGroup
          v-model="selectedType"
          legend="反馈类型"
          variant="list"
          :items="feedbackTypes"
          :ui="{ legend: 'text-sm font-medium mb-2' }"
        />

        <div>
          <label
            for="feedback-desc"
            class="text-sm font-medium mb-2 block"
          >
            补充说明（选填）
          </label>
          <UTextarea
            id="feedback-desc"
            v-model="description"
            placeholder="补充说明（选填）"
            :rows="3"
            :maxlength="100"
            class="w-full"
          />
          <p class="text-right text-xs text-zinc-400 mt-1">
            {{ description.length }}/100
          </p>
        </div>

        <div>
          <label
            for="feedback-email"
            class="text-sm font-medium mb-2 block"
          >
            邮箱（选填，用于接收处理通知）
          </label>
          <UInput
            id="feedback-email"
            v-model="email"
            type="email"
            placeholder="请输入邮箱"
          />
        </div>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="errorMsg"
          class="!p-3"
        />

        <div class="flex justify-end gap-3 pt-1">
          <UButton
            color="neutral"
            variant="soft"
            @click="handleClose"
          >
            取消
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            :loading="isSubmitting"
            :disabled="isSubmitting"
            @click="handleSubmit"
          >
            <template #leading>
              <Send class="w-4 h-4" />
            </template>
            {{ isSubmitting ? "提交中..." : "提交反馈" }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
