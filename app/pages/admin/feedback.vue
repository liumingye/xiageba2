<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  CheckCircle,
  ExternalLink,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertCircle,
  Loader2,
} from "lucide-vue-next";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";

const router = useRouter();
const {
  isLoggedIn,
  username,
  logout,
  checkLogin,
  initialized,
  getAuthHeaders,
} = useAuth();

const feedbacks = ref<any[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const totalPages = ref(0);
const isLoading = ref(false);
const statusFilter = ref<"" | "PENDING" | "DONE">("");

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }
  await loadFeedback();
});

const loadFeedback = async () => {
  isLoading.value = true;
  try {
    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      pageSize: pageSize.value.toString(),
    });
    if (statusFilter.value) {
      params.set("status", statusFilter.value);
    }

    const res = await fetch(`/api/admin/feedback?${params}`, {
      headers: getAuthHeaders(),
    });
    if (res.status === 401) {
      logout();
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    feedbacks.value = data.data;
    total.value = data.total;
    totalPages.value = data.totalPages;
  } finally {
    isLoading.value = false;
  }
};

const handleStatusFilter = (status: "" | "PENDING" | "DONE") => {
  statusFilter.value = status;
  currentPage.value = 1;
  loadFeedback();
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  loadFeedback();
};

const getPageNumbers = () => {
  const pages: (number | string)[] = [];
  const maxVisible = 5;
  const current = currentPage.value;
  const total = totalPages.value;

  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    if (current <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i);
      pages.push("...");
      pages.push(total);
    } else if (current >= total - 2) {
      pages.push(1);
      pages.push("...");
      for (let i = total - 3; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("...");
      pages.push(current - 1);
      pages.push(current);
      pages.push(current + 1);
      pages.push("...");
      pages.push(total);
    }
  }
  return pages;
};

const checkResults = ref<Record<string, any>>({});
const checkingId = ref<string | null>(null);
const pollTimers = ref<Record<string, ReturnType<typeof setInterval>>>({});

const stopPolling = (musicId: string) => {
  if (pollTimers.value[musicId]) {
    clearInterval(pollTimers.value[musicId]);
    delete pollTimers.value[musicId];
  }
};

const pollSubmission = async (musicId: string, submissionId: number) => {
  try {
    const res = await fetch(
      `/api/admin/music/check-links/submission/${submissionId}`,
      {
        headers: getAuthHeaders(),
      },
    );
    if (res.status === 401) {
      logout();
      router.push("/admin/login");
      stopPolling(musicId);
      return;
    }
    if (!res.ok) return;

    const data = await res.json();

    const current = checkResults.value[musicId];
    if (!current) return;

    const downloads = JSON.parse(current.downloadsRaw || "[]") as Array<{
      quality: string;
      url: string;
    }>;

    const resultWithDetails = downloads.map((d) => ({
      ...d,
      status: data.invalid_links?.includes(d.url)
        ? "invalid"
        : data.valid_links?.includes(d.url)
          ? "valid"
          : "pending",
    }));

    checkResults.value[musicId] = {
      ...current,
      ...data,
      downloads: resultWithDetails,
    };

    // 当 status 为 checked 且没有 pending_links 时停止轮询
    if (
      data.status === "checked" ||
      !data.pending_links ||
      data.pending_links.length === 0
    ) {
      stopPolling(musicId);
    }
  } catch {
    // 忽略轮询错误
  }
};

const startPolling = (musicId: string, submissionId: number) => {
  stopPolling(musicId);
  pollTimers.value[musicId] = setInterval(() => {
    pollSubmission(musicId, submissionId);
  }, 3000);
};

