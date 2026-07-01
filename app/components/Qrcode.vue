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
    class="fixed bottom-4 right-4 hidden xl:block transition-opacity duration-300"
    :class="isHovered ? 'opacity-100' : 'opacity-50'"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div
      class="bg-dark-300/90 backdrop-blur-sm rounded-lg p-3 border border-gray-700/50"
    >
      <p class="text-gray-300 text-xs mb-2 text-center leading-relaxed">
        手机扫码浏览保存更方便
      </p>
      <div class="w-32 h-32">
        <img
          v-if="qrCodeUrl"
          :src="qrCodeUrl"
          alt="二维码"
          class="w-full h-full rounded"
        />
      </div>
    </div>
  </div>
</template>
