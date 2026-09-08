<script setup lang="ts">
import { ref, onMounted } from "vue";

const qrCodeUrl = ref("");
const isHovered = ref(false);

onMounted(async () => {
  try {
    const qrcode = await import("qrcode");
    qrCodeUrl.value = await qrcode.toDataURL(window.location.href, {
      margin: 2,
    });
  } catch {
    // qrcode module load failed
  }
});
</script>

<template>
  <div
    class="fixed bottom-4 left-[calc(100vw-190px)] max-xl:hidden transition-opacity duration-300"
    :class="isHovered ? 'opacity-100' : 'opacity-60'"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
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
