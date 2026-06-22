<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="mt-8 text-center">
    <p class="text-sm text-gray-600">
      &copy; {{ year }} 下歌吧 - 免费音乐下载平台
    </p>
    <div class="flex items-center justify-center gap-4 mt-2">
      <a
        href="https://github.com/liumingye/xiageba2"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-gray-600 hover:text-gray-400 transition-colors"
      >
        GitHub
      </a>
      <a
        href="/admin"
        class="text-sm text-gray-600 hover:text-gray-400 transition-colors"
      >
        管理员登录
      </a>
    </div>
  </footer>
</template>
