<script setup lang="ts">
const keepalive = {
  include: ["IndexPage", "SearchPage"], // 指定需要缓存的页面 name
  max: 5, // 最多缓存 5 个页面
};

const map: Record<string, string> = {
  "so.liumingye.cn": "83440483142f4bb98429a5f41134ee70",
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

const { siteDescription, siteShortTitle } = await useSiteSeo();

useSeoMeta({
  titleTemplate: () => `%s - ${siteShortTitle}`,
  description: siteDescription,
  ogDescription: siteDescription,
  twitterDescription: siteDescription,
});
</script>

<template>
  <UApp
    :tooltip="{
      delayDuration: 500,
    }"
  >
    <BrowserCompatCheck />
    <NuxtAnnouncer />
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator :height="1" />
    <NuxtLayout>
      <NuxtPage :keepalive="keepalive" />
    </NuxtLayout>
  </UApp>
</template>
