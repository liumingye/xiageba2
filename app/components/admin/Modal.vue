<script setup lang="ts">
import { watch } from "vue";
import { useScrollLock } from "@vueuse/core";
import { X } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    show: boolean;
    title?: string;
    closeOnOverlay?: boolean;
  }>(),
  {
    title: "",
    closeOnOverlay: false,
  },
);

const emit = defineEmits<{ close: [] }>();

const isScrollLocked = useScrollLock(window);

watch(
  () => props.show,
  (show) => {
    isScrollLocked.value = show;
  },
  { immediate: true },
);

const close = () => emit("close");

const handleOverlayClick = () => {
  if (props.closeOnOverlay) close();
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
          @click="handleOverlayClick"
        ></div>

        <div
          class="modal-content relative bg-color-100 rounded-3xl w-full border border-color-300 max-h-[90vh] flex flex-col overflow-hidden max-w-lg"
        >
          <div
            v-if="title"
            class="flex items-center justify-between py-2 px-4 border-b border-color-300"
          >
            <h3 class="font-medium truncate">{{ title }}</h3>
            <button
              class="text-color-400 transition-all opacity-80 hover:opacity-100 hover:bg-color-300 rounded-md p-2"
              @click="close"
              aria-label="关闭"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="p-4 overflow-y-auto">
            <slot />
          </div>

          <div v-if="$slots.footer" class="p-4 border-t border-color-300">
            <slot name="footer" />
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
