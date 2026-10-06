<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{
  error: NuxtError;
}>();

const { siteShortTitle } = await useSiteSeo();
useSeoMeta({
  title: `${props.error?.status} - ${props.error?.statusText} - ${siteShortTitle}`,
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