const checkLinks = async (musicId: string) => {
  if (checkingId.value) return;

  checkingId.value = musicId;
  try {
    const res = await fetch(`/api/admin/music/${musicId}/check-links`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (res.status === 401) {
      logout();
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      const err = await res.json();
      alert(err.message || "检测失败");
      return;
    }
    const data = await res.json();

    const current = checkResults.value[musicId];
    const downloadsRaw = current?.downloadsRaw
      ? current.downloadsRaw
      : JSON.stringify(
          data.downloads?.map((d: any) => ({
            quality: d.quality,
            url: d.url,
          })) || [],
        );

    checkResults.value[musicId] = {
      ...data,
      downloadsRaw,
    };

    if (
      data.pending_links &&
      data.pending_links.length > 0 &&
      data.submission_id
    ) {
      startPolling(musicId, data.submission_id);
    }
  } finally {
    checkingId.value = null;
  }
};

onUnmounted(() => {
  Object.keys(pollTimers.value).forEach((id) => stopPolling(id));
});

const resolveFeedback = async (id: string) => {
  if (!confirm("确定要将此反馈标记为已完成吗？")) return;

  const res = await fetch(`/api/admin/feedback/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ resolvedBy: username.value }),
  });

  if (res.ok) {
    await loadFeedback();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const isClearing = ref(false);

const clearDoneFeedback = async () => {
  if (!confirm("确定要清空所有已完成的反馈吗？此操作不可撤销。")) return;
  if (isClearing.value) return;

  isClearing.value = true;
  try {
    const res = await fetch("/api/admin/feedback", {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      if (statusFilter.value === "DONE") {
        currentPage.value = 1;
      }
      await loadFeedback();
    } else if (res.status === 401) {
      logout();
      router.push("/admin/login");
    }
  } finally {
    isClearing.value = false;
  }
};

const typeLabel: Record<string, string> = {
  BROKEN_LINK: "网盘链接失效",
  WRONG_CONTENT: "网盘内容错误",
  WRONG_CODE: "网盘提取码错误",
  WRONG_QUALITY: "网盘音质错误",
  WRONG_INFO: "歌名/歌手/封面/歌词错误",
};

const typeColor: Record<string, string> = {
  BROKEN_LINK: "text-red-400 bg-red-900/30",
  WRONG_CONTENT: "text-orange-400 bg-orange-900/30",
  WRONG_CODE: "text-yellow-400 bg-yellow-900/30",
  WRONG_QUALITY: "text-blue-400 bg-blue-900/30",
  WRONG_INFO: "text-purple-400 bg-purple-900/30",
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />

    <AdminNav />

    <main class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">用户反馈</h2>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="
              statusFilter === ''
                ? 'bg-primary-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            "
            @click="handleStatusFilter('')"
          >
            全部
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="
              statusFilter === 'PENDING'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            "
            @click="handleStatusFilter('PENDING')"
          >
            待处理
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="
              statusFilter === 'DONE'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            "
            @click="handleStatusFilter('DONE')"
          >
            已完成
          </button>
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-red-700/80 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
            :disabled="isClearing"
            @click="clearDoneFeedback"
          >
            <Trash2 class="w-3.5 h-3.5" />
            {{ isClearing ? "清空中..." : "清空已完成" }}
          </button>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800">
            <tr>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                歌曲
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                类型
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                描述
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                状态
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium"
              >
                网盘检测
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                时间
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                加载中...
              </td>
            </tr>
            <tr v-else-if="feedbacks.length === 0">
              <td colspan="7" class="px-4 py-12 text-center">
                <p class="text-gray-500">暂无反馈</p>
              </td>
            </tr>
            <tr
              v-else
              v-for="fb in feedbacks"
              :key="fb.id"
              class="border-t border-gray-800 hover:bg-gray-800/50"
            >
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <span class="text-white truncate max-w-[200px]">{{
                    fb.musicTitle
                  }}</span>
                  <span class="text-gray-500 text-sm truncate max-w-[120px]"
                    >{{ fb.musicArtist }}
                  </span>
                  <a
                    :href="`/music/${fb.musicId}`"
                    target="_blank"
                    class="text-gray-500 hover:text-primary-400 flex-shrink-0"
                    title="查看歌曲"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                  </a>
                </div>
              </td>
              <td class="px-4 py-4">
                <span
                  class="inline-flex px-2 py-1 text-xs rounded-md"
                  :class="typeColor[fb.type] || 'text-gray-400 bg-gray-700'"
                >
                  {{ typeLabel[fb.type] || fb.type }}
                </span>
              </td>
              <td class="px-4 py-4">
                <span
                  v-if="fb.description"
                  class="text-gray-400 text-sm max-w-[200px] block truncate"
                  :title="fb.description"
                  >{{ fb.description }}</span
                >
                <span v-else class="text-gray-600 text-sm">-</span>
              </td>
              <td class="px-4 py-4">
                <span
                  v-if="fb.status === 'DONE'"
                  class="inline-flex items-center gap-1 text-green-400 text-sm"
                >
                  <CheckCircle class="w-4 h-4" />
                  已完成
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 text-yellow-400 text-sm"
                >
                  <span class="w-2 h-2 bg-yellow-400 rounded-full"></span>
                  待处理
                </span>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center">
                  <button
                    v-if="
                      !checkResults[fb.musicId] && checkingId !== fb.musicId
                    "
                    class="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                    @click="checkLinks(fb.musicId)"
                  >
                    <Search class="w-3.5 h-3.5" />
                    检测
                  </button>
                  <button
                    v-else-if="checkingId === fb.musicId"
                    class="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 text-gray-400 rounded-lg cursor-not-allowed"
                    disabled
                  >
                    <Loader2 class="w-3.5 h-3.5 animate-spin" />
                    检测中
                  </button>
                  <div
                    v-else
                    class="flex items-center gap-2 text-sm"
                    :title="
                      checkResults[fb.musicId]?.downloads
                        ?.map(
                          (d: any) =>
                            `${d.quality}: ${d.status === 'valid' ? '有效' : d.status === 'invalid' ? '失效' : '待检测'}`,
                        )
                        .join('\n')
                    "
                  >
                    <span
                      v-if="checkResults[fb.musicId]?.valid_links?.length > 0"
                      class="inline-flex items-center gap-1 text-green-400"
                    >
                      <CheckCircle class="w-3.5 h-3.5" />
                      {{ checkResults[fb.musicId].valid_links.length }}
                    </span>
                    <span
                      v-if="checkResults[fb.musicId]?.invalid_links?.length > 0"
                      class="inline-flex items-center gap-1 text-red-400"
                    >
                      <AlertCircle class="w-3.5 h-3.5" />
                      {{ checkResults[fb.musicId].invalid_links.length }}
                    </span>
                    <span
                      v-if="checkResults[fb.musicId]?.pending_links?.length > 0"
                      class="inline-flex items-center gap-1 text-yellow-400"
                    >
                      <Loader2 class="w-3.5 h-3.5" />
                      {{ checkResults[fb.musicId].pending_links.length }}
                    </span>
                    <button
                      class="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                      title="重新检测"
                      @click="checkLinks(fb.musicId)"
                    >
                      <Search class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 text-gray-500 text-sm">
                {{
                  new Date(fb.createdAt).toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center gap-2">
                  <button
                    v-if="fb.status === 'PENDING'"
                    class="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
                    @click="resolveFeedback(fb.id)"
                  >
                    <CheckCircle class="w-3.5 h-3.5" />
                    标记完成
                  </button>
                  <span v-else class="text-gray-600 text-sm">
                    {{ fb.resolvedBy ? `by ${fb.resolvedBy}` : "" }}
                    {{
                      fb.resolvedAt
                        ? new Date(fb.resolvedAt).toLocaleDateString("zh-CN")
                        : ""
                    }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 分页 -->
        <div
          v-if="totalPages > 1"
          class="flex items-center justify-between px-4 py-3 border-t border-gray-800"
        >
          <div class="text-sm text-gray-400">
            共 {{ total }} 条反馈，第 {{ currentPage }} / {{ totalPages }} 页
          </div>
          <div class="flex items-center gap-1">
            <button
              :disabled="currentPage === 1"
              class="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              @click="goToPage(currentPage - 1)"
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            <button
              v-for="p in getPageNumbers()"
              :key="p"
              :class="[
                'min-w-[36px] h-8 px-2 text-sm rounded transition-colors',
                p === currentPage
                  ? 'bg-primary-500 text-white'
                  : p === '...'
                    ? 'text-gray-500 cursor-default'
                    : 'text-gray-400 hover:text-white',
              ]"
              @click="typeof p === 'number' && goToPage(p)"
            >
              {{ p }}
            </button>
            <button
              :disabled="currentPage === totalPages"
              class="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              @click="goToPage(currentPage + 1)"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
