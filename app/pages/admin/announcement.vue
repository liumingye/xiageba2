<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Megaphone, Loader2 } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import { formatDate } from "~/utils/file";
import type { Announcement } from "~/utils/announcement";

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const announcements = ref<Announcement[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);

const showAddModal = ref(false);
const showEditModal = ref(false);
const newTitle = ref("");
const newContent = ref("");
const newDisplayType = ref<"NORMAL" | "BANNER" | "DIALOG">("NORMAL");
const newIcon = ref<"INFO" | "WARN" | "ERROR" | "SUCCESS">("INFO");
const newSort = ref(0);
const editId = ref("");
const editTitle = ref("");
const editContent = ref("");
const editDisplayType = ref<"NORMAL" | "BANNER" | "DIALOG">("NORMAL");
const editIcon = ref<"INFO" | "WARN" | "ERROR" | "SUCCESS">("INFO");
const editSort = ref(0);
const editStatus = ref<"ACTIVE" | "ARCHIVED">("ACTIVE");
const error = ref("");

// 归档开关（checkbox）与编辑状态字段互转
const editArchived = computed({
  get: () => editStatus.value === "ARCHIVED",
  set: (val: boolean) => {
    editStatus.value = val ? "ARCHIVED" : "ACTIVE";
  },
});

const displayTypeLabel = (type: string) => {
  switch (type) {
    case "NORMAL":
      return "正常";
    case "BANNER":
      return "横幅";
    case "DIALOG":
      return "对话框";
    default:
      return type;
  }
};

const iconLabel = (icon: string) => {
  switch (icon) {
    case "INFO":
      return "信息";
    case "WARN":
      return "警告";
    case "ERROR":
      return "错误";
    case "SUCCESS":
      return "成功";
    default:
      return icon;
  }
};

const statusLabel = (status: string) => {
  return status === "ACTIVE" ? "正常" : "已归档";
};

const columns: TableColumn<Announcement>[] = [
  { id: "title", accessorKey: "title", header: "标题" },
  { id: "displayType", accessorKey: "displayType", header: "显示方式" },
  { id: "icon", accessorKey: "icon", header: "图标" },
  {
    id: "status",
    accessorKey: "status",
    header: "状态",
    meta: {
      class: { th: "text-center w-20", td: "text-center" },
    },
  },
  { id: "createdAt", accessorKey: "createdAt", header: "创建时间" },
  {
    id: "actions",
    header: "操作",
    meta: {
      class: { th: "text-center w-32", td: "text-center" },
    },
  },
];

// formatDate 已统一抽取到 ~/utils/file

const isLoading = ref(false);

const loadAnnouncements = async () => {
  isLoading.value = true;
  const data = await get(
    `/api/admin/announcement?page=${currentPage.value}&pageSize=20`,
  );
  isLoading.value = false;
  announcements.value = data.data;
  totalPages.value = data.totalPages;
  total.value = data.total;
};

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }
  await loadAnnouncements();
});

const goToPage = (page: number) => {
  currentPage.value = page;
  loadAnnouncements();
};

