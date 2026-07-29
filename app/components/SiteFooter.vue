<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<style scoped>
.link {
  @apply text-sm text-gray-600 hover:text-gray-400 transition-colors;
}
</style>

<template>
  <footer class="mt-8 text-center">
    <p class="text-sm text-gray-600">
      &copy; {{ year }} 下歌吧 - 免费音乐下载平台
    </p>
    <div class="flex items-center justify-center gap-x-4 mt-2 flex-wrap">
      <a
        href="https://beian.miit.gov.cn"
        target="_blank"
        rel="nofollow"
        class="link"
        >吉ICP备2026000231号</a
      >
      <a
        href="/sitemap.xml"
        target="_blank"
        rel="noopener noreferrer"
        class="link"
      >
        网站地图
      </a>
      <a href="/admin" class="link" target="_blank" rel="noopener noreferrer">
        管理员登录
      </a>
    </div>
  </footer>
</template>
