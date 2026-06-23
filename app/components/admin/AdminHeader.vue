<script setup lang="ts">
import { Music, LogOut } from "lucide-vue-next";
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
  <header class="bg-gray-900 border-b border-gray-800 px-6 py-4">
    <div class="flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center"
        >
          <Music class="w-5 h-5 text-white" />
        </div>
        <h1 class="text-xl font-bold text-white">下歌吧管理后台</h1>
      </div>

      <div class="flex items-center gap-4">
        <span class="text-gray-400">{{ username }}</span>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          @click="handleLogout"
        >
          <LogOut class="w-4 h-4" />
          退出
        </button>
      </div>
    </div>
  </header>
</template>
