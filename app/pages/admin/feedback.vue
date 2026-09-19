<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Loader2 } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
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

const checkLinks = async (musicId: string) => {
  if (checkingId.value) return;

  checkingId.value = musicId;
  try {
    // PanCheck 同步返回检测结果，无需轮询
    const data = await post(`/api/admin/music/${musicId}/check-links`);
    checkResults.value[musicId] = data;
  } catch (e: any) {
    if (e?.response?.status === 401) return;
    const err = e?.response?.data;
    alert(err?.message || "检测失败");
  } finally {
    checkingId.value = null;
  }
};

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

const typeBadgeColor = (type: string) => {
  switch (type) {
    case "BROKEN_LINK":
      return "error";
    case "WRONG_CONTENT":
    case "WRONG_CODE":
      return "warning";
    case "WRONG_QUALITY":
      return "info";
    case "WRONG_INFO":
      return "secondary";
    default:
      return "neutral";
  }
};

const columns: TableColumn<any>[] = [
  { id: "song", header: "歌曲" },
  { id: "type", accessorKey: "type", header: "类型" },
  { id: "description", accessorKey: "description", header: "描述" },
  { id: "status", accessorKey: "status", header: "状态" },
  { id: "check", header: "网盘检测" },
  { id: "createdAt", accessorKey: "createdAt", header: "时间" },
  {
    id: "actions",
    header: "操作",
    meta: {
      class: { th: "text-center", td: "text-center" },
    },
  },
];
</script>

