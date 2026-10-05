<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Loader2 } from "@lucide/vue";
import type { ContextMenuItem, TableColumn, TableRow } from "@nuxt/ui";
import AdminPagination from "~/components/admin/AdminPagination.vue";

useSeoMeta({
  title: "资源管理",
});

interface Source {
  id: string;
  cid?: number;
  title: string;
  url: string;
  description: string;
  menu: string;
  status: number;
  isSelf: boolean;
  createdAt: string;
}

interface Category {
  id: number;
  name: string;
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
  {
    id: "select",
    enableHiding: false,
    meta: {
      class: { th: "w-10", td: "w-10" },
    },
  },
  { id: "id", accessorKey: "id", header: "ID" },
  { id: "title", accessorKey: "title", header: "资源名称" },
  {
    id: "category",
    accessorKey: "cid",
    header: "分类",
    meta: { class: { th: "min-w-15" } },
  },
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

// ============ 批量操作 ============
const rowSelection = ref<Record<string, boolean>>({});
const selectedIds = computed(() =>
  Object.keys(rowSelection.value).filter((key) => rowSelection.value[key]),
);
const batchOperating = ref(false);
const showBatchCategoryModal = ref(false);
const batchCid = ref<string>(NO_CATEGORY);

const clearSelection = () => {
  rowSelection.value = {};
};

const showAddModal = ref(false);
const showEditModal = ref(false);
const newCid = ref<string>(NO_CATEGORY);
const newTitle = ref("");
// 添加弹窗：多个资源地址输入框，默认 3 个
const newUrls = ref<string[]>(["", "", ""]);
const addUrlInput = () => {
  newUrls.value.push("");
};
const removeUrlInput = (index: number) => {
  if (newUrls.value.length <= 1) return;
  newUrls.value.splice(index, 1);
};
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
const importStrategy = ref<"skip" | "update">("skip");
const importFile = ref<File | null>(null);
const importing = ref(false);
const importResult = ref<{
  total: number;
  inserted: number;
  updated: number;
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
    // 数据刷新后清除选择状态，避免残留已不存在的行
    clearSelection();
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

/** 搜索/筛选变更：重置页码并同步 URL 查询参数后加载列表 */
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
  newUrls.value = ["", "", ""];
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
// 地址重复时的选择弹窗
const showDuplicateModal = ref(false);
const duplicateList = ref<{ id: string; title: string; url: string }[]>([]);
const duplicateSubmitting = ref(false);

const addSource = async () => {
  if (addSourceing.value) return;
  if (!newTitle.value.trim()) {
    error.value = "资源名称不能为空";
    return;
  }
  const urls = parseNewUrls();
  if (!urls.length) {
    error.value = "资源地址不能为空";
    return;
  }

  addSourceing.value = true;

  try {
    const data = await post("/api/admin/source", {
      cid: toApiCid(newCid.value),
      title: newTitle.value,
      urls,
      description: newDescription.value,
      menu: newMenu.value,
      isSelf: newIsSelf.value,
    });
    if (urls.length > 1) {
      // 多地址批量添加：后端逐条处理并返回统计
      toast.add({
        title: `添加完成：成功 ${data.inserted} 条，更新 ${data.updated} 条，重复 ${data.duplicate} 条，失败 ${data.failed} 条`,
        icon: "i-lucide-check",
        color: "success",
      });
    }
    closeAddModal();
    await loadSources();
  } catch (e: any) {
    const status = e?.response?.status;
    const err = e?.response?.data;
    if (status === 409) {
      // 地址重复，弹出选择窗口：更新 / 强制添加 / 跳过重复 / 取消
      duplicateList.value = err?.data?.duplicates || [];
      showDuplicateModal.value = true;
      error.value = "";
    } else {
      error.value = err?.message || "添加失败";
    }
  } finally {
    addSourceing.value = false;
  }
};

/** 地址重复后按用户选择重新提交 */
const resolveDuplicate = async (opts: {
  force?: boolean;
  updateExisting?: boolean;
  skipDuplicates?: boolean;
}) => {
  if (duplicateSubmitting.value) return;
  duplicateSubmitting.value = true;

  const urls = parseNewUrls();

  try {
    const data = await post("/api/admin/source", {
      cid: toApiCid(newCid.value),
      title: newTitle.value,
      urls,
      description: newDescription.value,
      menu: newMenu.value,
      isSelf: newIsSelf.value,
      ...opts,
    });
    if (data.success) {
      closeDuplicateModal();
      closeAddModal();
      if (urls.length > 1) {
        // 多地址批量处理：显示统计
        toast.add({
          title: `处理完成：成功 ${data.inserted} 条，更新 ${data.updated} 条，重复 ${data.duplicate} 条，失败 ${data.failed} 条`,
          icon: "i-lucide-check",
          color: "success",
        });
      } else if (opts.skipDuplicates) {
        toast.add({
          title: "已跳过重复地址，未添加新资源",
          icon: "i-lucide-check",
          color: "success",
        });
      } else {
        toast.add({
          title: data.updated ? "已更新资源信息" : "资源添加成功",
          icon: "i-lucide-check",
          color: "success",
        });
      }
      await loadSources();
    }
  } catch (e: any) {
    const err = e?.response?.data;
    closeDuplicateModal();
    error.value = err?.message || "操作失败";
  } finally {
    duplicateSubmitting.value = false;
  }
};

const closeDuplicateModal = () => {
  showDuplicateModal.value = false;
  duplicateList.value = [];
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

  try {
    await put(`/api/admin/source/${item.id}`, {
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

// ============ 批量操作 ============
const batchUpdateStatus = async (status: number) => {
  const ids = selectedIds.value;
  if (!ids.length || batchOperating.value) return;

  batchOperating.value = true;
  try {
    const data = await post("/api/admin/source/batch", {
      action: "status",
      ids,
      status,
    });
    toast.add({
      title:
        status === 1
          ? `已启用 ${data.count} 项资源`
          : `已禁用 ${data.count} 项资源`,
      icon: "i-lucide-check",
      color: "success",
    });
    await loadSources();
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "批量操作失败",
      color: "error",
    });
  } finally {
    batchOperating.value = false;
  }
};

const openBatchCategoryModal = () => {
  if (!selectedIds.value.length) return;
  batchCid.value = NO_CATEGORY;
  showBatchCategoryModal.value = true;
};

const batchSetCategory = async () => {
  const ids = selectedIds.value;
  if (!ids.length || batchOperating.value) return;

  batchOperating.value = true;
  try {
    const data = await post("/api/admin/source/batch", {
      action: "category",
      ids,
      cid: toApiCid(batchCid.value),
    });
    toast.add({
      title: `已更新 ${data.count} 项资源的分类`,
      icon: "i-lucide-check",
      color: "success",
    });
    showBatchCategoryModal.value = false;
    await loadSources();
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "批量设置分类失败",
      color: "error",
    });
  } finally {
    batchOperating.value = false;
  }
};

const batchDelete = async () => {
  const ids = selectedIds.value;
  if (!ids.length || batchOperating.value) return;
  if (!confirm(`确定要删除选中的 ${ids.length} 项资源吗？删除后不可恢复。`)) {
    return;
  }

  batchOperating.value = true;
  try {
    const data = await post("/api/admin/source/batch", {
      action: "delete",
      ids,
    });
    toast.add({
      title: `已删除 ${data.count} 项资源`,
      icon: "i-lucide-check",
      color: "success",
    });
    await loadSources();
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "批量删除失败",
      color: "error",
    });
  } finally {
    batchOperating.value = false;
  }
};

