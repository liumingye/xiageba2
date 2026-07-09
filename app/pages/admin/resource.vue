<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  Plus,
  Trash2,
  Edit3,
  Database,
  Search,
  Folder,
  FileUp,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import { useToast } from "~/composables/useToast";

interface Source {
  id: string;
  cid?: number;
  title: string;
  url: string;
  description: string;
  menu: string;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: number;
  name: string;
  sort: number;
}

const router = useRouter();
const { isLoggedIn, logout, checkLogin, initialized, getAuthHeaders } =
  useAuth();
const toast = useToast();

const sources = ref<Source[]>([]);
const categories = ref<Category[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);
const filterCid = ref("");
const keyword = ref("");

const showAddModal = ref(false);
const showEditModal = ref(false);
const newCid = ref<string>("");
const newTitle = ref("");
const newUrl = ref("");
const newDescription = ref("");
const newMenu = ref("");
const editId = ref("");
const editCid = ref<string>("");
const editTitle = ref("");
const editUrl = ref("");
const editDescription = ref("");
const editMenu = ref("");
const menuLoading = ref(false);
const menuAbortController = ref<AbortController | null>(null);
const error = ref("");

const showImportModal = ref(false);
const importCid = ref<string>("");
const importHasHeader = ref(true);
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
  if (filterCid.value) {
    url += `&cid=${filterCid.value}`;
  }
  if (keyword.value) {
    url += `&keyword=${encodeURIComponent(keyword.value)}`;
  }

  const res = await fetch(url, {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
  sources.value = data.data;
  categories.value = data.categories;
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
  await loadSources();
});

const goToPage = (page: number) => {
  currentPage.value = page;
  loadSources();
};

const handleSearch = () => {
  currentPage.value = 1;
  loadSources();
};

const handleFilterChange = () => {
  currentPage.value = 1;
  loadSources();
};

