<script setup lang="ts">
import Toast from "~/components/Toast.vue";
import { useToast } from "~/composables/useToast";

const { toasts, remove } = useToast();
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <NuxtPage />
    <Toast :toasts="toasts" @remove="remove" />
  </div>
</template>