/** 从文本中提取并净化网盘链接 */
function purifyUrl(input: string): string {
  const text = input.trim();
  if (!text) return "";

  // =========================
  // 1. 百度 share/init
  // =========================
  const baiduInitMatch = text.match(
    /https?:\/\/pan\.baidu\.com\/share\/init\?surl=([a-zA-Z0-9_-]+)/i,
  );

  if (baiduInitMatch) {
    const surl = baiduInitMatch[1];

    // pwd 可以在 &pwd= 后面
    const pwdMatch = text.match(/[?&]pwd=([a-zA-Z0-9]{4})/i);

    const pwd = pwdMatch?.[1];

    return `https://pan.baidu.com/s/1${surl}${pwd ? `?pwd=${pwd}` : ""}`;
  }

  // =========================
  // 2. 普通网盘分享链接
  // =========================
  const patterns = [
    // 百度
    /https?:\/\/pan\.baidu\.com\/s\/[a-zA-Z0-9_-]+/i,
    // 夸克
    /https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9_-]+/i,
    // UC
    /https?:\/\/(?:drive|fast)\.uc\.cn\/s\/[a-zA-Z0-9_-]+/i,
    // 迅雷
    /https?:\/\/pan\.xunlei\.com\/s\/[a-zA-Z0-9_-]+/i,
  ];

  let url: string | null = null;

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      url = match[0];
      break;
    }
  }

  // 没有匹配到已知网盘链接
  if (!url) {
    return text;
  }

  // =========================
  // 3. 提取 pwd
  // =========================

  const pwdMatch = text.match(/[?&]pwd=([a-zA-Z0-9]{4})/i);

  const pwd = pwdMatch?.[1];

  // =========================
  // 4. 重新拼接
  // =========================

  if (pwd) {
    url += `?pwd=${pwd}`;
  }

  // =========================
  // 5. 统一 HTTPS
  // =========================

  url = url.replace(/^http:\/\//i, "https://");

  return url;
}

