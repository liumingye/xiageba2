<script setup lang="ts">
import Toast from "~/components/Toast.vue";
import { useToast } from "~/composables/useToast";

const { toasts, remove } = useToast();

const keepalive = {
  include: ["IndexPage", "SearchPage"], // 指定需要缓存的页面 name
  max: 5, // 最多缓存 5 个页面
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <NuxtPage :keepalive="keepalive" />
    <Toast :toasts="toasts" @remove="remove" />
  </div>
</template>
