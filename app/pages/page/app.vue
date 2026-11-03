<script setup lang="ts">
import { onMounted, ref, watch, computed } from "vue";
import type { ButtonProps } from "@nuxt/ui";
import {
  DEFAULT_APP_PREVIEW_IMAGE,
  emptyAppConfig,
  type AppDownloadConfig,
} from "~/utils/app";

defineOptions({ name: "AppDownloadPage" });

const { siteShortTitle, siteDescription } = await useSiteSeo();

interface AppConfigResponse {
  data: AppDownloadConfig;
}

const { data } = await useFetch<AppConfigResponse>("/api/app/config", {
  default: () => ({ data: emptyAppConfig() }),
  key: "app-config",
  dedupe: "defer",
});

const appConfig = computed<AppDownloadConfig>(
  () => data.value?.data || emptyAppConfig(),
);

/** 是否配置了 APK 下载地址 */
const hasApk = computed(() => !!appConfig.value.apkUrl);

/** 预览图地址，未配置时回落到默认图 */
const previewImage = computed(
  () => appConfig.value.previewImageUrl || DEFAULT_APP_PREVIEW_IMAGE,
);

/** APK 下载按钮（悬停展示下载地址二维码） */
const downloadLink = computed<ButtonProps>(() => ({
  label: "安卓 APK 下载",
  icon: "i-lucide-download",
  to: appConfig.value.apkUrl,
  target: "_blank",
  color: "primary",
  size: "lg",
}));

useSeoMeta({
  title: "APP 下载",
  description: `下载 APP 客户端 - ${siteShortTitle}`,
  ogTitle: "APP 下载",
  ogDescription: `下载 APP 客户端 - ${siteShortTitle}`,
  twitterTitle: "APP 下载",
  twitterDescription: `下载 APP 客户端 - ${siteShortTitle}`,
});

const qrCodeUrl = ref("");

/**
 * 生成指定内容的二维码（如 APK 下载地址）
 *
 * qrcode 是纯客户端依赖（约 244KB），按需 import 避免进入首屏 bundle；
 * 参照 Qrcode.vue 的做法：不在 setup 顶层 await，避免 SSR 阻塞与额外 chunk 请求。
 */
let qrcodeLib: typeof import("qrcode") | null = null;

const renderQrCode = async () => {
  if (import.meta.server) return;
  if (!appConfig.value.apkUrl) {
    qrCodeUrl.value = "";
    return;
  }
  if (!qrcodeLib) {
    qrcodeLib = await import("qrcode");
  }
  qrCodeUrl.value = await qrcodeLib.toDataURL(appConfig.value.apkUrl, {
    margin: 1,
    width: 320,
  });
};

// 挂载后才生成（客户端可用 window/QR 库），内容变化时重新生成
onMounted(renderQrCode);
watch(() => appConfig.value.apkUrl, renderQrCode);
</script>

<template>
  <div class="py-4">
    <UPageCTA
      orientation="horizontal"
      variant="soft"
      :ui="{
        container: 'py-10 sm:py-16 gap-6 sm:gap-10',
      }"
    >
      <template #title>
        <div class="flex flex-wrap items-center gap-2">
          <span>{{ siteShortTitle }} APP 下载</span>
        </div>
      </template>

      <template #description>
        <div class="flex flex-col gap-2">
          <p class="text-muted">{{ siteDescription }}</p>
          <p v-if="appConfig.updateDesc" class="text-muted">
            更新日志：{{ appConfig.updateDesc }}
          </p>
          <p v-else class="text-muted">安装包下载与版本信息将展示在这里。</p>
          <p v-if="!hasApk" class="mt-4 text-sm">
            暂未配置 APK 下载地址，请稍后再试。
          </p>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="appConfig.versionName"
              color="primary"
              variant="soft"
              size="lg"
            >
              v{{ appConfig.versionName }}
            </UBadge>
            <UBadge
              v-if="appConfig.versionCode > 0"
              color="neutral"
              variant="subtle"
              size="lg"
            >
              Build {{ appConfig.versionCode }}
            </UBadge>
          </div>
        </div>
      </template>

      <img
        :src="previewImage"
        alt="APP 预览图"
        width="360"
        height="680"
        class="mx-auto w-44 sm:w-56 rounded-xl shadow-lg ring-1 ring-default"
        loading="lazy"
      />

      <!-- 下载按钮：鼠标悬停弹出 APK 下载地址二维码 -->
      <template #links>
        <UPopover
          v-if="hasApk"
          mode="hover"
          arrow
          :open-delay="120"
          :close-delay="200"
          :content="{ side: 'top', sideOffset: 10, collisionPadding: 12 }"
          :ui="{ content: 'p-3' }"
        >
          <UButton v-bind="downloadLink" />

          <template #content>
            <div class="flex flex-col items-center gap-2 w-40">
              <div
                class="size-36 bg-white rounded-lg p-1.5 flex items-center justify-center"
              >
                <img
                  v-if="qrCodeUrl"
                  :src="qrCodeUrl"
                  alt="二维码"
                  class="w-full h-full"
                />
                <UIcon
                  v-else
                  name="i-lucide-loader-circle"
                  class="size-5 animate-spin text-muted"
                />
              </div>
              <p class="text-xs text-muted text-center">
                使用手机「扫一扫」下载
              </p>
            </div>
          </template>
        </UPopover>
      </template>
    </UPageCTA>
  </div>
</template>