/** 解析添加弹窗中多个输入框的地址，返回去重后的地址数组 */
function parseNewUrls(): string[] {
  return [...new Set(newUrls.value.map((url) => url.trim()).filter(Boolean))];
}

/** 粘贴剪贴板内容到添加弹窗指定输入框并自动净化 */
async function pasteAndPurifyAt(index: number) {
  try {
    const raw = await navigator.clipboard.readText();
    if (!raw) return;
    newUrls.value[index] = purifyUrl(raw);
  } catch {
    toast.add({ title: "无法读取剪贴板", color: "error" });
  }
}

/** 净化添加弹窗指定输入框中的链接 */
function purifyCurrentAt(index: number) {
  if (!newUrls.value[index]) return;
  newUrls.value[index] = purifyUrl(newUrls.value[index]);
}

/** 粘贴剪贴板内容到编辑弹窗并自动净化 */
async function pasteAndPurifyEdit() {
  try {
    const raw = await navigator.clipboard.readText();
    if (!raw) return;
    editUrl.value = purifyUrl(raw);
  } catch {
    toast.add({ title: "无法读取剪贴板", color: "error" });
  }
}

/** 净化编辑弹窗输入框中的链接 */
function purifyCurrentEdit() {
  editUrl.value = purifyUrl(editUrl.value);
}

const openImportModal = () => {
  showImportModal.value = true;
  importCid.value = NO_CATEGORY;
  importHasHeader.value = true;
  importIsSelf.value = false;
  importStrategy.value = "skip";
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
    formData.append("strategy", importStrategy.value);

    const data = await post("/api/admin/source/import", formData);

    if (data.success) {
      importResult.value = data;
      const part =
        importStrategy.value === "update" && data.updated
          ? `，更新 ${data.updated} 条`
          : `，重复 ${data.duplicate} 条`;
      toast.add({
        title: `导入完成：成功 ${data.inserted} 条${part}，失败 ${data.failed} 条`,
        icon: "i-lucide-check",
        color: "success",
      });
      await loadSources();
    } else {
      error.value = data.message || "导入失败";
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message || "导入失败，请重试";
  } finally {
    importing.value = false;
  }
};

const items = ref<ContextMenuItem[]>([]);

