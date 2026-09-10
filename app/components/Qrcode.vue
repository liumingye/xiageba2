<script setup lang="ts">
import { ref, onMounted } from "vue";

const qrCodeUrl = ref("");
const route = useRoute();
const qrcode = await import("qrcode");

onMounted(() => {
  watch(
    () => route.path,
    async () => {
      qrCodeUrl.value = await qrcode.toDataURL(window.location.href, {
        margin: 2,
      });
    },
    {
      immediate: true,
    },
  );
});
</script>

<template>
  <div
    class="fixed bottom-4 left-[calc(100vw-12rem)] max-2xl:hidden transition-opacity duration-300 opacity-60 hover:opacity-100"
  >
    <div class="bg-default rounded-lg p-3 border border-muted text-center">
      <div class="size-36 mx-auto bg-white rounded-lg">
        <img
          v-if="qrCodeUrl"
          :src="qrCodeUrl"
          alt="二维码"
          class="w-full h-full rounded-lg"
        />
      </div>
      <p class="text-sm text-bold mt-2">使用手机「扫一扫」</p>
      <p class="text-xs mt-1">手机上浏览，获得更好体验</p>
    </div>
  </div>
</template>
