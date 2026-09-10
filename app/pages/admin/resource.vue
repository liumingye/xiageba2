<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Loader2 } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";

interface Source {
  id: string;
  cid?: number;
  title: string;
  url: string;
  description: string;
  menu: string;
  status: number;
  isSelf: boolean;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: number;
  name: string;
  sort: number;
}

// USelect 不允许 value 为空字符串（空串用于清除选择显示 placeholder），
// 用哨兵值代替“全部分类/无分类”，传给 API/URL 时再归一化为空
const FILTER_ALL = "__all__";
const NO_CATEGORY = "__none__";
const cidParam = (value: string) =>
  value && value !== FILTER_ALL ? value : "";
const toApiCid = (value: string) =>
  value && value !== NO_CATEGORY ? value : "";

const columns: TableColumn<Source>[] = [
  { id: "id", accessorKey: "id", header: "ID" },
  { id: "title", accessorKey: "title", header: "资源名称" },
  { id: "category", accessorKey: "cid", header: "分类" },
  { id: "url", accessorKey: "url", header: "地址" },
  { id: "createdAt", accessorKey: "createdAt", header: "入库时间" },
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
    meta: {
      class: { th: "text-center", td: "text-center" },
    },
  },
];

const router = useRouter();
const route = useRoute();
const { isLoggedIn, checkLogin, initialized } = useAuth();
const toast = useToast();
const table = useTemplateRef("table");
const columnVisibility = ref({
  id: false,
});

const sources = ref<Source[]>([]);
const categories = ref<Category[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);
const filterCid = ref<string>(FILTER_ALL);
const keyword = ref("");
const isLoading = ref(false);

const showAddModal = ref(false);
const showEditModal = ref(false);
const newCid = ref<string>(NO_CATEGORY);
const newTitle = ref("");
const newUrl = ref("");
const newDescription = ref("");
const newMenu = ref("");
const newIsSelf = ref(false);
const editId = ref("");
const editCid = ref<string>("");
const editTitle = ref("");
const editUrl = ref("");
const editDescription = ref("");
const editMenu = ref("");
const editIsSelf = ref(false);
const menuLoading = ref(false);
const menuAbortController = ref<AbortController | null>(null);
const error = ref("");

const showImportModal = ref(false);
const importCid = ref<string>(NO_CATEGORY);
const importHasHeader = ref(true);
const importIsSelf = ref(false);
const importFile = ref<File | null>(null);
const importing = ref(false);
const importResult = ref<{
  total: number;
  inserted: number;
  duplicate: number;
  failed: number;
} | null>(null);

const loadSources = async () => {
  let url = `/api/admin/source?page=${currentPage.value}&pageSize=20`;
  const cid = cidParam(filterCid.value);
  if (cid) {
    url += `&cid=${cid}`;
  }
  if (keyword.value) {
    url += `&keyword=${encodeURIComponent(keyword.value)}`;
  }

  isLoading.value = true;
  try {
    const data = await get(url);
    sources.value = data.data;
    categories.value = data.categories;
    totalPages.value = data.totalPages;
    total.value = data.total;
  } catch {
    // ignore
  } finally {
    isLoading.value = false;
  }
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

  // 从 URL 读取分页/筛选参数
  const page = parseInt(route.query.page as string);
  if (page && page > 0) {
    currentPage.value = page;
  }
  const cid = (route.query.cid as string) || FILTER_ALL;
  if (cid) {
    filterCid.value = cid;
  }
  const q = route.query.q as string;
  if (q) {
    keyword.value = q;
  }

  await loadSources();
});

// 监听浏览器前进/后退
watch(
  () => route.query,
  (query) => {
    const page = parseInt(query.page as string) || 1;
    const cid = (query.cid as string) || FILTER_ALL;
    const q = (query.q as string) || "";
    currentPage.value = page;
    filterCid.value = cid;
    keyword.value = q;
    loadSources();
  },
);

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  router.push({
    query: { ...route.query, page: page.toString() },
  });
  loadSources();
};

const handleSearch = () => {
  currentPage.value = 1;
  const query: Record<string, string> = { page: "1" };
  const cid = cidParam(filterCid.value);
  if (cid) {
    query.cid = cid;
  }
  if (keyword.value.trim()) {
    query.q = keyword.value.trim();
  }
  router.push({ query });
  loadSources();
};

const handleFilterChange = () => {
  currentPage.value = 1;
  const query: Record<string, string> = { page: "1" };
  const cid = cidParam(filterCid.value);
  if (cid) {
    query.cid = cid;
  }
  if (keyword.value.trim()) {
    query.q = keyword.value.trim();
  }
  router.push({ query });
  loadSources();
};

