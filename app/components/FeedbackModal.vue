<script setup lang="ts">
import { ref, watch } from "vue";
import { X, MessageSquare, Send, CheckCircle } from "@lucide/vue";

const props = defineProps<{
  show: boolean;
  musicId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const feedbackTypes = [
  { value: "BROKEN_LINK", label: "网盘链接失效" },
  { value: "WRONG_CONTENT", label: "网盘内容错误" },
  { value: "WRONG_CODE", label: "网盘提取码错误" },
  { value: "WRONG_QUALITY", label: "网盘音质错误" },
  { value: "WRONG_INFO", label: "歌名/歌手/封面/歌词错误" },
];

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
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        ></div>

        <div
          class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-md w-full border border-gray-800"
        >
          <button
            class="absolute top-4 right-4 p-2 hover:bg-gray-800 rounded-lg transition-colors"
            @click="handleClose"
          >
            <X class="w-5 h-5 text-gray-400" />
          </button>

          <!-- 提交成功 -->
          <div v-if="submitted" class="text-center py-8">
            <div
              class="w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle class="w-8 h-8 text-green-400" />
            </div>
            <h3 class="text-xl font-medium text-white mb-2">反馈已提交</h3>
            <p class="text-gray-400 text-sm">感谢您的反馈，我们会尽快处理</p>
            <button
              class="mt-6 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
              @click="handleClose"
            >
              关闭
            </button>
          </div>

          <!-- 反馈表单 -->
          <div v-else>
            <div class="flex items-center gap-2 mb-4">
              <MessageSquare class="w-5 h-5 text-primary-500" />
              <h3 class="text-xl font-medium text-white">问题反馈</h3>
            </div>

            <div class="space-y-3 mb-4">
              <label
                v-for="type in feedbackTypes"
                :key="type.value"
                class="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-750 rounded-lg cursor-pointer transition-colors border"
                :class="
                  selectedType === type.value
                    ? 'bg-primary-500/20 border-primary-500/50'
                    : 'border-transparent'
                "
              >
                <input
                  v-model="selectedType"
                  type="radio"
                  :value="type.value"
                  class="w-4 h-4 text-primary-500 bg-gray-700 border-gray-600 focus:ring-primary-500 focus:ring-offset-0"
                />
                <span class="text-white text-sm">{{ type.label }}</span>
              </label>
            </div>

            <div class="relative">
              <textarea
                v-model="description"
                placeholder="补充说明（选填）"
                rows="3"
                maxlength="100"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500/50 resize-none"
                @input="description = description.slice(0, 100)"
              ></textarea>
              <span class="absolute bottom-2 right-3 text-xs text-gray-600">
                {{ description.length }}/100
              </span>
            </div>

            <div class="mt-3">
              <input
                v-model="email"
                type="email"
                placeholder="邮箱（选填，用于接收处理通知）"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
              />
            </div>

            <p v-if="errorMsg" class="text-red-400 text-sm mt-2">
              {{ errorMsg }}
            </p>

            <div class="flex justify-end gap-3 mt-4">
              <button
                class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                @click="handleClose"
              >
                取消
              </button>
              <button
                class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
                :disabled="isSubmitting"
                @click="handleSubmit"
              >
                <Send class="w-4 h-4" />
                {{ isSubmitting ? "提交中..." : "提交反馈" }}
              </button>
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
