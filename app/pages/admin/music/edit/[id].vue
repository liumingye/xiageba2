<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { ImageIcon } from "@lucide/vue";
import ScrapeModal from "~/components/admin/ScrapeModal.vue";
import FilePickerModal from "~/components/admin/FilePickerModal.vue";
import { get, put } from "~/utils/request";

interface DownloadOption {
  quality: string;
  url: string;
  source?: string;
  sourceId?: string;
}

const router = useRouter();
const route = useRoute();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const id = ref("");

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
watch(
  () => form.value.cover,
  () => {
    coverImgError.value = false;
  },
);

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }

  id.value = route.params.id as string;

  if (id.value) {
    try {
      const data = await get(`/api/music/${id.value}?timestamp=${Date.now()}`);
      form.value = {
        title: data.title,
        artist: data.artist,
        album: data.album || "",
        cover: data.cover || "",
        lyrics: data.lyrics || "",
        playUrl: data.playUrl || "",
        downloads: data.downloads || [],
      };
    } catch {
      // 加载失败，保持表单为空
    }
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

const saveEditing = ref(false);

const handleSubmit = async () => {
  if (saveEditing.value) return;
  if (!form.value.title.trim() || !form.value.artist.trim()) {
    error.value = "歌名和歌手不能为空";
    return;
  }

  const downloads = form.value.downloads.filter(
    (d) => d.quality.trim() && d.url.trim(),
  );

  saveEditing.value = true;
  try {
    await put("/api/admin/music", {
      id: id.value,
      ...form.value,
      downloads,
    });
    router.push("/admin");
  } catch (err: any) {
    error.value = err?.response?.data?.message || "保存失败";
  } finally {
    saveEditing.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen">
    <header class="bg-color-100 border-b border-color-300 px-6 py-4">
      <div class="flex items-center justify-between max-w-4xl mx-auto">
        <div class="flex items-center gap-4">
          <UButton
            color="neutral"
            variant="ghost"
            square
            icon="i-lucide-arrow-left"
            aria-label="返回"
            @click="goBack"
          />
          <h1 class="text-xl font-bold">编辑音乐</h1>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 py-6">
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        class="mb-6"
      />

      <div class="flex items-center justify-end mb-4 gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-search"
          @click="openScrapeModal"
        >
          刮削
        </UButton>

        <UButton
          color="primary"
          icon="i-lucide-save"
          :loading="saveEditing"
          :disabled="saveEditing"
          @click="handleSubmit"
        >
          {{ saveEditing ? "保存中..." : "保存" }}
        </UButton>
      </div>

      <UCard
        :ui="{
          body: 'p-6 space-y-6',
        }"
      >
        <div>
          <label class="block text-color-400 text-sm mb-2" for="music-title"
            >歌名 *</label
          >
          <UInput
            id="music-title"
            v-model="form.title"
            type="text"
            placeholder="请输入歌名"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2" for="music-artist"
            >歌手 *</label
          >
          <UInput
            id="music-artist"
            v-model="form.artist"
            type="text"
            placeholder="请输入歌手"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2" for="music-album"
            >专辑</label
          >
          <UInput
            id="music-album"
            v-model="form.album"
            type="text"
            placeholder="请输入专辑名"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2" for="music-cover"
            >封面图片URL</label
          >
          <div class="flex gap-2 items-start">
            <div class="flex-1 space-y-3">
              <div class="flex gap-2">
                <UInput
                  id="music-cover"
                  v-model="form.cover"
                  type="text"
                  placeholder="请输入封面图片链接或点击右侧选择文件"
                  class="flex-1"
                />
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-folder-open"
                  class="shrink-0"
                  @click="showCoverPicker = true"
                >
                  选择文件
                </UButton>
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
                  <ImageIcon v-else class="w-8 h-8 text-zinc-600" />
                </div>
                <div class="text-xs text-color-500 pt-1 break-all flex-1">
                  预览：<span class="text-color-400">{{ form.cover }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2" for="music-lyrics"
            >歌词</label
          >
          <UTextarea
            id="music-lyrics"
            v-model="form.lyrics"
            :rows="6"
            placeholder="请输入歌词，每行一句"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2" for="music-play"
            >播放地址</label
          >
          <UInput
            id="music-play"
            v-model="form.playUrl"
            type="text"
            placeholder="请输入音频播放链接"
            class="w-full"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-4">
            <label class="text-color-400 text-sm">下载链接</label>
            <UButton
              color="primary"
              variant="ghost"
              size="sm"
              icon="i-lucide-plus"
              @click="addDownload"
            >
              添加音质
            </UButton>
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
                <UInput
                  v-model="download.quality"
                  type="text"
                  placeholder="音质名称（如：FLAC / MP3 320k / AAC）"
                  class="mb-2 w-full"
                />
                <UInput
                  v-model="download.url"
                  type="text"
                  placeholder="下载链接"
                  class="w-full"
                />
              </div>
              <UButton
                color="error"
                variant="ghost"
                square
                size="sm"
                icon="i-lucide-x"
                class="mt-1 shrink-0"
                title="移除该音质"
                aria-label="移除该音质"
                @click="removeDownload(index)"
              />
            </div>
          </div>
        </div>
      </UCard>
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
