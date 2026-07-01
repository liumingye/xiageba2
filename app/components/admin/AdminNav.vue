<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Music,
  Users,
  Settings,
  MessageSquare,
  FolderOpen,
  Database,
  Tags,
  UserCog,
} from "@lucide/vue";

const route = useRoute();
const router = useRouter();

const resourceOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const isActive = (path: string) => {
  if (path === "/admin") {
    return route.path === "/admin";
  }
  return route.path.startsWith(path);
};

const navigate = (path: string) => {
  resourceOpen.value = false;
  router.push(path);
};

const toggleResource = () => {
  resourceOpen.value = !resourceOpen.value;
};

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    resourceOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <nav class="bg-gray-900/50 border-b border-gray-800 px-6 py-3">
    <div class="flex items-center gap-6 max-w-7xl mx-auto">
      <div ref="dropdownRef" class="relative">
        <button
          class="flex items-center gap-2 transition-colors"
          :class="
            resourceOpen ||
            isActive('/admin/resource') ||
            isActive('/admin/category') ||
            isActive('/admin/account')
              ? 'text-primary-500 font-medium'
              : 'text-gray-400 hover:text-gray-200'
          "
          @click="toggleResource"
        >
          <FolderOpen class="w-5 h-5" />
          资源
          <svg
            class="w-4 h-4 transition-transform"
            :class="resourceOpen ? 'rotate-180' : ''"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>

        <div
          v-if="resourceOpen"
          class="absolute left-0 top-full mt-2 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
        >
          <button
            class="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
            :class="
              isActive('/admin/resource')
                ? 'bg-primary-500/10 text-primary-500'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            "
            @click="navigate('/admin/resource')"
          >
            <Database class="w-4 h-4" />
            资源管理
          </button>
          <button
            class="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
            :class="
              isActive('/admin/category')
                ? 'bg-primary-500/10 text-primary-500'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            "
            @click="navigate('/admin/category')"
          >
            <Tags class="w-4 h-4" />
            分类管理
          </button>
          <button
            class="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
            :class="
              isActive('/admin/account')
                ? 'bg-primary-500/10 text-primary-500'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            "
            @click="navigate('/admin/account')"
          >
            <UserCog class="w-4 h-4" />
            账号管理
          </button>
        </div>
      </div>

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
