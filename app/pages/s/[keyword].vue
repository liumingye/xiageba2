<script setup lang="ts">
// v1版本 /s/:keyword页面 跳转到 /search?q=:keyword 页面
const route = useRoute();
const keyword = (route.params.keyword as string) || "";

await navigateTo({
  path: "/search",
  query: { q: keyword },
});
</script>

<template>
  <div></div>
</template>