function getRowItems(row: TableRow<Source>): ContextMenuItem[] {
  // 有选中项时追加批量操作菜单组
  const batchItems: ContextMenuItem[] = selectedIds.value.length
    ? [
        [
          {
            type: "label",
            label: `批量操作（已选 ${selectedIds.value.length} 项）`,
          },
          {
            label: "批量启用",
            icon: "i-lucide-circle-check",
            onSelect() {
              batchUpdateStatus(1);
            },
          },
          {
            label: "批量禁用",
            icon: "i-lucide-circle-off",
            onSelect() {
              batchUpdateStatus(0);
            },
          },
          {
            label: "批量设置分类",
            icon: "i-lucide-folder-pen",
            onSelect() {
              openBatchCategoryModal();
            },
          },
          {
            label: "批量删除",
            color: "error",
            icon: "i-lucide-trash-2",
            onSelect() {
              batchDelete();
            },
          },
        ],
      ]
    : [];

  return [
    [
      {
        label: row.getIsSelected() ? "取消选中该行" : "选中该行",
        icon: "i-lucide-square-check",
        onSelect() {
          row.toggleSelected(!row.getIsSelected());
        },
      },
    ],
    [
      {
        type: "label",
        label: "操作",
      },
      {
        label: "编辑资源",
        icon: "i-lucide-edit",
        onSelect() {
          openEditModal(row.original);
        },
      },
      {
        label: "复制资源ID",
        icon: "i-lucide-copy",
        onSelect() {
          navigator.clipboard.writeText(row.original.id);
          toast.add({
            title: `资源ID ${row.original.id} 已复制`,
            color: "success",
          });
        },
      },
      {
        label: row.original.status === 1 ? "禁用资源" : "启用资源",
        icon:
          row.original.status === 1
            ? "i-lucide-circle-off"
            : "i-lucide-circle-check",
        onSelect() {
          toggleStatus(row.original);
        },
      },
      {
        label: "删除资源",
        color: "error",
        icon: "i-lucide-trash-2",
        onSelect() {
          deleteSource(row.original.id);
        },
      },
    ],
    ...batchItems,
  ];
}

function onContextmenu(_e: Event, row: TableRow<Source>) {
  items.value = getRowItems(row);
}
</script>