const openAddModal = () => {
  showAddModal.value = true;
  newTitle.value = "";
  newUrl.value = "";
  newDescription.value = "";
  newMenu.value = "";
  newIsSelf.value = false;
  error.value = "";
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const openEditModal = (item: Source) => {
  showEditModal.value = true;
  editId.value = item.id;
  editCid.value = item.cid ? String(item.cid) : NO_CATEGORY;
  editTitle.value = item.title;
  editUrl.value = item.url;
  editDescription.value = item.description;
  editMenu.value = item.menu;
  editIsSelf.value = item.isSelf || false;
  error.value = "";
};

const closeEditModal = () => {
  showEditModal.value = false;
  if (menuAbortController.value) {
    menuAbortController.value.abort();
    menuAbortController.value = null;
  }
  menuLoading.value = false;
};

const fetchMenu = async () => {
  if (!editId.value) return;
  if (menuAbortController.value) {
    menuAbortController.value.abort();
  }
  const controller = new AbortController();
  menuAbortController.value = controller;
  menuLoading.value = true;
  try {
    const data = await get(`/api/source/tree?id=${editId.value}`, {
      signal: controller.signal,
    });
    if (data.success) {
      editMenu.value = data.tree || "";
    } else {
      error.value = data.message || "获取目录失败";
    }
  } catch {
    error.value = "获取目录失败";
  } finally {
    menuAbortController.value = null;
    menuLoading.value = false;
  }
};

const addSourceing = ref(false);
const addSource = async () => {
  if (addSourceing.value) return;
  if (!newTitle.value.trim()) {
    error.value = "资源名称不能为空";
    return;
  }
  if (!newUrl.value.trim()) {
    error.value = "资源地址不能为空";
    return;
  }

  addSourceing.value = true;

  try {
    await post("/api/admin/source", {
      cid: toApiCid(newCid.value),
      title: newTitle.value,
      url: newUrl.value,
      description: newDescription.value,
      menu: newMenu.value,
      isSelf: newIsSelf.value,
    });
    closeAddModal();
    await loadSources();
  } catch (e: any) {
    const err = e?.response?.data;
    error.value = err?.message || "添加失败";
  } finally {
    addSourceing.value = false;
  }
};

const saveEditing = ref(false);
const saveEdit = async () => {
  if (saveEditing.value) return;
  if (!editId.value) return;
  if (!editTitle.value.trim()) {
    error.value = "资源名称不能为空";
    return;
  }
  if (!editUrl.value.trim()) {
    error.value = "资源地址不能为空";
    return;
  }

  saveEditing.value = true;
  try {
    await put(`/api/admin/source/${editId.value}`, {
      cid: toApiCid(editCid.value),
      title: editTitle.value,
      url: editUrl.value,
      description: editDescription.value,
      menu: editMenu.value,
      isSelf: editIsSelf.value,
    });
    closeEditModal();
    await loadSources();
  } catch (e: any) {
    const err = e?.response?.data;
    error.value = err?.message || "保存失败";
  } finally {
    saveEditing.value = false;
  }
};

const toggleStatus = async (item: Source) => {
  const newStatus = item.status === 1 ? 0 : 1;
  const id = item.id;
  if (!id) {
    throw createError({ statusCode: 400, message: "缺少资源ID" });
  }

  try {
    await put(`/api/admin/source/${id}`, {
      status: newStatus,
    });
    await loadSources();
  } catch {
    // 忽略，401 由拦截器处理
  }
};

const deleteSource = async (id: string) => {
  if (!confirm("确定要删除该资源吗？")) return;

  try {
    await del(`/api/admin/source/${id}`);
    await loadSources();
  } catch {
    // 忽略，401 由拦截器处理
  }
};

const openImportModal = () => {
  showImportModal.value = true;
  importCid.value = NO_CATEGORY;
  importHasHeader.value = true;
  importIsSelf.value = false;
  importFile.value = null;
  importResult.value = null;
  error.value = "";
};

const closeImportModal = () => {
  showImportModal.value = false;
};

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  importFile.value = target.files?.[0] || null;
  importResult.value = null;
};

