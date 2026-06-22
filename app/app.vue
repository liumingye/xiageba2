<script setup lang="ts">
import { onMounted } from "vue";
import { useMusicStore } from "~/stores/music";
import { useAdminStore } from "~/stores/admin";

const musicStore = useMusicStore();
const adminStore = useAdminStore();

onMounted(() => {
  musicStore.loadSearchHistory();
  adminStore.checkLogin();
});
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <NuxtPage />
  </div>
</template>
