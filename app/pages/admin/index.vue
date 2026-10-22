<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Search, Loader2 } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import type { Music as MusicType } from "~/stores/music";

useSeoMeta({
  title: "音乐管理",
});

type TableData = Pick<
  MusicType,
  "id" | "title" | "artist" | "album" | "cover" | "status"
>;

const config = useRuntimeConfig();
const router = useRouter();
const route = useRoute();
const { isLoggedIn, logout, checkLogin, initialized } = useAuth();
const toast = useToast();

const musics = ref<TableData[]>([]);
const searchQuery = ref("");
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const totalPages = ref(0);
const isLoading = ref(false);

const columns: TableColumn<TableData>[] = [
  {
    id: "select",
    enableHiding: false,
    meta: {
      class: { th: "w-10", td: "w-10" },
    },
  },
  { id: "cover", accessorKey: "cover", header: "封面" },
  { id: "title", accessorKey: "title", header: "歌名" },
  { id: "artist", accessorKey: "artist", header: "歌手" },
  { id: "album", accessorKey: "album", header: "专辑" },
  {
    id: "status",
    accessorKey: "status",
    header: "状态",
    meta: {
      class: { th: "text-center", td: "text-center" },
    },
  },
  {
    id: "actions",
    header: "操作",
    meta: {
      class: { th: "text-center w-24", td: "text-center" },
    },
  },
];

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
  const q = route.query.q as string;
  if (q) {
    searchQuery.value = q;
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

    const data = await get(`/api/admin/music?${params}`, {
      signal: controller.signal,
    });

    if (wordkey !== searchQuery.value.trim()) return;

    musics.value = data.data;
    total.value = data.total;
    totalPages.value = data.totalPages;
  } finally {
    isLoading.value = false;
    // 数据刷新后清除选择状态，避免残留已不存在的行
    clearSelection();
  }
};

// 监听浏览器前进/后退
watch(
  () => route.query,
  (query) => {
    const page = parseInt(query.page as string) || 1;
    const q = (query.q as string) || "";
    currentPage.value = page;
    searchQuery.value = q;
    loadMusic();
  },
);

const inputSearch = () => {
  currentPage.value = 1;
  const query: Record<string, string> = { page: "1" };
  if (searchQuery.value.trim()) {
    query.q = searchQuery.value;
  }
  router.push({ query });
};

const goToAddMusic = () => {
  router.push("/admin/music/add");
};

const editMusic = (id: string) => {
  window.open(`/admin/music/edit/${id}`, "_blank");
};

const deleteMusic = async (id: string) => {
  if (!confirm("确定要删除这首歌吗？")) return;

  await del("/api/admin/music", { data: { id } });
  await loadMusic();
};

// ============ 状态开关 ============
const toggleStatus = async (item: TableData) => {
  const newStatus = item.status === 1 ? 0 : 1;

  try {
    await put("/api/admin/music", {
      id: item.id,
      status: newStatus,
    });
    await loadMusic();
  } catch {
    // 忽略，401 由拦截器处理
  }
};

// ============ 批量操作 ============
const rowSelection = ref<Record<string, boolean>>({});
const selectedIds = computed(() =>
  Object.keys(rowSelection.value).filter((key) => rowSelection.value[key]),
);
const batchOperating = ref(false);

const clearSelection = () => {
  rowSelection.value = {};
};

const batchUpdateStatus = async (status: number) => {
  const ids = selectedIds.value;
  if (!ids.length || batchOperating.value) return;

  batchOperating.value = true;
  try {
    const data = await post("/api/admin/music/batch", {
      action: "status",
      ids,
      status,
    });
    toast.add({
      title:
        status === 1
          ? `已启用 ${data.count} 首音乐`
          : `已禁用 ${data.count} 首音乐`,
      icon: "i-lucide-check",
      color: "success",
    });
    await loadMusic();
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "批量操作失败",
      color: "error",
    });
  } finally {
    batchOperating.value = false;
  }
};

