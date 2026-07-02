<script setup lang="ts">
import { CheckCircle, XCircle, Info, X } from "@lucide/vue";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

const props = defineProps<{
  toasts: ToastItem[];
}>();

const emit = defineEmits<{
  remove: [id: number];
}>();

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colors = {
  success: "bg-green-500/50 border-green-500/50 text-green-400",
  error: "bg-red-500/50 border-red-500/50 text-red-400",
  info: "bg-blue-500/50 border-blue-500/50 text-blue-400",
};
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-50 space-y-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in props.toasts"
          :key="toast.id"
          class="flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg min-w-[280px] max-w-[400px]"
          :class="colors[toast.type]"
        >
          <component :is="icons[toast.type]" class="w-5 h-5 flex-shrink-0" />
          <span class="text-sm text-gray-200 flex-1">{{ toast.message }}</span>
          <button
            class="text-white hover:text-white transition-colors flex-shrink-0"
            @click="emit('remove', toast.id)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
