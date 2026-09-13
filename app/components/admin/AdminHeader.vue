<script setup lang="ts">
import { Music } from "@lucide/vue";
import { useAuth } from "~/composables/useAuth";
import { useRouter } from "vue-router";

const { username, logout } = useAuth();
const router = useRouter();

const handleLogout = () => {
  logout();
  router.push("/admin/login");
};
</script>

<template>
  <header class="bg-default border-b border-muted px-6 py-4">
    <div class="flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-3">
        <div
          class="size-8 bg-linear-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center"
        >
          <Music class="size-5 text-white" />
        </div>
        <h1 class="text-xl font-bold">管理后台</h1>
      </div>

      <div class="flex items-center gap-4">
        <span class="text-muted">{{ username }}</span>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-log-out"
          @click="handleLogout"
        >
          退出
        </UButton>
      </div>
    </div>
  </header>
</template>
