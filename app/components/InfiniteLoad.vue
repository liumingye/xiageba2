<template>
  <div ref="target"></div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import { useIntersectionObserver } from "@vueuse/core";

const emit = defineEmits<{
  (e: "infinite-load"): void;
}>();

const target = ref<HTMLElement>();
let stopObserver: (() => void) | null = null;

const startObserver = () => {
  stopObserver?.();
  stopObserver = useIntersectionObserver(target, ([entry]) => {
    if (!entry?.isIntersecting) return;
    // 触发后先停止观察，待父组件列表更新后重新观察。
    // 否则当内容不足一屏时（元素始终在视口内），IntersectionObserver
    // 不会产生新的交叉状态变化，导致无限滚动只触发一次后停摆。
    stopObserver?.();
    stopObserver = null;
    emit("infinite-load");
    nextTick(startObserver);
  }).stop;
};

onMounted(startObserver);
onBeforeUnmount(() => {
  stopObserver?.();
  stopObserver = null;
});
</script>
