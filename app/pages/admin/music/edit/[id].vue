<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { ArrowLeft, Save, Plus, X, Search } from "@lucide/vue";
import ScrapeModal from "~/components/admin/ScrapeModal.vue";

interface DownloadOption {
  quality: string;
  url: string;
  source?: string;
  sourceId?: string;
}

const router = useRouter();
const route = useRoute();
const { isLoggedIn, checkLogin, initialized, getAuthHeaders, logout } =
  useAuth();

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
    const res = await fetch(`/api/music/${id.value}?timestamp=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      form.value = {
        title: data.title,
        artist: data.artist,
        album: data.album || "",
        cover: data.cover || "",
        lyrics: data.lyrics || "",
        playUrl: data.playUrl || "",
        downloads: data.downloads || [],
      };
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
  form.value.title = data.title || form.value.title;
  form.value.artist = data.artist || form.value.artist;
  form.value.album = data.album || form.value.album;
  form.value.cover = data.cover || form.value.cover;
  form.value.lyrics = data.lyrics || form.value.lyrics;
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

  const res = await fetch("/api/admin/music", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      id: id.value,
      ...form.value,
      downloads,
    }),
  });

  if (res.ok) {
    router.push("/admin");
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "保存失败";
  }
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <header class="bg-gray-900 border-b border-gray-800 px-6 py-4">
      <div class="flex items-center justify-between max-w-4xl mx-auto">
        <div class="flex items-center gap-4">
          <button
            class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            @click="goBack"
          >
            <ArrowLeft class="w-5 h-5 text-gray-400" />
          </button>
          <h1 class="text-xl font-bold text-white">编辑音乐</h1>
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
          class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
          <label class="block text-gray-400 text-sm mb-2">歌名 *</label>
          <input
            v-model="form.title"
            type="text"
            placeholder="请输入歌名"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-gray-400 text-sm mb-2">歌手 *</label>
          <input
            v-model="form.artist"
            type="text"
            placeholder="请输入歌手"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-gray-400 text-sm mb-2">专辑</label>
          <input
            v-model="form.album"
            type="text"
            placeholder="请输入专辑名"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-gray-400 text-sm mb-2">封面图片URL</label>
          <input
            v-model="form.cover"
            type="text"
            placeholder="请输入封面图片链接"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-gray-400 text-sm mb-2">歌词</label>
          <textarea
            v-model="form.lyrics"
            rows="6"
            placeholder="请输入歌词，每行一句"
            class="input-search resize-none"
          ></textarea>
        </div>

        <div>
          <label class="block text-gray-400 text-sm mb-2">播放地址</label>
          <input
            v-model="form.playUrl"
            type="text"
            placeholder="请输入音频播放链接"
            class="input-search"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-4">
            <label class="text-gray-400 text-sm">下载链接</label>
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
            class="text-center py-8 text-gray-600"
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
                class="p-2 text-gray-500 hover:text-red-500 transition-colors mt-1"
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
      @close="showScrapeModal = false"
      @select="handleScrapeSelect"
    />
  </div>
</template>
