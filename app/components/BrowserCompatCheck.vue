<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useScrollLock } from "@vueuse/core";

const isLocked = useScrollLock(window);
const show = ref(false);
const qrCodeUrl = ref("");

onMounted(async () => {
  // 检测是否支持 @layer 规则块
  const supported = "CSSLayerBlockRule" in window;

  if (!supported) {
    isLocked.value = true;
    show.value = true;
    // 生成当前页面的二维码
    try {
      const qrcode = await import("qrcode");
      qrCodeUrl.value = await qrcode.toDataURL(window.location.href, {
        margin: 2,
        width: 240,
      });
    } catch {
      // qrcode 加载失败，忽略
    }
  }
});
</script>

<template>
  <div v-if="show" class="compat-overlay">
    <div class="compat-card">
      <div class="compat-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
          />
        </svg>
      </div>
      <h1 class="compat-title">浏览器版本过低</h1>
      <p class="compat-desc">
        当前浏览器不支持现代 CSS 特性，无法正常显示本页面。<br />
        请升级浏览器或使用手机扫描下方二维码访问。
      </p>
      <div v-if="qrCodeUrl" class="compat-qr">
        <img :src="qrCodeUrl" alt="扫码访问" />
      </div>
      <p class="compat-hint">扫描二维码在手机上浏览</p>
    </div>
  </div>
</template>

<style scoped>
.compat-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
  color: #e5e5e5;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
}

.compat-card {
  text-align: center;
  max-width: 400px;
  padding: 32px 24px;
}

.compat-icon {
  color: #f59e0b;
  margin-bottom: 24px;
  display: flex;
  justify-content: center;
}

.compat-icon svg {
  animation: spin 3s linear infinite;
}

.compat-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 16px;
}

.compat-desc {
  font-size: 15px;
  line-height: 1.7;
  color: #a3a3a3;
  margin: 0 0 28px;
}

.compat-qr {
  display: inline-block;
  padding: 12px;
  background: #ffffff;
  border-radius: 12px;
  margin-bottom: 12px;
}

.compat-qr img {
  display: block;
  width: 200px;
  height: 200px;
}

.compat-hint {
  font-size: 14px;
  color: #737373;
  margin: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