<template>
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
      @keyup.enter="handleFilterChange"
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
    <UContextMenu :items="items">
      <UTable
        @hover="() => {}"
        @contextmenu="onContextmenu"
        ref="table"
        v-model:column-visibility="columnVisibility"
        v-model:row-selection="rowSelection"
        :data="sources"
        :loading="isLoading"
        :columns="columns"
        :get-row-id="(row: Source) => row.id"
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
        <template #id-cell="{ row }">
          {{ row.original.id }}
        </template>
        <template #title-cell="{ row }">
          <UIcon
            v-if="row.original.isSelf"
            name="i-lucide-user-star"
            class="size-3 text-primary"
          />
          {{ row.original.title }}
        </template>
        <template #category-cell="{ row }">
          {{
            categories.find((cat) => cat.id === row.original.cid)?.name || "-"
          }}
        </template>
        <template #url-cell="{ row }">
          <a :href="row.original.url" target="_blank" :title="row.original.url">
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
    </UContextMenu>

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
        color="primary"
        variant="soft"
        icon="i-lucide-folder-pen"
        :loading="batchOperating"
        @click="openBatchCategoryModal"
      >
        批量设置分类
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

    <AdminPagination
      class="border-t border-default"
      :current-page="currentPage"
      :total-pages="totalPages"
      :total="total"
      item-label="个资源"
      @page-change="goToPage"
    />
  </UCard>

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
          <div class="flex gap-2 mb-2 items-center">
            <label class="block text-color-400 text-sm flex-1"
              >资源地址 *</label
            >
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-plus"
              @click="addUrlInput"
            >
              添加地址
            </UButton>
          </div>
          <div class="space-y-2 sm:space-y-1">
            <div
              v-for="(_, index) in newUrls"
              :key="index"
              class="flex flex-col sm:flex-row gap-2 sm:gap-1 sm:items-center"
            >
              <UInput
                v-model="newUrls[index]"
                type="text"
                :placeholder="`网盘链接 ${index + 1}`"
                class="w-full sm:flex-1"
                size="sm"
              />
              <div class="flex gap-2 sm:gap-1">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-clipboard"
                  class="flex-1 sm:flex-none justify-center"
                  :aria-label="`粘贴地址 ${index + 1}`"
                  @click="pasteAndPurifyAt(index)"
                >
                  粘贴
                </UButton>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-sparkles"
                  class="flex-1 sm:flex-none justify-center"
                  :aria-label="`净化地址 ${index + 1}`"
                  @click="purifyCurrentAt(index)"
                >
                  净化
                </UButton>
                <UButton
                  v-if="newUrls.length > 1"
                  size="sm"
                  color="error"
                  variant="soft"
                  square
                  icon="i-lucide-x"
                  :aria-label="`删除地址 ${index + 1}`"
                  @click="removeUrlInput(index)"
                />
              </div>
            </div>
          </div>
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
    v-model:open="showDuplicateModal"
    title="资源地址已存在"
    :dismissible="false"
    :ui="{
      footer: 'justify-end',
    }"
  >
    <template #body>
      <UAlert
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="
          duplicateList.length > 1
            ? `输入的资源地址中有 ${duplicateList.length} 个已存在，请选择处理方式`
            : '输入的资源地址已存在于以下资源，请选择处理方式'
        "
        class="mb-4"
      />
      <div class="space-y-3 text-sm break-all max-h-60 overflow-y-auto">
        <div
          v-for="dup in duplicateList"
          :key="dup.id"
          class="border-b border-default pb-2 last:border-b-0 last:pb-0"
        >
          <p><span class="text-color-500">资源 ID：</span>{{ dup.id }}</p>
          <p><span class="text-color-500">资源名称：</span>{{ dup.title }}</p>
          <p class="text-xs">
            <span class="text-color-500">资源地址：</span>{{ dup.url }}
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-3">
        <UButton
          color="primary"
          icon="i-lucide-refresh-cw"
          :loading="duplicateSubmitting"
          :disabled="duplicateSubmitting"
          @click="resolveDuplicate({ updateExisting: true })"
        >
          更新资源信息
        </UButton>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-plus"
          :loading="duplicateSubmitting"
          :disabled="duplicateSubmitting"
          @click="resolveDuplicate({ force: true })"
        >
          强制继续添加
        </UButton>
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-skip-forward"
          :loading="duplicateSubmitting"
          :disabled="duplicateSubmitting"
          @click="resolveDuplicate({ skipDuplicates: true })"
        >
          跳过重复
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          :disabled="duplicateSubmitting"
          @click="closeDuplicateModal"
        >
          取消
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
          <div class="flex gap-2 mb-2 items-center">
            <label class="block text-color-400 text-sm flex-1" for="edit-url"
              >资源地址 *</label
            >
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-clipboard"
              @click="pasteAndPurifyEdit"
            >
              粘贴
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-sparkles"
              @click="purifyCurrentEdit"
            >
              净化
            </UButton>
          </div>
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
              color="neutral"
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
            class="cursor-pointer w-full"
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
        <div>
          <label class="block text-color-400 text-sm mb-2" for="import-strategy"
            >重复资源处理</label
          >
          <USelect
            id="import-strategy"
            v-model="importStrategy"
            class="w-full"
            :items="[
              { label: '跳过添加重复资源', value: 'skip' },
              { label: '更新原有资源信息', value: 'update' },
            ]"
          />
          <p class="mt-2 text-color-500 text-xs">
            当 Excel
            中的地址已存在时，选择“跳过”则忽略该条；选择“更新”则会覆盖原有资源的名称、分类与
            isSelf 标记。
          </p>
        </div>
        <UAlert
          v-if="importResult"
          color="success"
          variant="soft"
          icon="i-lucide-check"
        >
          <template #title>导入完成</template>
          共解析 {{ importResult.total }} 条，成功导入
          {{ importResult.inserted }} 条
          <template v-if="importResult.updated">
            ，更新 {{ importResult.updated }} 条
          </template>
          ，重复 {{ importResult.duplicate }} 条，失败
          {{ importResult.failed }} 条。
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

  <UModal
    v-model:open="showBatchCategoryModal"
    title="批量设置分类"
    :dismissible="false"
    :ui="{
      footer: 'justify-end',
    }"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          将为选中的 {{ selectedIds.length }} 项资源设置以下分类：
        </p>
        <USelect
          v-model="batchCid"
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
    </template>
    <template #footer>
      <div class="flex gap-4">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="batchOperating"
          @click="showBatchCategoryModal = false"
        >
          取消
        </UButton>
        <UButton
          color="primary"
          :loading="batchOperating"
          :disabled="batchOperating"
          @click="batchSetCategory"
        >
          {{ batchOperating ? "设置中..." : "确定" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
