<script setup lang="ts">
import { Music, LogOut } from "@lucide/vue";
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
  <header class="bg-color-100 border-b border-color-300 px-6 py-4">
    <div class="flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center"
        >
          <Music class="w-5 h-5 text-white" />
        </div>
        <h1 class="text-xl font-bold">管理后台</h1>
      </div>

      <div class="flex items-center gap-4">
        <span class="text-color-300">{{ username }}</span>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-color-300 hover:bg-color-400 text-color-300 rounded-lg transition-colors"
          @click="handleLogout"
        >
          <LogOut class="w-4 h-4" />
          退出
        </button>
      </div>
    </div>
  </header>
</template>
