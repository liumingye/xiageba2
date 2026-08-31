<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Plus, Trash2, Edit3, Tag, FolderOpen } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
import AdminModal from "~/components/admin/Modal.vue";
import FilePickerModal from "~/components/admin/FilePickerModal.vue";

interface Category {
  id: number;
  name: string;
  image: string;
  sort: number;
  isShow: boolean;
  createdAt: string;
  updatedAt: string;
}

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const categories = ref<Category[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);

const showAddModal = ref(false);
const showEditModal = ref(false);
const newName = ref("");
const newImage = ref("");
const newSort = ref(0);
const newIsShow = ref(true);
const editId = ref(0);
const editName = ref("");
const editImage = ref("");
const editSort = ref(0);
const editIsShow = ref(true);
const error = ref("");

const showAddCoverPicker = ref(false);
const showEditCoverPicker = ref(false);

const handleAddCoverPicked = (url: string) => {
  newImage.value = url;
  showAddCoverPicker.value = false;
};

const handleEditCoverPicked = (url: string) => {
  editImage.value = url;
  showEditCoverPicker.value = false;
};

const loadCategories = async () => {
  const data = await get(
    `/api/admin/category?page=${currentPage.value}&pageSize=20`,
  );
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
  newIsShow.value = true;
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
  editIsShow.value = cat.isShow;
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

  try {
    await post("/api/admin/category", {
      name: newName.value,
      image: newImage.value,
      sort: newSort.value,
      isShow: newIsShow.value,
    });
    await loadCategories();
    closeAddModal();
  } catch (e: any) {
    const err = e?.response?.data;
    error.value = err?.message || "添加失败";
  }
};

const saveEdit = async () => {
  if (!editId.value) return;
  if (!editName.value.trim()) {
    error.value = "分类名称不能为空";
    return;
  }

  try {
    await put(`/api/admin/category/${editId.value}`, {
      name: editName.value,
      image: editImage.value,
      sort: editSort.value,
      isShow: editIsShow.value,
    });
    await loadCategories();
    closeEditModal();
  } catch (e: any) {
    const err = e?.response?.data;
    error.value = err?.message || "保存失败";
  }
};

const deleteCategory = async (id: number) => {
  if (!confirm("确定要删除该分类吗？")) return;

  try {
    await del(`/api/admin/category/${id}`);
    await loadCategories();
  } catch {
    // 忽略，401 由拦截器处理
  }
};
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium">分类管理</h2>
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
          <thead class="bg-color-100">
            <tr>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-20"
              >
                ID
              </th>
              <th class="px-4 py-3 text-left text-color-400 text-sm font-medium">
                名称
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-20"
              >
                排序
              </th>
              <th
                class="px-4 py-3 text-center text-color-400 text-sm font-medium w-24"
              >
                显示
              </th>
              <th
                class="px-4 py-3 text-center text-color-400 text-sm font-medium w-24"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cat in categories"
              :key="cat.id"
              class="border-t border-color-300 hover:bg-color-300"
            >
              <td class="px-4 py-3 text-color-400 text-xs font-mono truncate">
                <span :title="String(cat.id)">{{ cat.id }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 bg-color-300 rounded-lg flex items-center justify-center"
                  >
                    <img v-if="cat.image" :src="cat.image" class="w-6 h-6" />
                    <Tag v-else class="w-5 h-5 text-color-500" />
                  </div>
                  <span>{{ cat.name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-color-300">{{ cat.sort }}</td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center px-2 py-1 rounded-sm text-xs"
                  :class="cat.isShow ? 'bg-green-600 text-[var(--white)]' : 'bg-color-400 text-color-400'"
                >
                  {{ cat.isShow ? "显示" : "隐藏" }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-color-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="openEditModal(cat)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-color-400 hover:text-red-500 transition-colors"
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
          :current-page="currentPage"
          :total-pages="totalPages"
          :total="total"
          item-label="个分类"
          @page-change="goToPage"
        />

        <div v-if="categories.length === 0" class="py-12 text-center">
          <p class="text-color-500">暂无分类</p>
        </div>
      </div>
    </main>

    <AdminModal
      :show="showAddModal"
      title="添加分类"
      @close="closeAddModal"
    >
      <div
        v-if="error"
        class="mb-4 p-3 bg-red-600 border border-red-800 rounded-lg text-red-400 text-sm"
      >
        {{ error }}
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2">分类名称 *</label>
          <input
            v-model="newName"
            type="text"
            placeholder="请输入分类名称"
            class="input-search"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">封面图片</label>
          <div class="flex gap-2">
            <input
              v-model="newImage"
              type="text"
              placeholder="图片URL"
              class="input-search flex-1"
            />
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-2 bg-color-400 hover:bg-color-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
              @click="showAddCoverPicker = true"
            >
              <FolderOpen class="w-4 h-4" />
              选择
            </button>
          </div>
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">排序</label>
          <input
            v-model.number="newSort"
            type="number"
            placeholder="排序值，数字越小越靠前"
            class="input-search"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            id="newIsShow"
            v-model="newIsShow"
            type="checkbox"
            class="w-4 h-4 rounded border-color-500 bg-color-300 text-primary-500 focus:ring-primary-500"
          />
          <label for="newIsShow" class="text-color-300 text-sm">显示该分类</label>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-4">
          <button
            class="flex-1 py-3 bg-color-400 hover:bg-color-500 rounded-lg transition-colors"
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
      </template>
    </AdminModal>

    <AdminModal
      :show="showEditModal"
      title="编辑分类"
      @close="closeEditModal"
    >
      <div
        v-if="error"
        class="mb-4 p-3 bg-red-600 border border-red-800 rounded-lg text-red-400 text-sm"
      >
        {{ error }}
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2">分类名称 *</label>
          <input
            v-model="editName"
            type="text"
            placeholder="请输入分类名称"
            class="input-search"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">封面图片</label>
          <div class="flex gap-2">
            <input
              v-model="editImage"
              type="text"
              placeholder="图片URL"
              class="input-search flex-1"
            />
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-2 bg-color-400 hover:bg-color-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
              @click="showEditCoverPicker = true"
            >
              <FolderOpen class="w-4 h-4" />
              选择
            </button>
          </div>
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">排序</label>
          <input
            v-model.number="editSort"
            type="number"
            placeholder="排序值，数字越小越靠前"
            class="input-search"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            id="editIsShow"
            v-model="editIsShow"
            type="checkbox"
            class="w-4 h-4 rounded border-color-500 bg-color-300 text-primary-500 focus:ring-primary-500"
          />
          <label for="editIsShow" class="text-color-300 text-sm">显示该分类</label>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-4">
          <button
            class="flex-1 py-3 bg-color-400 hover:bg-color-500 rounded-lg transition-colors"
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
      </template>
    </AdminModal>

    <FilePickerModal
      :show="showAddCoverPicker"
      @close="showAddCoverPicker = false"
      @select="handleAddCoverPicked"
    />
    <FilePickerModal
      :show="showEditCoverPicker"
      @close="showEditCoverPicker = false"
      @select="handleEditCoverPicked"
    />
  </div>
</template>
