<script setup lang="ts">
import { getApiErrorMessage } from "~/utils/apiError";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { FileText, Loader2 } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import { get, post, put, del } from "~/utils/request";
import { formatDate } from "~/utils/file";
import {
  slugifyTitle,
  validateSlug,
  type AdminPage,
  type PageStatus,
} from "~/utils/page";

useSeoMeta({ title: "页面管理" });

const router = useRouter();

const pages = ref<AdminPage[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);
const isLoading = ref(false);

const keyword = ref("");

/**
 * USelect 不允许 value 为空字符串（空串被 Reka 保留用于「清除选择」并显示 placeholder），
 * 否则 SelectItem 会直接抛错导致整页白屏。与 resource.vue 一致，用哨兵值代表“全部”。
 */
const FILTER_ALL_STATUS = "__all__";
const statusFilter = ref<string>(FILTER_ALL_STATUS);

const showAddModal = ref(false);
const showEditModal = ref(false);
const error = ref("");
const submitting = ref(false);

// 新增表单
const newTitle = ref("");
const newSlug = ref("");
const newIcon = ref("file-text");
const newContent = ref("");
const newStatus = ref<PageStatus>("PUBLISHED");
const newSort = ref(0);
const slugTouched = ref(false);

// 编辑表单
const editId = ref("");
const editTitle = ref("");
const editSlug = ref("");
const editIcon = ref("file-text");
const editContent = ref("");
const editStatus = ref<PageStatus>("PUBLISHED");
const editSort = ref(0);

const slugHint = computed(() => {
  const value = showAddModal.value ? newSlug.value : editSlug.value;
  if (!value) return "访问地址形如 /page/your-slug";
  const msg = validateSlug(value);
  return msg || `访问地址：/page/${value}`;
});

const slugInvalid = computed(() => {
  const value = showAddModal.value ? newSlug.value : editSlug.value;
  return !!value && !!validateSlug(value);
});

const onTitleInput = () => {
  if (slugTouched.value) return;
  newSlug.value = slugifyTitle(newTitle.value);
};

const columns: TableColumn<AdminPage>[] = [
  { id: "title", accessorKey: "title", header: "标题" },
  { id: "slug", accessorKey: "slug", header: "URL 缩略名" },
  {
    id: "status",
    accessorKey: "status",
    header: "状态",
    meta: { class: { th: "text-center w-24", td: "text-center" } },
  },
  {
    id: "sort",
    accessorKey: "sort",
    header: "排序",
    meta: { class: { th: "text-center w-20", td: "text-center" } },
  },
  { id: "updatedAt", accessorKey: "updatedAt", header: "更新时间" },
  {
    id: "actions",
    header: "操作",
    meta: { class: { th: "text-center w-32", td: "text-center" } },
  },
];

const loadPages = async () => {
  isLoading.value = true;
  try {
    const params = new URLSearchParams({
      page: String(currentPage.value),
      pageSize: "20",
    });
    if (keyword.value.trim()) params.set("keyword", keyword.value.trim());
    if (statusFilter.value !== FILTER_ALL_STATUS) {
      params.set("status", statusFilter.value);
    }

    const data = await get<{
      data: AdminPage[];
      total: number;
      totalPages: number;
    }>(`/api/admin/page?${params.toString()}`);

    pages.value = data.data || [];
    total.value = data.total || 0;
    totalPages.value = data.totalPages || 1;
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await loadPages();
});

const goToPage = (page: number) => {
  currentPage.value = page;
  loadPages();
};

const doSearch = () => {
  currentPage.value = 1;
  loadPages();
};

