<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Plus, Trash2, Edit3, Archive, Megaphone } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";

interface Announcement {
  id: string;
  title: string;
  content: string;
  displayType: "NORMAL" | "BANNER" | "DIALOG";
  icon: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  status: "ACTIVE" | "ARCHIVED";
  sort: number;
  createdAt: string;
  updatedAt: string;
}

const router = useRouter();
const { isLoggedIn, logout, checkLogin, initialized, getAuthHeaders } =
  useAuth();

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

const displayTypeClass = (type: string) => {
  switch (type) {
    case "NORMAL":
      return "bg-blue-900/50 text-blue-400";
    case "BANNER":
      return "bg-purple-900/50 text-purple-400";
    case "DIALOG":
      return "bg-orange-900/50 text-orange-400";
    default:
      return "bg-gray-800 text-gray-400";
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

const iconClass = (icon: string) => {
  switch (icon) {
    case "INFO":
      return "bg-blue-900/50 text-blue-400";
    case "WARN":
      return "bg-yellow-900/50 text-yellow-400";
    case "ERROR":
      return "bg-red-900/50 text-red-400";
    case "SUCCESS":
      return "bg-green-900/50 text-green-400";
    default:
      return "bg-gray-800 text-gray-400";
  }
};

const statusLabel = (status: string) => {
  return status === "ACTIVE" ? "正常" : "已归档";
};

const statusClass = (status: string) => {
  return status === "ACTIVE"
    ? "bg-green-900/50 text-green-400"
    : "bg-gray-800 text-gray-500";
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const loadAnnouncements = async () => {
  const res = await fetch(
    `/api/admin/announcement?page=${currentPage.value}&pageSize=20`,
    {
      headers: { ...getAuthHeaders() },
    },
  );
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
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
  editDisplayType.value = item.displayType;
  editIcon.value = item.icon;
  editSort.value = item.sort;
  editStatus.value = item.status;
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

  const res = await fetch("/api/admin/announcement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      title: newTitle.value,
      content: newContent.value,
      displayType: newDisplayType.value,
      icon: newIcon.value,
      sort: newSort.value,
    }),
  });

  if (res.ok) {
    await loadAnnouncements();
    closeAddModal();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "添加失败";
  }
};

const saveEdit = async () => {
  if (!editId.value) return;
  if (!editTitle.value.trim()) {
    error.value = "标题不能为空";
    return;
  }

  const res = await fetch(`/api/admin/announcement/${editId.value}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      title: editTitle.value,
      content: editContent.value,
      displayType: editDisplayType.value,
      icon: editIcon.value,
      sort: editSort.value,
      status: editStatus.value,
    }),
  });

  if (res.ok) {
    await loadAnnouncements();
    closeEditModal();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "保存失败";
  }
};

const archiveAnnouncement = async (item: Announcement) => {
  if (!confirm("确定要归档该公告吗？")) return;

  const res = await fetch(`/api/admin/announcement/${item.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      title: item.title,
      content: item.content,
      displayType: item.displayType,
      icon: item.icon,
      sort: item.sort,
      status: "ARCHIVED",
    }),
  });

  if (res.ok) {
    await loadAnnouncements();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const deleteAnnouncement = async (id: string) => {
  if (!confirm("确定要删除该公告吗？")) return;

  const res = await fetch(`/api/admin/announcement/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });

  if (res.ok) {
    await loadAnnouncements();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">公告管理</h2>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="openAddModal"
        >
          <Plus class="w-4 h-4" />
          添加公告
        </button>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-gray-800">
            <tr>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                标题
              </th>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-28"
              >
                显示方式
              </th>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-20"
              >
                图标
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium w-20"
              >
                状态
              </th>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-40"
              >
                创建时间
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium w-32"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in announcements"
              :key="item.id"
              class="border-t border-gray-800 hover:bg-gray-800/50"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center shrink-0"
                  >
                    <Megaphone class="w-5 h-5 text-gray-500" />
                  </div>
                  <span
                    class="text-white truncate"
                    :title="item.title"
                    >{{ item.title }}</span
                  >
                </div>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-1 rounded-sm text-xs"
                  :class="displayTypeClass(item.displayType)"
                >
                  {{ displayTypeLabel(item.displayType) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-1 rounded-sm text-xs"
                  :class="iconClass(item.icon)"
                >
                  {{ iconLabel(item.icon) }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center px-2 py-1 rounded-sm text-xs"
                  :class="statusClass(item.status)"
                >
                  {{ statusLabel(item.status) }}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-300 text-sm">
                {{ formatDate(item.createdAt) }}
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
                    v-if="item.status === 'ACTIVE'"
                    class="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
                    title="归档"
                    @click="archiveAnnouncement(item)"
                  >
                    <Archive class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteAnnouncement(item.id)"
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
          item-label="条公告"
          @page-change="goToPage"
        />

        <div v-if="announcements.length === 0" class="py-12 text-center">
          <p class="text-gray-500">暂无公告</p>
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
            class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-md w-full border border-gray-800"
          >
            <h3 class="text-xl font-medium text-white mb-6">添加公告</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2">标题 *</label>
                <input
                  v-model="newTitle"
                  type="text"
                  placeholder="请输入公告标题"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">内容</label>
                <textarea
                  v-model="newContent"
                  placeholder="请输入公告内容"
                  rows="4"
                  class="input-search resize-none"
                ></textarea>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">显示方式</label>
                <select v-model="newDisplayType" class="input-search">
                  <option value="NORMAL">正常</option>
                  <option value="BANNER">横幅</option>
                  <option value="DIALOG">对话框</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">图标</label>
                <select v-model="newIcon" class="input-search">
                  <option value="INFO">信息</option>
                  <option value="WARN">警告</option>
                  <option value="ERROR">错误</option>
                  <option value="SUCCESS">成功</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">排序</label>
                <input
                  v-model.number="newSort"
                  type="number"
                  placeholder="排序值，数字越小越靠前"
                  class="input-search"
                />
              </div>
              <div class="flex gap-4">
                <button
                  class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  @click="closeAddModal"
                >
                  取消
                </button>
                <button
                  class="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                  @click="addAnnouncement"
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
            class="modal-content relative bg-gray-900 rounded-3xl p-6 max-w-md w-full border border-gray-800"
          >
            <h3 class="text-xl font-medium text-white mb-6">编辑公告</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2">标题 *</label>
                <input
                  v-model="editTitle"
                  type="text"
                  placeholder="请输入公告标题"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">内容</label>
                <textarea
                  v-model="editContent"
                  placeholder="请输入公告内容"
                  rows="4"
                  class="input-search resize-none"
                ></textarea>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">显示方式</label>
                <select v-model="editDisplayType" class="input-search">
                  <option value="NORMAL">正常</option>
                  <option value="BANNER">横幅</option>
                  <option value="DIALOG">对话框</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">图标</label>
                <select v-model="editIcon" class="input-search">
                  <option value="INFO">信息</option>
                  <option value="WARN">警告</option>
                  <option value="ERROR">错误</option>
                  <option value="SUCCESS">成功</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">排序</label>
                <input
                  v-model.number="editSort"
                  type="number"
                  placeholder="排序值，数字越小越靠前"
                  class="input-search"
                />
              </div>
              <div class="flex items-center gap-2">
                <input
                  id="editStatus"
                  v-model="editStatus"
                  type="checkbox"
                  true-value="ARCHIVED"
                  false-value="ACTIVE"
                  class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500"
                />
                <label for="editStatus" class="text-gray-300 text-sm"
                  >归档该公告</label
                >
              </div>
              <div class="flex gap-4">
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
