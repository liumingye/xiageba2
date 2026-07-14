<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Plus, Trash2, Edit3, Tag } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";

interface Category {
  id: number;
  name: string;
  image: string;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

const router = useRouter();
const { isLoggedIn, logout, checkLogin, initialized, getAuthHeaders } =
  useAuth();

const categories = ref<Category[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);

const showAddModal = ref(false);
const showEditModal = ref(false);
const newName = ref("");
const newImage = ref("");
const newSort = ref(0);
const editId = ref("");
const editName = ref("");
const editImage = ref("");
const editSort = ref(0);
const error = ref("");

const loadCategories = async () => {
  const res = await fetch(
    `/api/admin/category?page=${currentPage.value}&pageSize=20`,
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
  categories.value = data.data;
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
  await loadCategories();
});

const goToPage = (page: number) => {
  currentPage.value = page;
  loadCategories();
};

const openAddModal = () => {
  showAddModal.value = true;
  newName.value = "";
  newImage.value = "";
  newSort.value = 0;
  error.value = "";
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const openEditModal = (cat: Category) => {
  showEditModal.value = true;
  editId.value = cat.id;
  editName.value = cat.name;
  editImage.value = cat.image;
  editSort.value = cat.sort;
  error.value = "";
};

const closeEditModal = () => {
  showEditModal.value = false;
};

const addCategory = async () => {
  if (!newName.value.trim()) {
    error.value = "分类名称不能为空";
    return;
  }

  const res = await fetch("/api/admin/category", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      name: newName.value,
      image: newImage.value,
      sort: newSort.value,
    }),
  });

  if (res.ok) {
    await loadCategories();
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
  if (!editName.value.trim()) {
    error.value = "分类名称不能为空";
    return;
  }

  const res = await fetch(`/api/admin/category/${editId.value}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      name: editName.value,
      image: editImage.value,
      sort: editSort.value,
    }),
  });

  if (res.ok) {
    await loadCategories();
    closeEditModal();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "保存失败";
  }
};

const deleteCategory = async (id: string) => {
  if (!confirm("确定要删除该分类吗？")) return;

  const res = await fetch(`/api/admin/category/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });

  if (res.ok) {
    await loadCategories();
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
        <h2 class="text-lg font-medium text-white">分类管理</h2>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="openAddModal"
        >
          <Plus class="w-4 h-4" />
          添加分类
        </button>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-gray-800">
            <tr>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-20"
              >
                ID
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                名称
              </th>
              <th
                class="px-4 py-3 text-left text-gray-400 text-sm font-medium w-20"
              >
                排序
              </th>
              <th
                class="px-4 py-3 text-center text-gray-400 text-sm font-medium w-24"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cat in categories"
              :key="cat.id"
              class="border-t border-gray-800 hover:bg-gray-800/50"
            >
              <td class="px-4 py-3 text-gray-400 text-xs font-mono truncate">
                <span :title="String(cat.id)">{{ cat.id }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center"
                  >
                    <img v-if="cat.image" :src="cat.image" class="w-6 h-6" />
                    <Tag v-else class="w-5 h-5 text-gray-500" />
                  </div>
                  <span class="text-white">{{ cat.name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-gray-300">{{ cat.sort }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="openEditModal(cat)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteCategory(cat.id)"
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
          item-label="个分类"
          @page-change="goToPage"
        />

        <div v-if="categories.length === 0" class="py-12 text-center">
          <p class="text-gray-500">暂无分类</p>
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
            <h3 class="text-xl font-medium text-white mb-6">添加分类</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >分类名称 *</label
                >
                <input
                  v-model="newName"
                  type="text"
                  placeholder="请输入分类名称"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">封面图片</label>
                <input
                  v-model="newImage"
                  type="text"
                  placeholder="图片URL"
                  class="input-search"
                />
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
                  @click="addCategory"
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
            <h3 class="text-xl font-medium text-white mb-6">编辑分类</h3>
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >分类名称 *</label
                >
                <input
                  v-model="editName"
                  type="text"
                  placeholder="请输入分类名称"
                  class="input-search"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-2">封面图片</label>
                <input
                  v-model="editImage"
                  type="text"
                  placeholder="图片URL"
                  class="input-search"
                />
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
