<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  useClipboard,
  useTimeoutFn,
  useMediaQuery,
  useVModels,
} from "@vueuse/core";
import { Download, QrCode, Copy, Check } from "@lucide/vue";
import type { Music, DownloadOption } from "~/stores/music";
import FeedbackModal from "~/components/FeedbackModal.vue";
import { extractPwd, isMobileOrTablet } from "~/utils";

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

const isMobile = useMediaQuery("(max-width: 1366px)");
// UA匹配 && 宽度1366px以下
const isMobileTablet = computed(() => isMobileOrTablet() && isMobile.value);

const { selectedDownload, music, show } = useVModels(props, emit, {
  passive: true,
});

const selectedPwd = computed(() => {
  if (!selectedDownload.value?.url) return "";
  return extractPwd(selectedDownload.value.url);
});

const pwdList = computed(() => {
  if (!props.music?.downloads) return [];
  return props.music.downloads
    .filter((d) => d.url && extractPwd(d.url))
    .map((d) => ({
      quality: d.quality,
      pwd: extractPwd(d.url),
      url: d.url,
    }));
});

const { copy } = useClipboard();
const copiedIndex = ref<number | null>(null);
const copiedCode = ref(false);

const resetCopiedIndex = useTimeoutFn(() => {
  copiedIndex.value = null;
}, 2000);

const resetCopiedCode = useTimeoutFn(() => {
  copiedCode.value = false;
}, 2000);

const copyPwdByIndex = async (index: number, pwd: string) => {
  try {
    await copy(pwd);
    copiedIndex.value = index;
    resetCopiedIndex.start();
  } catch {
    // 复制失败静默处理
  }
};

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
      // 非移动端时，默认生成二维码
      if (!isMobileTablet.value) {
        if (!selectedDownload.value?.url) return;
        await generateQrCode(selectedDownload.value.url);
      }
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

        <!-- 手机或平板 -->
        <div v-if="isMobileTablet" class="space-y-3">
          <div class="flex justify-center gap-2">
            <UButton
              v-for="download in music.downloads"
              :key="download.quality"
              :to="download.url"
              target="_blank"
              rel="noopener noreferrer"
              color="primary"
              variant="soft"
              class="flex-1 h-24"
              :label="download.quality"
              @click="selectedDownload = download"
              :ui="{
                base: 'flex-col justify-center',
              }"
            >
              <template #leading>
                <Download class="w-5 h-5 text-primary-500" />
              </template>
            </UButton>
          </div>

          <div
            v-if="pwdList.length"
            class="space-y-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 p-3 text-sm"
          >
            <p class="text-center mb-2 text-zinc-500 dark:text-zinc-400">
              提取码
            </p>
            <div
              v-for="(item, index) in pwdList"
              :key="index"
              class="flex items-center justify-between gap-2"
            >
              <span class="shrink-0">{{ item.quality }}</span>
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-mono font-medium truncate">{{
                  item.pwd
                }}</span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  square
                  size="xs"
                  title="复制提取码"
                  :ui="{
                    base: 'text-zinc-400 hover:text-primary-600',
                  }"
                  @click="copyPwdByIndex(index, item.pwd)"
                >
                  <Check
                    v-if="copiedIndex === index"
                    class="h-4 w-4 text-green-500"
                  />
                  <Copy v-else class="h-4 w-4" />
                </UButton>
              </div>
            </div>
          </div>

          <p class="text-center text-sm text-zinc-500 dark:text-zinc-400">
            点击音质按钮开始下载
          </p>
        </div>

        <!-- 桌面端 -->
        <div v-else class="space-y-4">
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
            <div
              class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white p-4"
            >
              <img
                v-if="qrCodeUrl"
                :src="qrCodeUrl"
                alt="下载二维码"
                class="w-44 h-44 sm:w-48 sm:h-48"
              />
              <div
                v-else
                class="w-44 h-44 sm:w-48 sm:h-48 flex items-center justify-center"
              >
                <QrCode class="w-20 h-20 text-zinc-300 dark:text-zinc-600" />
              </div>
            </div>
          </div>

          <div
            v-if="selectedPwd"
            class="flex items-center justify-center gap-2 text-sm"
          >
            <span class="text-zinc-500 dark:text-zinc-400">提取码：</span>
            <span class="font-mono font-medium">{{ selectedPwd }}</span>
            <UButton
              color="neutral"
              variant="ghost"
              square
              size="xs"
              title="复制提取码"
              :ui="{
                base: 'text-zinc-400 hover:text-primary-600',
              }"
              @click="copyPwd"
            >
              <Check v-if="copiedCode" class="h-4 w-4 text-green-500" />
              <Copy v-else class="h-4 w-4" />
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
            v-if="!isMobileTablet && selectedDownload?.url"
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
      <div v-else class="py-8 text-center text-sm text-zinc-500">
        暂无下载链接
      </div>
    </template>
  </UModal>

  <FeedbackModal
    v-if="music?.id"
    :show="showFeedbackModal"
    :music-id="music.id"
    @close="showFeedbackModal = false"
  />
</template>