const batchDelete = async () => {
  const ids = selectedIds.value;
  if (!ids.length || batchOperating.value) return;
  if (!confirm(`确定要删除选中的 ${ids.length} 首音乐吗？删除后不可恢复。`)) {
    return;
  }

  batchOperating.value = true;
  try {
    const data = await post("/api/admin/music/batch", {
      action: "delete",
      ids,
    });
    toast.add({
      title: `已删除 ${data.count} 首音乐`,
      icon: "i-lucide-check",
      color: "success",
    });
    await loadMusic();
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "批量删除失败",
      color: "error",
    });
  } finally {
    batchOperating.value = false;
  }
};

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  router.push({
    query: { ...route.query, page: page.toString() },
  });
};
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-lg font-medium">音乐列表</h2>
    <div class="flex items-center gap-2">
      <UButton color="primary" icon="i-lucide-plus" @click="goToAddMusic">
        添加音乐
      </UButton>
    </div>
  </div>
  <form @submit.prevent="inputSearch" class="mb-4 max-w-md">
    <UInput
      v-model="searchQuery"
      type="text"
      placeholder="搜索歌名或歌手..."
      class="w-full"
    >
      <template #leading>
        <Search class="w-4 h-4 text-muted" />
      </template>
    </UInput>
  </form>

  <UCard
    :ui="{
      body: 'p-0 sm:p-0',
    }"
  >
    <UTable
      @hover="() => {}"
      v-model:row-selection="rowSelection"
      :data="isLoading ? [] : musics"
      :columns="columns"
      :get-row-id="(row: TableData) => row.id"
    >
      <template #select-header="{ table }">
        <UCheckbox
          :model-value="
            table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : table.getIsAllPageRowsSelected()
          "
          aria-label="全选"
          @update:model-value="
            (value: boolean | 'indeterminate') =>
              table.toggleAllPageRowsSelected(!!value)
          "
        />
      </template>
      <template #select-cell="{ row }">
        <UCheckbox
          :model-value="row.getIsSelected()"
          aria-label="选择该行"
          @update:model-value="
            (value: boolean | 'indeterminate') => row.toggleSelected(!!value)
          "
        />
      </template>
      <template #cover-cell="{ row }">
        <img
          :src="row.original.cover || config.app.baseURL + 'img/cover.png'"
          :alt="row.original.title"
          class="min-w-10 max-w-10 rounded object-cover aspect-square"
        />
      </template>
      <template #title-cell="{ row }">
        <span class="block max-w-50 truncate" :title="row.original.title">{{
          row.original.title
        }}</span>
      </template>
      <template #artist-cell="{ row }">
        <span class="block max-w-50 truncate" :title="row.original.artist">{{
          row.original.artist
        }}</span>
      </template>
      <template #album-cell="{ row }">
        <span
          class="block max-w-50 truncate"
          :title="row.original.album || '-'"
          >{{ row.original.album || "-" }}</span
        >
      </template>
      <template #status-cell="{ row }">
        <UButton
          size="sm"
          :color="row.original.status === 1 ? 'success' : 'neutral'"
          variant="subtle"
          :icon="
            row.original.status === 1 ? 'i-lucide-check' : 'i-lucide-circle-off'
          "
          @click="toggleStatus(row.original)"
        >
          {{ row.original.status === 1 ? "启用" : "禁用" }}
        </UButton>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-pencil"
            title="编辑"
            aria-label="编辑"
            @click="editMusic(row.original.id)"
          />
          <UButton
            color="error"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-trash-2"
            title="删除"
            aria-label="删除"
            @click="deleteMusic(row.original.id)"
          />
        </div>
      </template>
      <template #empty>
        <div v-if="isLoading" class="flex flex-col items-center gap-2 py-8">
          <Loader2 class="w-6 h-6 text-primary-500 animate-spin" />
          <p class="text-muted mt-2">加载中...</p>
        </div>
        <p v-else class="text-center text-muted py-12">暂无音乐</p>
      </template>
    </UTable>

    <div
      v-if="selectedIds.length"
      class="flex flex-wrap items-center gap-2 px-2 py-3 border-t border-default"
    >
      <span class="text-sm text-muted">已选 {{ selectedIds.length }} 项</span>
      <UButton
        size="sm"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        :loading="batchOperating"
        @click="batchUpdateStatus(1)"
      >
        批量启用
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-lucide-circle-off"
        :loading="batchOperating"
        @click="batchUpdateStatus(0)"
      >
        批量禁用
      </UButton>
      <UButton
        size="sm"
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        :loading="batchOperating"
        @click="batchDelete"
      >
        批量删除
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="batchOperating"
        @click="clearSelection"
      >
        取消选择
      </UButton>
    </div>
  </UCard>
  <!-- 分页 -->
  <AdminPagination
    :current-page="currentPage"
    :total-pages="totalPages"
    :total="total"
    item-label="首音乐"
    @page-change="goToPage"
  />
</template>
