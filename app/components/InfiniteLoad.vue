<template>
  <div ref="target"></div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
const emit = defineEmits<{
  (e: "infinite-load"): void;
}>();
const target = ref();
useIntersectionObserver(target, (entries) => {
  if (!entries[0]) return;
  if (entries[0].isIntersecting) emit("infinite-load");
});
</script>
