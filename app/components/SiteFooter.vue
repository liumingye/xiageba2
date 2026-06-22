<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="mt-8 text-center">
    <p class="text-sm text-gray-600">
      &copy; {{ year }} 下歌吧 - 免费音乐下载平台
    </p>
    <a
      href="/admin"
      class="text-sm text-gray-600 hover:text-gray-400 transition-colors mt-2 inline-block"
    >
      管理员登录
    </a>
  </footer>
</template>
