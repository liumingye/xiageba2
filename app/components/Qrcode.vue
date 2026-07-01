<script setup lang="ts">
const route = useRoute();
const currentUrl = ref("");

onMounted(() => {
  currentUrl.value = window.location.href;
});

const qrUrl = computed(() => {
  if (!currentUrl.value) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl.value)}`;
});
</script>

<template>
  <div
    class="fixed bottom-4 left-4 hidden 2xl:block transition-opacity duration-300 opacity-30 hover:opacity-100"
  >
    <div class="bg-dark-300/90 backdrop-blur-sm rounded-lg p-3 border border-gray-700/50">
      <p class="text-gray-300 text-xs mb-2 text-center leading-relaxed">
        夸克扫码浏览保存更方便
      </p>
      <img
        v-if="qrUrl"
        :src="qrUrl"
        alt="二维码"
        class="w-32 h-32 rounded"
      />
    </div>
  </div>
</template>