<template>
  <div
    class="flex sm:items-center sm:justify-between flex-col sm:flex-row mb-6 gap-3"
  >
    <h2 class="text-lg font-medium">用户反馈</h2>
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        size="sm"
        :color="statusFilter === '' ? 'primary' : 'neutral'"
        :variant="statusFilter === '' ? 'solid' : 'soft'"
        @click="handleStatusFilter('')"
      >
        全部
      </UButton>
      <UButton
        size="sm"
        :color="statusFilter === 'PENDING' ? 'warning' : 'neutral'"
        :variant="statusFilter === 'PENDING' ? 'solid' : 'soft'"
        @click="handleStatusFilter('PENDING')"
      >
        待处理
      </UButton>
      <UButton
        size="sm"
        :color="statusFilter === 'DONE' ? 'success' : 'neutral'"
        :variant="statusFilter === 'DONE' ? 'solid' : 'soft'"
        @click="handleStatusFilter('DONE')"
      >
        已完成
      </UButton>
      <UButton
        color="error"
        variant="soft"
        size="sm"
        icon="i-lucide-trash-2"
        :loading="isClearing"
        :disabled="isClearing"
        @click="clearDoneFeedback"
      >
        {{ isClearing ? "清空中..." : "清空已完成" }}
      </UButton>
    </div>
  </div>

  <UCard
    :ui="{
      body: 'p-0 sm:p-0',
    }"
  >
    <UTable
      :data="isLoading ? [] : feedbacks"
      :columns="columns"
      :get-row-id="(row: any) => row.id"
    >
      <template #song-cell="{ row }">
        <div class="flex items-center gap-2">
          <span class="truncate max-w-50">{{ row.original.musicTitle }}</span>
          <span class="text-color-500 text-sm truncate max-w-30">{{
            row.original.musicArtist
          }}</span>
          <UButton
            as="a"
            :href="`/music/${row.original.musicId}`"
            target="_blank"
            color="neutral"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-external-link"
            title="查看歌曲"
            aria-label="查看歌曲"
          />
        </div>
      </template>
      <template #type-cell="{ row }">
        <UBadge :color="typeBadgeColor(row.original.type)" variant="solid">
          {{ typeLabel[row.original.type] || row.original.type }}
        </UBadge>
      </template>
      <template #description-cell="{ row }">
        <span
          v-if="row.original.description"
          class="block max-w-50 truncate text-sm text-color-400"
          :title="row.original.description"
          >{{ row.original.description }}</span
        >
        <span v-else class="text-sm text-zinc-600">-</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :color="row.original.status === 'DONE' ? 'success' : 'warning'"
          variant="soft"
        >
          {{ row.original.status === "DONE" ? "已完成" : "待处理" }}
        </UBadge>
      </template>
      <template #check-cell="{ row }">
        <div class="flex items-center justify-center gap-1.5">
          <UButton
            v-if="
              !checkResults[row.original.musicId] &&
              checkingId !== row.original.musicId
            "
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-search"
            @click="checkLinks(row.original.musicId)"
          >
            检测
          </UButton>
          <UButton
            v-else-if="checkingId === row.original.musicId"
            color="neutral"
            variant="soft"
            size="sm"
            loading
            disabled
          >
            检测中
          </UButton>
          <template v-else>
            <div
              class="flex items-center gap-1.5"
              :title="
                checkResults[row.original.musicId]?.downloads
                  ?.map(
                    (d: any) =>
                      `${d.quality}: ${d.status === 'valid' ? '有效' : d.status === 'invalid' ? '失效' : '待检测'}`,
                  )
                  .join('\n')
              "
            >
              <UBadge
                v-if="
                  checkResults[row.original.musicId]?.valid_links?.length > 0
                "
                color="success"
                variant="soft"
              >
                有效
                {{ checkResults[row.original.musicId].valid_links.length }}
              </UBadge>
              <UBadge
                v-if="
                  checkResults[row.original.musicId]?.invalid_links?.length > 0
                "
                color="error"
                variant="soft"
              >
                失效
                {{ checkResults[row.original.musicId].invalid_links.length }}
              </UBadge>
              <UBadge
                v-if="
                  checkResults[row.original.musicId]?.pending_links?.length > 0
                "
                color="warning"
                variant="soft"
              >
                待检测
                {{ checkResults[row.original.musicId].pending_links.length }}
              </UBadge>
              <UButton
                color="neutral"
                variant="ghost"
                square
                size="sm"
                icon="i-lucide-search"
                title="重新检测"
                aria-label="重新检测"
                @click="checkLinks(row.original.musicId)"
              />
            </div>
          </template>
        </div>
      </template>
      <template #createdAt-cell="{ row }">
        <span class="text-sm text-color-500">{{
          new Date(row.original.createdAt).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-center gap-2">
          <UButton
            as="a"
            :href="`/admin/music/edit/${row.original.musicId}`"
            target="_blank"
            color="neutral"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-pencil"
            title="编辑音乐"
            aria-label="编辑音乐"
          />
          <UButton
            v-if="row.original.status === 'PENDING'"
            color="success"
            size="sm"
            icon="i-lucide-check-circle"
            @click="resolveFeedback(row.original.id)"
          >
            完成
          </UButton>
          <span v-else class="text-sm text-zinc-600">
            {{ row.original.resolvedBy ? `by ${row.original.resolvedBy}` : "" }}
            {{
              row.original.resolvedAt
                ? new Date(row.original.resolvedAt).toLocaleDateString("zh-CN")
                : ""
            }}
          </span>
          <UButton
            color="error"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-trash-2"
            title="删除"
            aria-label="删除"
            @click="deleteFeedback(row.original.id)"
          />
        </div>
      </template>
      <template #empty>
        <div v-if="isLoading" class="flex flex-col items-center gap-2 py-8">
          <Loader2 class="w-6 h-6 text-primary-500 animate-spin" />
          <p class="text-color-500 text-sm mt-2">加载中...</p>
        </div>
        <p v-else class="text-center text-color-500 py-12">暂无反馈</p>
      </template>
    </UTable>
  </UCard>

  <!-- 分页 -->
  <AdminPagination
    :current-page="currentPage"
    :total-pages="totalPages"
    :total="total"
    item-label="条反馈"
    @page-change="goToPage"
  />
</template>
