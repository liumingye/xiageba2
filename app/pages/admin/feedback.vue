<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import {
  CheckCircle,
  ExternalLink,
  Trash2,
  Search,
  AlertCircle,
  Loader2,
  Edit3,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";

const router = useRouter();
const route = useRoute();
const { isLoggedIn, username, checkLogin, initialized } = useAuth();

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

  // 从 URL 读取分页参数
  const page = parseInt(route.query.page as string);
  if (page && page > 0) {
    currentPage.value = page;
  }
  const status = route.query.status as string;
  if (status === "PENDING" || status === "DONE") {
    statusFilter.value = status;
  }

  await loadFeedback();
});

// 监听浏览器前进/后退
watch(
  () => route.query,
  (query) => {
    const page = parseInt(query.page as string) || 1;
    const status = (query.status as string) || "";
    currentPage.value = page;
    statusFilter.value =
      status === "PENDING" || status === "DONE" ? status : "";
    loadFeedback();
  },
);

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

    const data = await get(`/api/admin/feedback?${params}`);
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
  const query: Record<string, string> = { page: "1" };
  if (status) {
    query.status = status;
  }
  router.push({ query });
  loadFeedback();
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  router.push({
    query: { ...route.query, page: page.toString() },
  });
  loadFeedback();
};

const checkResults = ref<Record<string, any>>({});
const checkingId = ref<string | null>(null);
const activePolls = ref<Record<string, string>>({});

const { pause: pausePolling, resume: resumePolling } = useIntervalFn(
  async () => {
    for (const [musicId, submissionId] of Object.entries(activePolls.value)) {
      await pollSubmission(musicId, submissionId);
    }
  },
  3000,
  { immediate: false },
);

const stopPolling = (musicId: string) => {
  if (!(musicId in activePolls.value)) return;
  delete activePolls.value[musicId];
  if (Object.keys(activePolls.value).length === 0) {
    pausePolling();
  }
};

const pollSubmission = async (musicId: string, submissionId: string) => {
  try {
    const data = await get(
      `/api/admin/music/check-links/submission/${submissionId}`,
    );

    const current = checkResults.value[musicId];
    if (!current) return;

    const downloads = current.downloads as Array<{
      quality: string;
      url: string;
    }>;

    // 规则：valid_links / pending_links 来自上游，
    // invalid_links = 总链接 - valid - pending（前端始终自己算，不信任服务端）
    const valid_links: string[] = Array.isArray(data.valid_links)
      ? data.valid_links
      : [];
    const pending_links: string[] = Array.isArray(data.pending_links)
      ? data.pending_links
      : [];
    const validSet = new Set(valid_links);
    const pendingSet = new Set(pending_links);
    const invalid_links = downloads
      .map((d) => d.url)
      .filter((u) => !validSet.has(u) && !pendingSet.has(u));

    const resultWithDetails = downloads.map((d) => {
      if (validSet.has(d.url)) return { ...d, status: "valid" };
      if (pendingSet.has(d.url)) return { ...d, status: "pending" };
      return { ...d, status: "invalid" };
    });

    checkResults.value[musicId] = {
      valid_links,
      invalid_links,
      pending_links,
      downloads: resultWithDetails,
    };

    // 没有 pending 下载或检测完成时停止轮询
    if (pending_links.length === 0 || data.status === "checked") {
      stopPolling(musicId);
    }
  } catch {
    // 忽略轮询错误
  }
};

const startPolling = (musicId: string, submissionId: string) => {
  if (!(musicId in activePolls.value)) {
    activePolls.value[musicId] = submissionId;
    resumePolling();
    // 立即触发首次轮询，不等待 3 秒间隔
    pollSubmission(musicId, submissionId);
  } else {
    activePolls.value[musicId] = submissionId;
  }
};

const checkLinks = async (musicId: string) => {
  if (checkingId.value) return;

  checkingId.value = musicId;
  try {
    const data = await post(`/api/admin/music/${musicId}/check-links`);

    checkResults.value[musicId] = data;

    // 有 pending 下载且有 submission_id 时启动轮询
    const hasPending = data.downloads?.some((d: any) => d.status === "pending");
    if (hasPending && data.submission_id) {
      startPolling(musicId, String(data.submission_id));
    }
  } catch (e: any) {
    if (e?.response?.status === 401) return;
    const err = e?.response?.data;
    alert(err?.message || "检测失败");
  } finally {
    checkingId.value = null;
  }
};

onUnmounted(() => {
  activePolls.value = {};
  pausePolling();
});

const resolveFeedback = async (id: string) => {
  if (!confirm("确定要将此反馈标记为已完成吗？")) return;

  try {
    await put(`/api/admin/feedback/${id}`, {
      resolvedBy: username.value,
    });
    await loadFeedback();
  } catch {
    // 忽略，401 由拦截器处理
  }
};

