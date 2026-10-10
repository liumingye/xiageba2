<script setup lang="ts">
import { ref, watch, onMounted } from "vue";

const qrCodeUrl = ref("");
const route = useRoute();

// 模块级缓存：同一次会话内只加载一次 qrcode
let qrcodeLib: typeof import("qrcode") | null = null;

/**
 * 生成当前页面地址的二维码。
 *
 * qrcode 是纯客户端依赖（244 KB），原先在 setup 顶层 `await import("qrcode")`，
 * 会导致：① SSR 阶段加载该模块并阻塞渲染；② setup 变成 async，组件被当成异步组件处理；
 * ③ 客户端 hydration 时立刻发起一个额外 chunk 请求。
 * 改为按需加载后，上述三处开销全部消失。
 */
const renderQrCode = async () => {
  if (import.meta.server) return;
  if (!qrcodeLib) {
    qrcodeLib = await import("qrcode");
  }
  qrCodeUrl.value = await qrcodeLib.toDataURL(window.location.href, {
    margin: 2,
  });
};

// watcher 在 setup 顶层创建，才能随组件卸载自动停止；
// 首次生成交给 onMounted（此时已在客户端，window 可用）
onMounted(renderQrCode);
watch(() => route.path, renderQrCode);
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