const importSources = async () => {
  if (!importFile.value) {
    error.value = "请选择要导入的 Excel 文件";
    return;
  }

  importing.value = true;
  error.value = "";
  importResult.value = null;

  try {
    const formData = new FormData();
    formData.append("file", importFile.value);
    formData.append("cid", toApiCid(importCid.value));
    formData.append("hasHeader", String(importHasHeader.value));
    formData.append("isSelf", String(importIsSelf.value));

    const data = await post("/api/admin/source/import", formData);

    if (data.success) {
      importResult.value = data;
      toast.add({
        title: `导入完成：成功 ${data.inserted} 条，重复 ${data.duplicate} 条，失败 ${data.failed} 条`,
        icon: "i-lucide-check",
        color: "success",
      });
      await loadSources();
    } else {
      error.value = data.message || "导入失败";
    }
  } catch (e: any) {
    if (e?.response?.status !== 401) {
      error.value = "导入失败，请重试";
    }
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-medium">资源管理</h2>
        <div class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-file-up"
            @click="openImportModal"
          >
            导入
          </UButton>
          <UButton color="primary" icon="i-lucide-plus" @click="openAddModal">
            添加资源
          </UButton>
        </div>
      </div>

      <div
        class="flex flex-col sm:flex-row sm:justify-end max-sm:items-end gap-3 mb-3"
      >
        <UInput
          v-model="keyword"
          type="text"
          placeholder="搜索资源名称或链接"
          class="max-w-md w-full"
          @keyup.enter="handleSearch"
        />
        <div class="flex items-center gap-3">
          <USelect
            v-model="filterCid"
            class="min-w-30"
            :items="[
              { label: '全部分类', value: FILTER_ALL },
              ...categories.map((cat) => ({
                label: cat.name,
                value: cat.id.toString(),
              })),
            ]"
            @change="handleFilterChange"
          />
          <UDropdownMenu
            :items="
              table?.tableApi
                ?.getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => ({
                  label: column.id,
                  type: 'checkbox' as const,
                  checked: column.getIsVisible(),
                  onUpdateChecked(checked: boolean) {
                    table?.tableApi
                      ?.getColumn(column.id)
                      ?.toggleVisibility(!!checked);
                  },
                  onSelect(e: Event) {
                    e.preventDefault();
                  },
                }))
            "
            :content="{ align: 'end' }"
          >
            <UButton
              label="显示/隐藏列"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-chevron-down"
            />
          </UDropdownMenu>
        </div>
      </div>

      <UCard
        :ui="{
          body: 'sm:p-0 p-0',
        }"
      >
        <UTable
          ref="table"
          v-model:column-visibility="columnVisibility"
          :data="sources"
          :loading="isLoading"
          :columns="columns"
          :get-row-id="(row: Source) => row.id"
        >
          <template #id-cell="{ row }">
            {{ row.original.id }}
          </template>
          <template #title-cell="{ row }">
            {{ row.original.title }}
          </template>
          <template #category-cell="{ row }">
            {{
              categories.find((cat) => cat.id === row.original.cid)?.name || "-"
            }}
          </template>
          <template #url-cell="{ row }">
            <a
              :href="row.original.url"
              target="_blank"
              :title="row.original.url"
            >
              {{ row.original.url }}
            </a>
          </template>
          <template #createdAt-cell="{ row }">
            {{ new Date(row.original.createdAt).toLocaleString("zh-CN") }}
          </template>
          <template #status-cell="{ row }">
            <UButton
              size="sm"
              :color="row.original.status === 1 ? 'success' : 'neutral'"
              variant="subtle"
              :icon="
                row.original.status === 1
                  ? 'i-lucide-check'
                  : 'i-lucide-circle-off'
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
                @click="openEditModal(row.original)"
              />
              <UButton
                color="error"
                variant="ghost"
                square
                size="sm"
                icon="i-lucide-trash-2"
                title="删除"
                aria-label="删除"
                @click="deleteSource(row.original.id)"
              />
            </div>
          </template>
          <template #empty>
            <div v-if="isLoading" class="flex flex-col items-center gap-2 py-8">
              <Loader2 class="w-6 h-6 text-primary-500 animate-spin" />
              <p class="text-muted text-sm mt-2">加载中...</p>
            </div>
            <p v-else class="text-center text-muted py-12">暂无资源</p>
          </template>
        </UTable>

        <AdminPagination
          :current-page="currentPage"
          :total-pages="totalPages"
          :total="total"
          item-label="个资源"
          @page-change="goToPage"
        />
      </UCard>
    </main>

    <UModal
      v-model:open="showAddModal"
      title="添加资源"
      :dismissible="false"
      @close="closeAddModal"
      :ui="{
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
            <label class="block text-color-400 text-sm mb-2" for="new-cid"
              >资源分类</label
            >
            <USelect
              id="new-cid"
              v-model="newCid"
              class="w-full"
              :items="[
                { label: '无分类', value: NO_CATEGORY },
                ...categories.map((cat) => ({
                  label: cat.name,
                  value: cat.id.toString(),
                })),
              ]"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="new-title"
              >资源名称 *</label
            >
            <UInput
              id="new-title"
              v-model="newTitle"
              type="text"
              placeholder="请输入资源名称"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="new-url"
              >资源地址 *</label
            >
            <UInput
              id="new-url"
              v-model="newUrl"
              type="text"
              placeholder="请输入网盘链接"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="new-desc"
              >资源介绍</label
            >
            <UTextarea
              id="new-desc"
              v-model="newDescription"
              :rows="3"
              placeholder="资源说明，可选"
              class="w-full"
            />
          </div>
          <UCheckbox
            id="newIsSelf"
            v-model="newIsSelf"
            label="是自己的资源，搜索结果靠前"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex gap-4">
          <UButton color="neutral" variant="soft" @click="closeAddModal">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="addSourceing"
            :disabled="addSourceing"
            @click="addSource"
          >
            {{ addSourceing ? "添加中..." : "添加" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showEditModal"
      title="编辑资源"
      :dismissible="false"
      @close="closeEditModal"
      :ui="{
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
            <label class="block text-color-400 text-sm mb-2" for="edit-cid"
              >资源分类 *</label
            >
            <USelect
              id="edit-cid"
              v-model="editCid"
              class="w-full"
              :items="[
                { label: '无分类', value: NO_CATEGORY },
                ...categories.map((cat) => ({
                  label: cat.name,
                  value: cat.id.toString(),
                })),
              ]"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-title"
              >资源名称 *</label
            >
            <UInput
              id="edit-title"
              v-model="editTitle"
              type="text"
              placeholder="请输入资源名称"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-url"
              >资源地址 *</label
            >
            <UInput
              id="edit-url"
              v-model="editUrl"
              type="text"
              placeholder="请输入网盘链接"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-desc"
              >资源介绍</label
            >
            <UTextarea
              id="edit-desc"
              v-model="editDescription"
              :rows="3"
              placeholder="资源说明，可选"
              class="w-full"
            />
          </div>
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-color-400 text-sm">目录</label>
              <UButton
                type="button"
                size="sm"
                color="primary"
                variant="soft"
                icon="i-lucide-folder"
                :loading="menuLoading"
                :disabled="menuLoading"
                @click="fetchMenu"
              >
                {{ menuLoading ? "获取中..." : "获取目录" }}
              </UButton>
            </div>
            <UTextarea
              v-model="editMenu"
              :rows="5"
              placeholder="点击右上角按钮获取网盘目录，也可手动编辑"
              class="font-mono text-xs w-full"
            />
          </div>
          <UCheckbox
            id="editIsSelf"
            v-model="editIsSelf"
            label="是自己的资源，搜索结果靠前"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex gap-4">
          <UButton color="neutral" variant="soft" @click="closeEditModal">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="saveEditing"
            :disabled="saveEditing"
            @click="saveEdit"
          >
            {{ saveEditing ? "保存中..." : "保存" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showImportModal"
      title="导入资源"
      :dismissible="false"
      @close="closeImportModal"
      :ui="{
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
            <label class="block text-color-400 text-sm mb-2" for="import-cid"
              >资源分类</label
            >
            <USelect
              id="import-cid"
              v-model="importCid"
              class="w-full"
              :items="[
                { label: '无分类', value: NO_CATEGORY },
                ...categories.map((cat) => ({
                  label: cat.name,
                  value: cat.id.toString(),
                })),
              ]"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="import-file"
              >Excel 文件 *</label
            >
            <UInput
              id="import-file"
              type="file"
              accept=".xlsx"
              class="cursor-pointer"
              @change="handleFileChange"
            />
            <p class="mt-2 text-color-500 text-xs">
              第一列为资源名称，第二列为资源地址，系统将自动去重后插入。
            </p>
          </div>
          <UCheckbox
            id="hasHeader"
            v-model="importHasHeader"
            label="第一行为表头，跳过不导入"
          />
          <UCheckbox
            id="importIsSelf"
            v-model="importIsSelf"
            label="是自己的资源，搜索结果靠前"
          />
          <UAlert
            v-if="importResult"
            color="success"
            variant="soft"
            icon="i-lucide-check"
          >
            <template #title>导入完成</template>
            共解析 {{ importResult.total }} 条，成功导入
            {{ importResult.inserted }} 条，重复
            {{ importResult.duplicate }} 条，失败 {{ importResult.failed }} 条。
          </UAlert>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-4">
          <UButton color="neutral" variant="soft" @click="closeImportModal">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="importing"
            :disabled="importing || !importFile"
            @click="importSources"
          >
            {{ importing ? "导入中..." : "开始导入" }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
