<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { debounce } from "~/utils";
import {
  Plus,
  Search,
  Trash2,
  Edit3,
} from "lucide-vue-next";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import type { Music as MusicType } from "~/stores/music";

const config = useRuntimeConfig();
const router = useRouter();
const route = useRoute();
const { isLoggedIn, logout, checkLogin, initialized, getAuthHeaders } =
  useAuth();

const musics = ref<MusicType[]>([]);
const searchQuery = ref("");
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const totalPages = ref(0);
const isLoading = ref(false);

onMounted(async () => {
  // 等待状态初始化
  if (!initialized.value) {
    checkLogin();
  }

  // 延迟检查登录状态，确保 localStorage 已读取
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }

  // 从 URL 读取分页参数
  const page = parseInt(route.query.page as string);
  if (page && page > 0) {
    currentPage.value = page;
  }

  await loadMusic();
});

let controller: AbortController | null = null;

const loadMusic = async () => {
  isLoading.value = true;
  try {
    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      pageSize: pageSize.value.toString(),
    });

    const wordkey = searchQuery.value.trim();
    if (wordkey) {
      params.set("search", wordkey);
    }

    if (controller) {
      controller.abort();
    }
    controller = new AbortController();

    const res = await fetch(`/api/admin/music?${params}`, {
      headers: getAuthHeaders(),
      signal: controller.signal,
    });
    const data = await res.json();

    if (wordkey !== searchQuery.value.trim()) return;

    musics.value = data.data;
    total.value = data.total;
    totalPages.value = data.totalPages;
  } finally {
    isLoading.value = false;
  }
};

const debounceLoadMusic = debounce(loadMusic, 300);

watch(searchQuery, () => {
  currentPage.value = 1;
  debounceLoadMusic();
});

const goToAddMusic = () => {
  router.push("/admin/music/add");
};

const editMusic = (id: string) => {
  window.open(`/admin/music/edit/${id}`, "_blank");
};

const deleteMusic = async (id: string) => {
  if (!confirm("确定要删除这首歌吗？")) return;

  const res = await fetch("/api/admin/music", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ id }),
  });

  if (res.ok) {
    await loadMusic();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  router.push({
    query: { ...route.query, page: page.toString() },
  });
  loadMusic();
};


</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">音乐列表</h2>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="goToAddMusic"
          >
            <Plus class="w-4 h-4" />
            添加音乐
          </button>
        </div>
      </div>
      <div class="relative mb-4 max-w-md">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索歌名或歌手..."
          class="input-search pl-10"
        />
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-gray-800">
            <tr>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-[80px] min-w-[80px]"
              >
                封面
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                歌名
              </th>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-32"
              >
                歌手
              </th>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-40"
              >
                专辑
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium w-24"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                加载中...
              </td>
            </tr>
            <tr v-else-if="musics.length === 0">
              <td colspan="5" class="px-4 py-12 text-center">
                <p class="text-gray-500">暂无音乐</p>
              </td>
            </tr>
            <tr
              v-else
              v-for="music in musics"
              :key="music.id"
              class="border-t border-gray-800 hover:bg-gray-800/50"
            >
              <td class="px-4 py-4">
                <img
                  :src="music.cover || config.app.baseURL + 'img/cover.png'"
                  :alt="music.title"
                  class="w-12 h-12 rounded object-cover"
                />
              </td>
              <td
                class="px-4 py-4 text-white truncate max-w-[200px]"
                :title="music.title"
              >
                {{ music.title }}
              </td>
              <td
                class="px-4 py-4 text-gray-400 truncate"
                :title="music.artist"
              >
                {{ music.artist }}
              </td>
              <td
                class="px-4 py-4 text-gray-400 truncate"
                :title="music.album || '-'"
              >
                {{ music.album || "-" }}
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="editMusic(music.id)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteMusic(music.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- 分页 -->
      <AdminPagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :total="total"
        item-label="首音乐"
        @page-change="goToPage"
      />
    </main>
  </div>
</template>
