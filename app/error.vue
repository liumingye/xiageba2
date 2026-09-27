<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{
  error: NuxtError;
}>();

useSeoMeta({
  title: `${props.error?.status} - ${props.error?.statusText} - 全盘搜`,
});
</script>

<template>
  <UError
    :clear="{
      color: 'neutral',
      size: 'xl',
      icon: 'i-lucide-arrow-left',
      class: 'rounded-full',
      label: '返回首页',
    }"
    :error="props.error"
  >
  </UError>
</template>
