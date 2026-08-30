<script setup lang="ts">
import Toast from "~/components/Toast.vue";
import { useToast } from "~/composables/useToast";

const { toasts, remove } = useToast();

const keepalive = {
  include: ["IndexPage", "SearchPage"], // 指定需要缓存的页面 name
  max: 5, // 最多缓存 5 个页面
};

const map: Record<string, string> = {
  "so.liumingye.cn": "83440483142f4bb98429a5f41134ee70",
  "xiageba.liumingye.cn": "8b71d9790d3748eaabe7d4e91f0797d5",
  "pan.liumingye.cn": "1f618f8c15b54e95a489b87fb0d534bf",
};

if (import.meta.client && map[location.host]) {
  useScriptCloudflareWebAnalytics({
    token: map[location.host],
    scriptOptions: {
      trigger: "onNuxtReady",
      // 防广告拦截
      // proxy: true,
    },
  });
}
</script>

<template>
  <div class="min-h-screen">
    <NuxtAnnouncer />
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator color="#3b82f6" :height="2" />
    <NuxtPage :keepalive="keepalive" />
    <Toast :toasts="toasts" @remove="remove" />
  </div>
</template>
