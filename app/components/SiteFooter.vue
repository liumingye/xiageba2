<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<style scoped>
.link {
  @apply text-sm text-color-400 hover:text-color-200 transition-colors;
}
</style>

<template>
  <footer class="mt-8 text-center">
    <p class="text-sm">
      &copy; {{ year }} 全盘搜 - 公开网盘资源搜索引擎
    </p>
    <div class="flex items-center justify-center gap-x-3 mt-2 flex-wrap">
      <NuxtLink to="/page/policy" class="link">免责声明</NuxtLink>
      <NuxtLink to="/page/agree" class="link">服务协议</NuxtLink>
      <NuxtLink to="/page/privacy-policy" class="link">隐私政策</NuxtLink>
      <NuxtLink to="/page/version" class="link">版权说明</NuxtLink>
      <NuxtLink to="/page/forbidden-keywords" class="link">违禁词列表</NuxtLink>
    </div>
    <div class="flex items-center justify-center gap-x-4 mt-2 flex-wrap">
      <a
        href="https://beian.miit.gov.cn"
        target="_blank"
        rel="nofollow"
        class="link"
        >吉ICP备2026000231号</a
      >
      <a
        href="https://xiageba.apifox.cn/"
        target="_blank"
        rel="noopener noreferrer"
        class="link"
      >
        API
      </a>
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
