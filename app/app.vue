<script setup lang="ts">
import { onMounted } from "vue";
import { useMusicStore } from "~/stores/music";
import { useAdminStore } from "~/stores/admin";
import Toast from "~/components/Toast.vue";
import { useToast } from "~/composables/useToast";

const musicStore = useMusicStore();
const adminStore = useAdminStore();
const { toasts, remove } = useToast();

onMounted(() => {
  musicStore.loadSearchHistory();
  adminStore.checkLogin();
});
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <NuxtPage />
    <Toast :toasts="toasts" @remove="remove" />
  </div>
</template>
