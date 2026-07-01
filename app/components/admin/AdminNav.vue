<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { Music, Users, Settings, MessageSquare } from "@lucide/vue";

const route = useRoute();
const router = useRouter();

const isActive = (path: string) => {
  if (path === "/admin") {
    return route.path === "/admin";
  }
  return route.path.startsWith(path);
};

const navigate = (path: string) => {
  router.push(path);
};
</script>

<template>
  <nav class="bg-gray-900/50 border-b border-gray-800 px-6 py-3">
    <div class="flex items-center gap-4 max-w-7xl mx-auto">
      <button
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
        @click="navigate('/admin')"
      >
        <Music class="w-5 h-5" />
        音乐管理
      </button>
      <button
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin/feedback')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
        @click="navigate('/admin/feedback')"
      >
        <MessageSquare class="w-5 h-5" />
        反馈管理
      </button>
      <button
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin/admins')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
        @click="navigate('/admin/admins')"
      >
        <Users class="w-5 h-5" />
        管理员管理
      </button>
      <button
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin/maintain')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
        @click="navigate('/admin/maintain')"
      >
        <Settings class="w-5 h-5" />
        系统维护
      </button>
    </div>
  </nav>
</template>