const openAddModal = () => {
  showAddModal.value = true;
  newTitle.value = "";
  newSlug.value = "";
  newIcon.value = "file-text";
  newContent.value = "";
  newStatus.value = "PUBLISHED";
  newSort.value = 0;
  slugTouched.value = false;
  error.value = "";
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const openEditModal = (item: AdminPage) => {
  showEditModal.value = true;
  editId.value = item.id;
  editTitle.value = item.title;
  editSlug.value = item.slug;
  editIcon.value = item.icon || "file-text";
  editContent.value = item.content || "";
  editStatus.value = item.status || "PUBLISHED";
  editSort.value = item.sort || 0;
  error.value = "";
};

const closeEditModal = () => {
  showEditModal.value = false;
};

/** 提交前统一校验，返回错误文案 */
const validateForm = (title: string, slug: string): string => {
  if (!title.trim()) return "页面标题不能为空";
  return validateSlug(slug);
};

const addPage = async () => {
  const msg = validateForm(newTitle.value, newSlug.value);
  if (msg) {
    error.value = msg;
    return;
  }
  submitting.value = true;
  try {
    await post("/api/admin/page", {
      title: newTitle.value.trim(),
      slug: newSlug.value.trim(),
      icon: newIcon.value.trim() || "file-text",
      content: newContent.value,
      status: newStatus.value,
      sort: newSort.value,
    });
    await loadPages();
    closeAddModal();
  } catch (e: any) {
    error.value = getApiErrorMessage(e, "添加失败");
  } finally {
    submitting.value = false;
  }
};

const saveEdit = async () => {
  if (!editId.value) return;
  const msg = validateForm(editTitle.value, editSlug.value);
  if (msg) {
    error.value = msg;
    return;
  }
  submitting.value = true;
  try {
    await put(`/api/admin/page/${editId.value}`, {
      title: editTitle.value.trim(),
      slug: editSlug.value.trim(),
      icon: editIcon.value.trim() || "file-text",
      content: editContent.value,
      status: editStatus.value,
      sort: editSort.value,
    });
    await loadPages();
    closeEditModal();
  } catch (e: any) {
    error.value = getApiErrorMessage(e, "保存失败");
  } finally {
    submitting.value = false;
  }
};

const deletePage = async (item: AdminPage) => {
  if (
    !confirm(
      `确定要删除页面「${item.title}」吗？\n\n删除后 /page/${item.slug} 将无法访问，此操作不可恢复。`,
    )
  ) {
    return;
  }
  // 二次确认：需手动输入 slug 才允许删除
  const typed = prompt(`请输入页面缩略名「${item.slug}」以确认删除：`);
  if (typed === null) return;
  if (typed.trim() !== item.slug) {
    alert("输入的缩略名不一致，已取消删除。");
    return;
  }

  try {
    await del(`/api/admin/page/${item.id}`);
    await loadPages();
  } catch (e: any) {
    alert(getApiErrorMessage(e, "删除失败"));
  }
};
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-lg font-medium">页面管理</h2>
    <UButton color="primary" icon="i-lucide-plus" @click="openAddModal">
      新增页面
    </UButton>
  </div>

  <!-- 筛选 -->
  <UCard class="mb-4">
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-52 flex-1">
        <label class="block text-color-400 text-sm mb-2" for="page-keyword">
          关键字
        </label>
        <UInput
          id="page-keyword"
          v-model="keyword"
          placeholder="按标题或缩略名搜索"
          class="w-full"
          @keyup.enter="doSearch"
        />
      </div>
      <div class="w-40">
        <label class="block text-color-400 text-sm mb-2" for="page-status">
          状态
        </label>
        <USelect
          id="page-status"
          v-model="statusFilter"
          value-key="value"
          :items="[
            { label: '全部', value: FILTER_ALL_STATUS },
            { label: '已发布', value: 'PUBLISHED' },
            { label: '草稿', value: 'DRAFT' },
          ]"
          class="w-full"
        />
      </div>
      <UButton color="neutral" variant="soft" icon="i-lucide-search" @click="doSearch">
        搜索
      </UButton>
    </div>
  </UCard>

  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <UTable
      @hover="() => {}"
      :data="pages"
      :columns="columns"
      :get-row-id="(row: AdminPage) => row.id"
      :loading="isLoading"
    >
      <template #title-cell="{ row }">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-color-300 rounded-lg flex items-center justify-center shrink-0"
          >
            <UIcon
              :name="`i-lucide-${row.original.icon || 'file-text'}`"
              class="w-5 h-5 text-color-500"
            />
          </div>
          <span class="truncate" :title="row.original.title">
            {{ row.original.title }}
          </span>
        </div>
      </template>
      <template #slug-cell="{ row }">
        <code class="text-sm text-color-300">/page/{{ row.original.slug }}</code>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :color="row.original.status === 'PUBLISHED' ? 'success' : 'neutral'"
          variant="soft"
        >
          {{ row.original.status === "PUBLISHED" ? "已发布" : "草稿" }}
        </UBadge>
      </template>
      <template #sort-cell="{ row }">
        <span class="text-sm text-color-300">{{ row.original.sort ?? 0 }}</span>
      </template>
      <template #updatedAt-cell="{ row }">
        <span class="text-sm text-color-300">
          {{ formatDate(row.original.updatedAt || row.original.createdAt) }}
        </span>
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
            v-if="row.original.status === 'PUBLISHED'"
            color="neutral"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-external-link"
            title="前台预览"
            aria-label="前台预览"
            :to="`/page/${row.original.slug}`"
            target="_blank"
          />
          <UButton
            color="error"
            variant="ghost"
            square
            size="sm"
            icon="i-lucide-trash-2"
            title="删除"
            aria-label="删除"
            @click="deletePage(row.original)"
          />
        </div>
      </template>
      <template #empty>
        <div v-if="isLoading" class="flex flex-col items-center gap-2 py-8">
          <Loader2 class="w-6 h-6 text-primary-500 animate-spin" />
          <p class="text-muted text-sm mt-2">加载中...</p>
        </div>
        <div v-else class="flex flex-col items-center gap-2 py-12">
          <FileText class="w-8 h-8 text-color-300" />
          <p class="text-muted text-sm">暂无页面，点击右上角「新增页面」创建</p>
        </div>
      </template>
    </UTable>

    <AdminPagination
      :current-page="currentPage"
      :total-pages="totalPages"
      :total="total"
      item-label="个页面"
      @page-change="goToPage"
    />
  </UCard>

  <!-- 新增 -->
  <UModal
    :open="showAddModal"
    title="新增页面"
    :dismissible="false"
    @update:open="
      (v) => {
        if (!v) closeAddModal();
      }
    "
    :ui="{ content: 'max-w-3xl', footer: 'justify-end' }"
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
          <label class="block text-color-400 text-sm mb-2" for="page-title">
            页面标题 *
          </label>
          <UInput
            id="page-title"
            v-model="newTitle"
            placeholder="请输入页面标题"
            class="w-full"
            @update:model-value="onTitleInput"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="page-slug">
            URL 缩略名 *
          </label>
          <UInput
            id="page-slug"
            v-model="newSlug"
            placeholder="如 privacy-policy"
            class="w-full"
            @update:model-value="slugTouched = true"
          />
          <p
            class="text-xs mt-1"
            :class="slugInvalid ? 'text-error' : 'text-color-300'"
          >
            {{ slugHint }}
          </p>
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">图标</label>
          <AdminIconPicker v-model="newIcon" input-id="page-icon" />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">正文内容</label>
          <Editor v-model="newContent" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-color-400 text-sm mb-2" for="page-status-new">
              状态
            </label>
            <USelect
              id="page-status-new"
              v-model="newStatus"
              value-key="value"
              :items="[
                { label: '已发布', value: 'PUBLISHED' },
                { label: '草稿', value: 'DRAFT' },
              ]"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="page-sort-new">
              排序
            </label>
            <UInput
              id="page-sort-new"
              v-model.number="newSort"
              type="number"
              placeholder="数字越小越靠前"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex gap-4">
        <UButton color="neutral" variant="soft" @click="closeAddModal">
          取消
        </UButton>
        <UButton color="primary" :loading="submitting" @click="addPage">
          添加
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- 编辑 -->
  <UModal
    :open="showEditModal"
    title="编辑页面"
    :dismissible="false"
    @update:open="
      (v) => {
        if (!v) closeEditModal();
      }
    "
    :ui="{ content: 'max-w-3xl', footer: 'justify-end' }"
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
          <label class="block text-color-400 text-sm mb-2" for="edit-page-title">
            页面标题 *
          </label>
          <UInput
            id="edit-page-title"
            v-model="editTitle"
            placeholder="请输入页面标题"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2" for="edit-page-slug">
            URL 缩略名 *
          </label>
          <UInput
            id="edit-page-slug"
            v-model="editSlug"
            placeholder="如 privacy-policy"
            class="w-full"
          />
          <p
            class="text-xs mt-1"
            :class="slugInvalid ? 'text-error' : 'text-color-300'"
          >
            {{ slugHint }}
          </p>
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">图标</label>
          <AdminIconPicker v-model="editIcon" input-id="edit-page-icon" />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">正文内容</label>
          <Editor v-model="editContent" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-page-status">
              状态
            </label>
            <USelect
              id="edit-page-status"
              v-model="editStatus"
              value-key="value"
              :items="[
                { label: '已发布', value: 'PUBLISHED' },
                { label: '草稿', value: 'DRAFT' },
              ]"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-page-sort">
              排序
            </label>
            <UInput
              id="edit-page-sort"
              v-model.number="editSort"
              type="number"
              placeholder="数字越小越靠前"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex gap-4">
        <UButton color="neutral" variant="soft" @click="closeEditModal">
          取消
        </UButton>
        <UButton color="primary" :loading="submitting" @click="saveEdit">
          保存
        </UButton>
      </div>
    </template>
  </UModal>
</template>
