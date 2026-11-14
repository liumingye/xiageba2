<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { ButtonProps } from "@nuxt/ui";

/**
 * APK 下载按钮
 *
 * 鼠标悬停弹出下载地址二维码（扫码可直接用手机安装）。
 * 二维码按需动态 import，仅在客户端生成，不进入首屏 bundle。
 */
const props = withDefaults(
  defineProps<{
    /** APK 下载地址 */
    to?: string;
    label?: string;
    size?: ButtonProps["size"];
    block?: boolean;
    icon?: ButtonProps["icon"];
  }>(),
  {
    to: "",
    label: "安卓 APK 下载",
    size: "xl",
    block: false,
    icon: "i-lucide-download",
  },
);

const qrCodeUrl = ref("");

let qrcodeLib: typeof import("qrcode") | null = null;

const renderQrCode = async () => {
  if (!props.to) {
    qrCodeUrl.value = "";
    return;
  }
  if (!qrcodeLib) {
    qrcodeLib = await import("qrcode");
  }
  qrCodeUrl.value = await qrcodeLib.toDataURL(props.to, {
    margin: 1,
    width: 320,
  });
};

// 挂载后才生成（客户端才可用 QR 库），地址变化时重新生成
onMounted(renderQrCode);
watch(() => props.to, renderQrCode);
</script>

<template>
  <UPopover
    v-if="to"
    mode="hover"
    arrow
    :open-delay="120"
    :close-delay="200"
    :content="{ side: 'top', sideOffset: 10, collisionPadding: 12 }"
    :ui="{ content: 'p-3' }"
  >
    <UButton
      :to="to"
      target="_blank"
      :label="label"
      :icon="icon"
      :size="size"
      :block="block"
      color="primary"
    />

    <template #content>
      <div class="flex w-40 flex-col items-center gap-2">
        <div
          class="flex size-36 items-center justify-center rounded-lg bg-white p-1.5"
        >
          <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="二维码" class="size-full" />
          <UIcon
            v-else
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-muted"
          />
        </div>
        <p class="text-center text-xs text-muted">使用手机「扫一扫」下载</p>
      </div>
    </template>
  </UPopover>

  <UButton
    v-else
    :label="label"
    :icon="icon"
    :size="size"
    :block="block"
    color="primary"
  />
</template>
