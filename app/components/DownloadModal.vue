<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useClipboard, useTimeoutFn, useVModels } from "@vueuse/core";
import { QrCode, Copy, Check } from "@lucide/vue";
import type { Music, DownloadOption } from "~/stores/music";
import FeedbackModal from "~/components/FeedbackModal.vue";
import { extractPwd } from "~/utils";

const props = defineProps<{
  show: boolean;
  music: Music | null;
  selectedDownload: DownloadOption | null;
}>();

const emit = defineEmits<{
  (e: "update:selectedDownload", value: DownloadOption | null): void;
  (e: "update:show", value: boolean): void;
  (e: "update:music", value: Music | null): void;
}>();

const showFeedbackModal = ref(false);
const qrCodeUrl = ref("");

const { selectedDownload, music, show } = useVModels(props, emit, {
  passive: true,
});

const selectedPwd = computed(() => {
  if (!selectedDownload.value?.url) return "";
  return extractPwd(selectedDownload.value.url);
});

const { copy } = useClipboard();
const copiedCode = ref(false);

const resetCopiedCode = useTimeoutFn(() => {
  copiedCode.value = false;
}, 2000);

const cleanUrl = (url: string): string => {
  try {
    const u = new URL(url);
    u.searchParams.delete("pwd");
    return u.toString();
  } catch {
    return url;
  }
};

const copyPwd = async () => {
  if (!selectedPwd.value) return;
  try {
    await copy(selectedPwd.value);
    copiedCode.value = true;
    resetCopiedCode.start();
  } catch {
    // 复制失败静默处理
  }
};

const generateQrCode = async (url: string) => {
  const qrcode = await import("qrcode");
  qrCodeUrl.value = await qrcode.toDataURL(cleanUrl(url), {
    margin: 0,
  });
};

watch(
  () => props.show,
  async (show) => {
    if (
      show &&
      props.music &&
      props.music.downloads &&
      props.music.downloads.length > 0
    ) {
      // 初始化时，默认选择第一个下载选项
      if (!selectedDownload.value && props.music.downloads[0]) {
        selectedDownload.value = props.music.downloads[0];
      }
      // 生成二维码
      if (!selectedDownload.value?.url) return;
      await generateQrCode(selectedDownload.value.url);
    } else {
      // qrCodeUrl.value = "";
    }
  },
);

const selectDownload = async (download: DownloadOption) => {
  selectedDownload.value = download;

  if (download.url) {
    await generateQrCode(download.url);
  }
};

const openFeedbackModal = () => {
  showFeedbackModal.value = true;
};
</script>

<template>
  <UModal v-model:open="show" title="下载音乐">
    <template #body>
      <!-- 有下载链接 -->
      <div v-if="music?.downloads?.length" class="space-y-4">
        <p class="text-center">选择音质</p>
        <div class="space-y-4">
          <div class="flex flex-wrap gap-2 justify-center">
            <UButton
              v-for="download in music.downloads"
              :key="download.quality"
              :color="
                selectedDownload?.quality === download.quality
                  ? 'primary'
                  : 'neutral'
              "
              :variant="
                selectedDownload?.quality === download.quality
                  ? 'solid'
                  : 'soft'
              "
              :label="download.quality"
              size="xl"
              @click="selectDownload(download)"
            />
          </div>

          <div class="text-center">
            <p class="text-sm">使用手机扫码下载</p>
            <p v-if="selectedDownload" class="text-primary-500 text-sm mt-1">
              当前音质：{{ selectedDownload.quality }}
            </p>
          </div>

          <div class="flex justify-center">
            <div class="rounded-lg border border-muted bg-white p-4">
              <img
                v-if="qrCodeUrl"
                :src="qrCodeUrl"
                alt="下载二维码"
                class="size-44 sm:size-48"
              />
              <div
                v-else
                class="size-44 sm:size-48 flex items-center justify-center"
              >
                <QrCode class="size-20 text-muted" />
              </div>
            </div>
          </div>

          <div
            v-if="selectedPwd"
            class="flex items-center justify-center gap-2 text-sm"
          >
            <span>提取码：</span>
            <span class="font-mono font-medium">{{ selectedPwd }}</span>
            <UButton
              color="neutral"
              variant="ghost"
              square
              size="xs"
              title="复制提取码"
              @click="copyPwd"
            >
              <Check v-if="copiedCode" class="size-4 text-green-500" />
              <Copy v-else class="size-4" />
            </UButton>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-x-4">
          <UButton
            v-if="music?.id"
            color="neutral"
            class="opacity-50"
            variant="link"
            @click="openFeedbackModal"
          >
            反馈问题
          </UButton>
          <UButton
            v-if="selectedDownload?.url"
            color="neutral"
            class="opacity-50"
            variant="link"
            :to="selectedDownload.url"
            target="_blank"
          >
            打开链接
          </UButton>
        </div>
      </div>

      <!-- 无下载链接 -->
      <div v-else class="py-8 text-center text-sm">暂无下载链接</div>
    </template>
  </UModal>

  <FeedbackModal
    v-if="music?.id"
    v-model:show="showFeedbackModal"
    :music-id="music.id"
  />
</template>
