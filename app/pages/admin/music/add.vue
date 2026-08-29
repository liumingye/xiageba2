<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { ArrowLeft, Save, Plus, X, Search, FolderOpen, ImageIcon } from "@lucide/vue";
import ScrapeModal from "~/components/admin/ScrapeModal.vue";
import FilePickerModal from "~/components/admin/FilePickerModal.vue";
import { post } from "~/utils/request";

interface DownloadOption {
  quality: string;
  url: string;
  source?: string;
  sourceId?: string;
}

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const form = ref({
  title: "",
  artist: "",
  album: "",
  cover: "",
  lyrics: "",
  playUrl: "",
  downloads: [] as DownloadOption[],
});

const error = ref("");
const showScrapeModal = ref(false);
const showCoverPicker = ref(false);

const handleCoverPicked = (url: string) => {
  form.value.cover = url;
  showCoverPicker.value = false;
};

const coverImgError = ref(false);
watch(() => form.value.cover, () => {
  coverImgError.value = false;
});

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  if (!isLoggedIn.value) {
    router.push("/admin/login");
  }
});

const goBack = () => {
  router.push("/admin");
};

const addDownload = () => {
  form.value.downloads.push({ quality: "", url: "" });
};

const removeDownload = (index: number) => {
  form.value.downloads.splice(index, 1);
};

const openScrapeModal = () => {
  showScrapeModal.value = true;
};

const handleScrapeSelect = (data: any) => {
  const fields: string[] = data.__selectedFields || [];
  fields.forEach((f) => {
    if (f in data) {
      (form.value as any)[f] = data[f];
    }
  });
  showScrapeModal.value = false;
};

const handleSubmit = async () => {
  if (!form.value.title.trim() || !form.value.artist.trim()) {
    error.value = "歌名和歌手不能为空";
    return;
  }

  const downloads = form.value.downloads.filter(
    (d) => d.quality.trim() && d.url.trim(),
  );

  try {
    await post("/api/admin/music", {
      ...form.value,
      downloads,
    });
    router.push("/admin");
  } catch (err: any) {
    error.value = err?.response?.data?.message || "保存失败";
  }
};
</script>

<template>
  <div class="min-h-screen">
    <header class="bg-color-100 border-b border-color-300 px-6 py-4">
      <div class="flex items-center justify-between max-w-4xl mx-auto">
        <div class="flex items-center gap-4">
          <button
            class="p-2 hover:bg-color-300 rounded-lg transition-colors"
            @click="goBack"
          >
            <ArrowLeft class="w-5 h-5 text-color-400" />
          </button>
          <h1 class="text-xl font-bold">添加音乐</h1>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 py-6">
      <div
        v-if="error"
        class="mb-6 p-4 bg-red-900/50 border border-red-800 rounded-lg text-red-400"
      >
        {{ error }}
      </div>

      <div class="flex items-center justify-end mb-4 gap-2">
        <button
          class="flex items-center gap-2 px-4 py-2 bg-color-400 hover:bg-color-500 rounded-lg transition-colors"
          @click="openScrapeModal"
        >
          <Search class="w-4 h-4" />
          刮削
        </button>

        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="handleSubmit"
        >
          <Save class="w-4 h-4" />
          保存
        </button>
      </div>

      <div class="card p-6 space-y-6">
        <div>
          <label class="block text-color-400 text-sm mb-2">歌名 *</label>
          <input
            v-model="form.title"
            type="text"
            placeholder="请输入歌名"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2">歌手 *</label>
          <input
            v-model="form.artist"
            type="text"
            placeholder="请输入歌手"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2">专辑</label>
          <input
            v-model="form.album"
            type="text"
            placeholder="请输入专辑名"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2">封面图片URL</label>
          <div class="flex gap-2 items-start">
            <div class="flex-1 space-y-3">
              <div class="flex gap-2">
                <input
                  v-model="form.cover"
                  type="text"
                  placeholder="请输入封面图片链接或点击右侧选择文件"
                  class="input-search flex-1"
                />
                <button
                  type="button"
                  class="flex items-center gap-1.5 px-3 py-2 bg-color-400 hover:bg-color-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  @click="showCoverPicker = true"
                >
                  <FolderOpen class="w-4 h-4" />
                  选择文件
                </button>
              </div>
              <div v-if="form.cover" class="flex items-start gap-3">
                <div
                  class="w-24 h-24 rounded-lg border border-color-400 overflow-hidden flex items-center justify-center bg-color-300 shrink-0"
                >
                  <img
                    v-if="!coverImgError"
                    :src="form.cover"
                    alt="封面预览"
                    class="w-full h-full object-cover"
                    @error="coverImgError = true"
                  />
                  <ImageIcon
                    v-else
                    class="w-8 h-8 text-zinc-600"
                  />
                </div>
                <div class="text-xs text-color-500 pt-1 break-all flex-1">
                  预览：<span class="text-color-400">{{ form.cover }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2">歌词</label>
          <textarea
            v-model="form.lyrics"
            rows="6"
            placeholder="请输入歌词，每行一句"
            class="input-search"
          ></textarea>
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2">播放地址</label>
          <input
            v-model="form.playUrl"
            type="text"
            placeholder="请输入音频播放链接"
            class="input-search"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-4">
            <label class="text-color-400 text-sm">下载链接</label>
            <button
              class="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-400 transition-colors"
              @click="addDownload"
            >
              <Plus class="w-4 h-4" />
              添加音质
            </button>
          </div>

          <div
            v-if="form.downloads.length === 0"
            class="text-center py-8 text-zinc-600"
          >
            暂无下载链接，点击上方按钮添加
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="(download, index) in form.downloads"
              :key="index"
              class="flex gap-3 items-start"
            >
              <div class="flex-1">
                <input
                  v-model="download.quality"
                  type="text"
                  placeholder="音质名称（如：FLAC / MP3 320k / AAC）"
                  class="input-search mb-2"
                />
                <input
                  v-model="download.url"
                  type="text"
                  placeholder="下载链接"
                  class="input-search"
                />
              </div>
              <button
                class="p-2 text-color-500 hover:text-red-500 transition-colors mt-1"
                @click="removeDownload(index)"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <ScrapeModal
      :show="showScrapeModal"
      :initial-keyword="`${form.title} ${form.artist}`.trim()"
      :existing-music="form"
      @close="showScrapeModal = false"
      @select="handleScrapeSelect"
    />

    <FilePickerModal
      :show="showCoverPicker"
      @close="showCoverPicker = false"
      @select="handleCoverPicked"
    />
  </div>
</template>
