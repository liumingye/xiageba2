<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Music, Users, Settings, MessageSquare } from "lucide-vue-next";

const route = useRoute();

const isActive = (path: string) => {
  if (path === "/admin") {
    return route.path === "/admin";
  }
  return route.path.startsWith(path);
};
</script>

<template>
  <nav class="bg-gray-900/50 border-b border-gray-800 px-6 py-3">
    <div class="flex items-center gap-4 max-w-7xl mx-auto">
      <a
        href="/admin"
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
      >
        <Music class="w-5 h-5" />
        音乐管理
      </a>
      <a
        href="/admin/feedback"
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin/feedback')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
      >
        <MessageSquare class="w-5 h-5" />
        反馈管理
      </a>
      <a
        href="/admin/admins"
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin/admins')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
      >
        <Users class="w-5 h-5" />
        管理员管理
      </a>
      <a
        href="/admin/maintain"
        class="flex items-center gap-2 transition-colors"
        :class="
          isActive('/admin/maintain')
            ? 'text-primary-500 font-medium'
            : 'text-gray-400 hover:text-gray-200'
        "
      >
        <Settings class="w-5 h-5" />
        系统维护
      </a>
    </div>
  </nav>
</template>