const openAddModal = () => {
  showAddModal.value = true;
  newTitle.value = "";
  newUrl.value = "";
  newDescription.value = "";
  newMenu.value = "";
  error.value = "";
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const openEditModal = (item: Source) => {
  showEditModal.value = true;
  editId.value = item.id;
  editCid.value = item.cid?.toString() || ""; // 转换为字符串
  editTitle.value = item.title;
  editUrl.value = item.url;
  editDescription.value = item.description;
  editMenu.value = item.menu;
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
    const res = await fetch(`/api/source/tree?id=${editId.value}`, {
      signal: controller.signal,
    });
    const data = await res.json();
    if (res.ok && data.success) {
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

  const res = await fetch("/api/admin/source", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      cid: newCid.value,
      title: newTitle.value,
      url: newUrl.value,
      description: newDescription.value,
      menu: newMenu.value,
    }),
  });

  if (res.ok) {
    await loadSources();
    closeAddModal();
    addSourceing.value = false;
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "添加失败";
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
  const res = await fetch(`/api/admin/source/${editId.value}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      cid: editCid.value,
      title: editTitle.value,
      url: editUrl.value,
      description: editDescription.value,
      menu: editMenu.value,
    }),
  });

  if (res.ok) {
    await loadSources();
    closeEditModal();
    saveEditing.value = false;
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "保存失败";
    saveEditing.value = false;
  }
};

const deleteSource = async (id: string) => {
  if (!confirm("确定要删除该资源吗？")) return;

  const res = await fetch(`/api/admin/source/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });

  if (res.ok) {
    await loadSources();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const openImportModal = () => {
  showImportModal.value = true;
  importCid.value = "";
  importHasHeader.value = true;
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
    formData.append("cid", importCid.value);
    formData.append("hasHeader", String(importHasHeader.value));

    const res = await fetch("/api/admin/source/import", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    if (res.status === 401) {
      logout();
      router.push("/admin/login");
      return;
    }

    const data = await res.json();
    if (res.ok && data.success) {
      importResult.value = data;
      toast.success(
        `导入完成：成功 ${data.inserted} 条，重复 ${data.duplicate} 条，失败 ${data.failed} 条`,
      );
      await loadSources();
    } else {
      error.value = data.message || "导入失败";
    }
  } catch {
    error.value = "导入失败，请重试";
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">资源管理</h2>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <select
              v-model="filterCid"
              class="input-search py-2 px-3 text-sm w-40"
              @change="handleFilterChange"
            >
              <option value="">全部分类</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
            <div class="relative">
              <input
                v-model="keyword"
                type="text"
                placeholder="搜索资源名称或链接"
                class="input-search py-2 pl-9 pr-3 text-sm w-56"
                @keyup.enter="handleSearch"
              />
              <Search
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              />
            </div>
          </div>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            @click="openImportModal"
          >
            <FileUp class="w-4 h-4" />
            导入
          </button>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="openAddModal"
          >
            <Plus class="w-4 h-4" />
            添加资源
          </button>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-gray-800">
            <tr>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                ID
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                资源名称
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                分类
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                地址
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                入库时间
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                更新时间
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in sources"
              :key="item.id"
              class="border-t border-gray-800 hover:bg-gray-800/50"
            >
              <td class="px-4 py-3 text-gray-400 text-xs">
                <span :title="item.id">{{ item.id }}</span>
              </td>
              <td class="px-4 py-3 max-w-60 break-words">
                <span class="text-white" :title="item.title">{{
                  item.title
                }}</span>
              </td>
              <td class="px-4 py-3 text-gray-300">
                {{ categories.find((cat) => cat.id === item.cid)?.name || "-" }}
              </td>
              <td class="px-4 py-3 max-w-60 break-words">
                <a
                  :href="item.url"
                  target="_blank"
                  class="text-primary-400 hover:text-primary-300 text-sm"
                  :title="item.url"
                >
                  {{ item.url }}
                </a>
              </td>
              <td class="px-4 py-3 text-gray-400 text-sm">
                {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
              </td>
              <td class="px-4 py-3 text-gray-400 text-sm">
                <template v-if="item.updatedAt">
                  {{ new Date(item.updatedAt).toLocaleString("zh-CN") }}
                </template>
                <span v-else>-</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="openEditModal(item)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteSource(item.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <AdminPagination
          v-if="totalPages > 1"
          :current-page="currentPage"
          :total-pages="totalPages"
          :total="total"
          item-label="个资源"
          @page-change="goToPage"
        />

        <div v-if="sources.length === 0" class="py-12 text-center">
          <p class="text-gray-500">暂无资源</p>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showAddModal"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            class="absolute inset-0 bg-black/70 backdrop-blur-sm"
            @click="closeAddModal"
          ></div>
          <div
            class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto"
          >
            <h3 class="text-xl font-medium text-white mb-6">添加资源</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2">资源分类</label>
                <select v-model="newCid" class="input-search">
                  <option value="">无分类</option>
                  <option
                    v-for="cat in categories"
                    :key="cat.id"
                    :value="cat.id"
                  >
                    {{ cat.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >资源名称 *</label
                >
                <input
                  v-model="newTitle"
                  type="text"
                  placeholder="请输入资源名称"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >资源地址 *</label
                >
                <input
                  v-model="newUrl"
                  type="text"
                  placeholder="请输入网盘链接"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">资源介绍</label>
                <textarea
                  v-model="newDescription"
                  rows="3"
                  placeholder="资源说明，可选"
                  class="input-search resize-none"
                ></textarea>
              </div>
              <div class="flex gap-4 pt-2">
                <button
                  class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  @click="closeAddModal"
                >
                  取消
                </button>
                <button
                  class="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                  @click="addSource"
                  :disabled="addSourceing"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="modal">
        <div
          v-if="showEditModal"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            class="absolute inset-0 bg-black/70 backdrop-blur-sm"
            @click="closeEditModal"
          ></div>
          <div
            class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto"
          >
            <h3 class="text-xl font-medium text-white mb-6">编辑资源</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >资源分类 *</label
                >
                <select v-model="editCid" class="input-search">
                  <option value="">无分类</option>
                  <option
                    v-for="cat in categories"
                    :key="cat.id"
                    :value="cat.id"
                  >
                    {{ cat.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >资源名称 *</label
                >
                <input
                  v-model="editTitle"
                  type="text"
                  placeholder="请输入资源名称"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >资源地址 *</label
                >
                <input
                  v-model="editUrl"
                  type="text"
                  placeholder="请输入网盘链接"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">资源介绍</label>
                <textarea
                  v-model="editDescription"
                  rows="3"
                  placeholder="资源说明，可选"
                  class="input-search resize-none"
                ></textarea>
              </div>
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="block text-gray-400 text-sm">目录</label>
                  <button
                    type="button"
                    class="flex items-center gap-1 px-2 py-1 text-xs bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded transition-colors disabled:opacity-50"
                    :disabled="menuLoading"
                    @click="fetchMenu"
                  >
                    <Folder class="w-3 h-3" />
                    {{ menuLoading ? "获取中..." : "获取目录" }}
                  </button>
                </div>
                <textarea
                  v-model="editMenu"
                  rows="5"
                  placeholder="点击右上角按钮获取网盘目录，也可手动编辑"
                  class="input-search resize-none font-mono text-xs"
                ></textarea>
              </div>
              <div class="flex gap-4 pt-2">
                <button
                  class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  @click="closeEditModal"
                >
                  取消
                </button>
                <button
                  class="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                  @click="saveEdit"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="modal">
        <div
          v-if="showImportModal"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            class="absolute inset-0 bg-black/70 backdrop-blur-sm"
            @click="closeImportModal"
          ></div>
          <div
            class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-lg w-full border border-gray-800 max-h-[90vh] overflow-y-auto"
          >
            <h3 class="text-xl font-medium text-white mb-6">导入资源</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2">资源分类</label>
                <select v-model="importCid" class="input-search">
                  <option value="">无分类</option>
                  <option
                    v-for="cat in categories"
                    :key="cat.id"
                    :value="cat.id"
                  >
                    {{ cat.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >Excel 文件 *</label
                >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  class="input-search py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                  @change="handleFileChange"
                />
                <p class="mt-2 text-gray-500 text-xs">
                  第一列为资源名称，第二列为资源地址，系统将自动去重后插入。
                </p>
              </div>
              <div class="flex items-center gap-2">
                <input
                  id="hasHeader"
                  v-model="importHasHeader"
                  type="checkbox"
                  class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500"
                />
                <label for="hasHeader" class="text-gray-300 text-sm"
                  >第一行为表头，跳过不导入</label
                >
              </div>
              <div
                v-if="importResult"
                class="p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-400 text-sm"
              >
                <p>
                  共解析 {{ importResult.total }} 条，成功导入
                  {{ importResult.inserted }} 条，重复
                  {{ importResult.duplicate }} 条，失败
                  {{ importResult.failed }} 条。
                </p>
              </div>
              <div class="flex gap-4 pt-2">
                <button
                  class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  @click="closeImportModal"
                >
                  取消
                </button>
                <button
                  class="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  :disabled="importing || !importFile"
                  @click="importSources"
                >
                  {{ importing ? "导入中..." : "开始导入" }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
