<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import { X, Download, QrCode } from "lucide-vue-next";
import type { Music, DownloadOption } from "~/stores/music";

const props = defineProps<{
  show: boolean;
  music: Music | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const isMobile = ref(false);
const qrCodeUrl = ref("");
const selectedDownload = ref<DownloadOption | null>(null);

const checkMobile = () => {
  isMobile.value =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
};

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

const generateQrCode = async (url: string) => {
  const qrcode = await import("qrcode");
  qrCodeUrl.value = await qrcode.toDataURL(url, {
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
      selectedDownload.value = props.music.downloads[0];
      if (!isMobile.value) {
        await generateQrCode(selectedDownload.value.url);
      }
    }
  },
);

const selectDownload = async (download: DownloadOption) => {
  selectedDownload.value = download;

  if (download.url) {
    await generateQrCode(download.url);
  }
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        ></div>

        <div
          class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-md w-full border border-gray-800"
        >
          <button
            class="absolute top-4 right-4 p-2 hover:bg-gray-800 rounded-lg transition-colors"
            @click="handleClose"
          >
            <X class="w-5 h-5 text-gray-400" />
          </button>

          <h3 class="text-xl font-medium text-white mb-4 text-center">
            下载音乐
          </h3>

          <div
            v-if="music?.downloads && music.downloads.length > 0"
            class="space-y-4"
          >
            <div class="text-center text-gray-400 mb-4">
              <p>选择音质</p>
            </div>

            <div v-if="isMobile" class="space-y-4">
              <div class="flex justify-center gap-2">
                <a
                  v-for="download in music.downloads"
                  :key="download.quality"
                  class="flex flex-col w-full items-center gap-2 p-4 rounded-lg transition-colors bg-gray-800 hover:bg-gray-700 text-white"
                  :href="download.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download class="w-8 h-8 text-primary-500" />
                  <span class="font-medium">{{ download.quality }}</span>
                </a>
              </div>

              <div class="text-center text-gray-500 text-sm">
                <p>点击音质按钮开始下载</p>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div class="flex flex-wrap gap-2 justify-center">
                <button
                  v-for="download in music.downloads"
                  :key="download.quality"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm"
                  :class="
                    selectedDownload?.quality === download.quality
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  "
                  @click="selectDownload(download)"
                >
                  {{ download.quality }}
                </button>
              </div>

              <div class="text-center text-gray-400 mb-2">
                <p>使用手机扫码下载</p>
                <p
                  v-if="selectedDownload"
                  class="text-primary-500 text-sm mt-1"
                >
                  当前音质：{{ selectedDownload.quality }}
                </p>
              </div>

              <div class="flex justify-center">
                <div class="bg-white p-4 rounded-lg">
                  <img
                    v-if="qrCodeUrl"
                    :src="qrCodeUrl"
                    alt="下载二维码"
                    class="w-48 h-48"
                  />
                  <div
                    v-else
                    class="w-48 h-48 bg-gray-100 flex items-center justify-center"
                  >
                    <QrCode class="w-12 h-12 text-gray-400" />
                  </div>
                </div>
              </div>
              <a
                v-if="selectedDownload?.url"
                :href="selectedDownload.url"
                target="_blank"
                class="text-sm mt-2 text-center block text-gray-600 opacity-5"
              >
                直接下载
              </a>
            </div>
          </div>

          <div v-else class="text-center text-gray-500 py-8">暂无下载链接</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