const deleteFeedback = async (id: string) => {
  if (!confirm("确定要删除这条反馈吗？")) return;

  try {
    await del(`/api/admin/feedback/${id}`);
    await loadFeedback();
  } catch {
    // 忽略，401 由拦截器处理
  }
};

const isClearing = ref(false);

const clearDoneFeedback = async () => {
  if (!confirm("确定要清空所有已完成的反馈吗？此操作不可撤销。")) return;
  if (isClearing.value) return;

  isClearing.value = true;
  try {
    await del("/api/admin/feedback");
    if (statusFilter.value === "DONE") {
      currentPage.value = 1;
    }
    await loadFeedback();
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
  <div class="min-h-screen">
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
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
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
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
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
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
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
        <table class="w-full table-auto">
          <thead class="bg-zinc-800">
            <tr>
              <th
                class="px-4 py-3 text-left text-zinc-400 text-sm font-medium min-w-[220px]"
              >
                歌曲
              </th>
              <th
                class="px-4 py-3 text-left text-zinc-400 text-sm font-medium min-w-[180px]"
              >
                类型
              </th>
              <th
                class="px-4 py-3 text-left text-zinc-400 text-sm font-medium min-w-[200px]"
              >
                描述
              </th>
              <th
                class="px-4 py-3 text-left text-zinc-400 text-sm font-medium min-w-[80px]"
              >
                状态
              </th>
              <th
                class="px-4 py-3 text-center text-zinc-400 text-sm font-medium min-w-[120px]"
              >
                网盘检测
              </th>
              <th
                class="px-4 py-3 text-left text-zinc-400 text-sm font-medium min-w-[150px]"
              >
                时间
              </th>
              <th
                class="px-4 py-3 text-center text-zinc-400 text-sm font-medium min-w-[190px]"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td colspan="7" class="px-4 py-8 text-center">
                <Loader2
                  class="w-6 h-6 text-primary-500 animate-spin mx-auto"
                />
                <p class="text-zinc-500 text-sm mt-2">加载中...</p>
              </td>
            </tr>
            <tr v-else-if="feedbacks.length === 0">
              <td colspan="7" class="px-4 py-12 text-center">
                <p class="text-zinc-500">暂无反馈</p>
              </td>
            </tr>
            <tr
              v-else
              v-for="fb in feedbacks"
              :key="fb.id"
              class="border-t border-zinc-800 hover:bg-zinc-800/50"
            >
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <span class="text-white truncate max-w-[200px]">{{
                    fb.musicTitle
                  }}</span>
                  <span class="text-zinc-500 text-sm truncate max-w-[120px]"
                    >{{ fb.musicArtist }}
                  </span>
                  <a
                    :href="`/music/${fb.musicId}`"
                    target="_blank"
                    class="text-zinc-500 hover:text-primary-400 flex-shrink-0"
                    title="查看歌曲"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                  </a>
                </div>
              </td>
              <td class="px-4 py-4">
                <span
                  class="inline-flex px-2 py-1 text-xs rounded-md"
                  :class="typeColor[fb.type] || 'text-zinc-400 bg-zinc-700'"
                >
                  {{ typeLabel[fb.type] || fb.type }}
                </span>
              </td>
              <td class="px-4 py-4">
                <span
                  v-if="fb.description"
                  class="text-zinc-400 text-sm max-w-[200px] block truncate"
                  :title="fb.description"
                  >{{ fb.description }}</span
                >
                <span v-else class="text-zinc-600 text-sm">-</span>
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
                    class="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                    @click="checkLinks(fb.musicId)"
                  >
                    <Search class="w-3.5 h-3.5" />
                    检测
                  </button>
                  <button
                    v-else-if="checkingId === fb.musicId"
                    class="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-700 text-zinc-400 rounded-lg cursor-not-allowed"
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
                      class="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="重新检测"
                      @click="checkLinks(fb.musicId)"
                    >
                      <Search class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 text-zinc-500 text-sm">
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
                  <a
                    :href="`/admin/music/edit/${fb.musicId}`"
                    target="_blank"
                    class="p-2 text-zinc-400 hover:text-primary-500 transition-colors"
                    title="编辑音乐"
                  >
                    <Edit3 class="w-4 h-4" />
                  </a>
                  <button
                    v-if="fb.status === 'PENDING'"
                    class="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
                    @click="resolveFeedback(fb.id)"
                  >
                    <CheckCircle class="w-3.5 h-3.5" />
                    完成
                  </button>
                  <span v-else class="text-zinc-600 text-sm">
                    {{ fb.resolvedBy ? `by ${fb.resolvedBy}` : "" }}
                    {{
                      fb.resolvedAt
                        ? new Date(fb.resolvedAt).toLocaleDateString("zh-CN")
                        : ""
                    }}
                  </span>
                  <button
                    class="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteFeedback(fb.id)"
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
        item-label="条反馈"
        @page-change="goToPage"
      />
    </main>
  </div>
</template>