const openAddModal = () => {
  showAddModal.value = true;
  newTitle.value = "";
  newContent.value = "";
  newDisplayType.value = "NORMAL";
  newIcon.value = "INFO";
  newSort.value = 0;
  error.value = "";
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const openEditModal = (item: Announcement) => {
  showEditModal.value = true;
  editId.value = item.id;
  editTitle.value = item.title;
  editContent.value = item.content;
  editDisplayType.value = item.displayType || "NORMAL";
  editIcon.value = item.icon;
  editSort.value = item.sort || 0;
  editStatus.value = item.status || "ACTIVE";
  error.value = "";
};

const closeEditModal = () => {
  showEditModal.value = false;
};

const addAnnouncement = async () => {
  if (!newTitle.value.trim()) {
    error.value = "标题不能为空";
    return;
  }

  try {
    await post("/api/admin/announcement", {
      title: newTitle.value,
      content: newContent.value,
      displayType: newDisplayType.value,
      icon: newIcon.value,
      sort: newSort.value,
    });
    await loadAnnouncements();
    closeAddModal();
  } catch (e: any) {
    const err = e?.response?.data;
    error.value = err?.message || "添加失败";
  }
};

const saveEdit = async () => {
  if (!editId.value) return;
  if (!editTitle.value.trim()) {
    error.value = "标题不能为空";
    return;
  }

  try {
    await put(`/api/admin/announcement/${editId.value}`, {
      title: editTitle.value,
      content: editContent.value,
      displayType: editDisplayType.value,
      icon: editIcon.value,
      sort: editSort.value,
      status: editStatus.value,
    });
    await loadAnnouncements();
    closeEditModal();
  } catch (e: any) {
    const err = e?.response?.data;
    error.value = err?.message || "保存失败";
  }
};

const archiveAnnouncement = async (item: Announcement) => {
  if (!confirm("确定要归档该公告吗？")) return;

  try {
    await put(`/api/admin/announcement/${item.id}`, {
      title: item.title,
      content: item.content,
      displayType: item.displayType,
      icon: item.icon,
      sort: item.sort,
      status: "ARCHIVED",
    });
    await loadAnnouncements();
  } catch {
    // 401 已由拦截器处理
  }
};

const deleteAnnouncement = async (id: string) => {
  if (!confirm("确定要删除该公告吗？")) return;

  try {
    await del(`/api/admin/announcement/${id}`);
    await loadAnnouncements();
  } catch {
    // 401 已由拦截器处理
  }
};
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-lg font-medium">公告管理</h2>
    <UButton color="primary" icon="i-lucide-plus" @click="openAddModal">
      添加公告
    </UButton>
  </div>

  <UCard
    :ui="{
      body: 'p-0 sm:p-0',
    }"
  >
    <UTable
      :data="announcements"
      :columns="columns"
      :get-row-id="(row: Announcement) => row.id"
      :loading="isLoading"
    >
      <template #title-cell="{ row }">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-color-300 rounded-lg flex items-center justify-center shrink-0"
          >
            <Megaphone class="w-5 h-5 text-color-500" />
          </div>
          <span class="truncate" :title="row.original.title">{{
            row.original.title
          }}</span>
        </div>
      </template>
      <template #displayType-cell="{ row }">
        <UBadge
          :color="
            row.original.displayType === 'BANNER'
              ? 'secondary'
              : row.original.displayType === 'DIALOG'
                ? 'warning'
                : 'info'
          "
          variant="soft"
        >
          {{ displayTypeLabel(row.original.displayType || "NORMAL") }}
        </UBadge>
      </template>
      <template #icon-cell="{ row }">
        <UBadge
          :color="
            row.original.icon === 'ERROR'
              ? 'error'
              : row.original.icon === 'WARN'
                ? 'warning'
                : row.original.icon === 'SUCCESS'
                  ? 'success'
                  : 'info'
          "
          variant="soft"
        >
          {{ iconLabel(row.original.icon) }}
        </UBadge>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :color="row.original.status === 'ACTIVE' ? 'success' : 'neutral'"
          variant="soft"
        >
          {{ statusLabel(row.original.status || "ACTIVE") }}
        </UBadge>
      </template>
      <template #createdAt-cell="{ row }">
        <span class="text-sm text-color-300">{{
          formatDate(row.original.createdAt)
        }}</span>
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
            @click="openEditModal(row.original)"
          />
          <UButton
            v-if="row.original.status === 'ACTIVE'"
            color="warning"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-archive"
            title="归档"
            aria-label="归档"
            @click="archiveAnnouncement(row.original)"
          />
          <UButton
            color="error"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-trash-2"
            title="删除"
            aria-label="删除"
            @click="deleteAnnouncement(row.original.id)"
          />
        </div>
      </template>
      <template #empty>
        <div v-if="isLoading" class="flex flex-col items-center gap-2 py-8">
          <Loader2 class="w-6 h-6 text-primary-500 animate-spin" />
          <p class="text-muted text-sm mt-2">加载中...</p>
        </div>
        <p v-else class="text-center text-muted py-12">暂无公告</p>
      </template>
    </UTable>

    <AdminPagination
      :current-page="currentPage"
      :total-pages="totalPages"
      :total="total"
      item-label="条公告"
      @page-change="goToPage"
    />
  </UCard>

  <UModal
    :open="showAddModal"
    title="添加公告"
    :dismissible="false"
    @update:open="
      (v) => {
        if (!v) closeAddModal();
      }
    "
    :ui="{
      content: 'max-w-2xl',
      footer: 'justify-end',
    }"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        class="mb-4"
      />
      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2" for="ann-title"
            >标题 *</label
          >
          <UInput
            id="ann-title"
            v-model="newTitle"
            type="text"
            placeholder="请输入公告标题"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">内容</label>
          <Editor v-model="newContent" />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="ann-dtype"
            >显示方式</label
          >
          <USelect
            id="ann-dtype"
            v-model="newDisplayType"
            value-key="value"
            :items="[
              { label: '正常', value: 'NORMAL' },
              { label: '横幅', value: 'BANNER' },
              { label: '对话框', value: 'DIALOG' },
            ]"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="ann-icon"
            >图标</label
          >
          <USelect
            id="ann-icon"
            v-model="newIcon"
            value-key="value"
            :items="[
              { label: '信息', value: 'INFO' },
              { label: '警告', value: 'WARN' },
              { label: '错误', value: 'ERROR' },
              { label: '成功', value: 'SUCCESS' },
            ]"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="ann-sort"
            >排序</label
          >
          <UInput
            id="ann-sort"
            v-model.number="newSort"
            type="number"
            placeholder="排序值，数字越小越靠前"
            class="w-full"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-4">
        <UButton color="neutral" variant="soft" @click="closeAddModal">
          取消
        </UButton>
        <UButton color="primary" @click="addAnnouncement">添加</UButton>
      </div>
    </template>
  </UModal>

  <UModal
    :open="showEditModal"
    title="编辑公告"
    :dismissible="false"
    @update:open="
      (v) => {
        if (!v) closeEditModal();
      }
    "
    :ui="{
      content: 'max-w-2xl',
      footer: 'justify-end',
    }"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        class="mb-4"
      />
      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2" for="edit-ann-title"
            >标题 *</label
          >
          <UInput
            id="edit-ann-title"
            v-model="editTitle"
            type="text"
            placeholder="请输入公告标题"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">内容</label>
          <Editor v-model="editContent" />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="edit-ann-dtype"
            >显示方式</label
          >
          <USelect
            id="edit-ann-dtype"
            v-model="editDisplayType"
            value-key="value"
            :items="[
              { label: '正常', value: 'NORMAL' },
              { label: '横幅', value: 'BANNER' },
              { label: '对话框', value: 'DIALOG' },
            ]"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="edit-ann-icon"
            >图标</label
          >
          <USelect
            id="edit-ann-icon"
            v-model="editIcon"
            value-key="value"
            :items="[
              { label: '信息', value: 'INFO' },
              { label: '警告', value: 'WARN' },
              { label: '错误', value: 'ERROR' },
              { label: '成功', value: 'SUCCESS' },
            ]"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="edit-ann-sort"
            >排序</label
          >
          <UInput
            id="edit-ann-sort"
            v-model.number="editSort"
            type="number"
            placeholder="排序值，数字越小越靠前"
            class="w-full"
          />
        </div>
        <div class="flex items-center gap-2">
          <UCheckbox v-model="editArchived" />
          <span class="text-color-300 text-sm">归档该公告</span>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-4">
        <UButton color="neutral" variant="soft" @click="closeEditModal">
          取消
        </UButton>
        <UButton color="primary" @click="saveEdit">保存</UButton>
      </div>
    </template>
  </UModal>
</template>
