<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Tag } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
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

const columns: TableColumn<Category>[] = [
  {
    id: "id",
    accessorKey: "id",
    header: "ID",
    meta: {
      class: { th: "w-20" },
    },
  },
  { id: "name", accessorKey: "name", header: "名称" },
  {
    id: "sort",
    accessorKey: "sort",
    header: "排序",
    meta: {
      class: { th: "w-20" },
    },
  },
  {
    id: "isShow",
    accessorKey: "isShow",
    header: "显示",
    meta: {
      class: { th: "text-center w-24", td: "text-center" },
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
        <UButton color="primary" icon="i-lucide-plus" @click="openAddModal">
          添加分类
        </UButton>
      </div>

      <UCard
        :ui="{
          body: 'p-0 sm:p-0',
        }"
      >
        <UTable
          :data="categories"
          :columns="columns"
          :get-row-id="(row: Category) => String(row.id)"
        >
          <template #id-cell="{ row }">
            <span
              class="text-xs text-color-400 font-mono"
              :title="String(row.original.id)"
              >{{ row.original.id }}</span
            >
          </template>
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-color-300 rounded-lg flex items-center justify-center"
              >
                <img
                  v-if="row.original.image"
                  :src="row.original.image"
                  class="w-6 h-6"
                />
                <Tag v-else class="w-5 h-5 text-color-500" />
              </div>
              <span>{{ row.original.name }}</span>
            </div>
          </template>
          <template #sort-cell="{ row }">
            <span class="text-color-300">{{ row.original.sort }}</span>
          </template>
          <template #isShow-cell="{ row }">
            <UBadge
              :color="row.original.isShow ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ row.original.isShow ? "显示" : "隐藏" }}
            </UBadge>
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
                @click="deleteCategory(row.original.id)"
              />
            </div>
          </template>
          <template #empty>
            <p class="text-center text-color-500 py-12">暂无分类</p>
          </template>
        </UTable>

        <AdminPagination
          :current-page="currentPage"
          :total-pages="totalPages"
          :total="total"
          item-label="个分类"
          @page-change="goToPage"
        />
      </UCard>
    </main>

    <UModal
      :open="showAddModal"
      title="添加分类"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) closeAddModal();
        }
      "
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
            <label class="block text-color-400 text-sm mb-2" for="add-cat-name"
              >分类名称 *</label
            >
            <UInput
              id="add-cat-name"
              v-model="newName"
              type="text"
              placeholder="请输入分类名称"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="add-cat-image"
              >封面图片</label
            >
            <div class="flex gap-2">
              <UInput
                id="add-cat-image"
                v-model="newImage"
                type="text"
                placeholder="图片URL"
                class="flex-1"
              />
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-folder-open"
                @click="showAddCoverPicker = true"
              >
                选择
              </UButton>
            </div>
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="add-cat-sort"
              >排序</label
            >
            <UInput
              id="add-cat-sort"
              v-model.number="newSort"
              type="number"
              placeholder="排序值，数字越小越靠前"
            />
          </div>
          <div class="flex items-center gap-2">
            <UCheckbox v-model="newIsShow" />
            <span class="text-color-300 text-sm">显示该分类</span>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-4">
          <UButton block color="neutral" variant="soft" @click="closeAddModal">
            取消
          </UButton>
          <UButton block color="primary" @click="addCategory">添加</UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="showEditModal"
      title="编辑分类"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) closeEditModal();
        }
      "
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
            <label class="block text-color-400 text-sm mb-2" for="edit-cat-name"
              >分类名称 *</label
            >
            <UInput
              id="edit-cat-name"
              v-model="editName"
              type="text"
              placeholder="请输入分类名称"
            />
          </div>
          <div>
            <label
              class="block text-color-400 text-sm mb-2"
              for="edit-cat-image"
              >封面图片</label
            >
            <div class="flex gap-2">
              <UInput
                id="edit-cat-image"
                v-model="editImage"
                type="text"
                placeholder="图片URL"
                class="flex-1"
              />
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-folder-open"
                @click="showEditCoverPicker = true"
              >
                选择
              </UButton>
            </div>
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-cat-sort"
              >排序</label
            >
            <UInput
              id="edit-cat-sort"
              v-model.number="editSort"
              type="number"
              placeholder="排序值，数字越小越靠前"
            />
          </div>
          <div class="flex items-center gap-2">
            <UCheckbox v-model="editIsShow" />
            <span class="text-color-300 text-sm">显示该分类</span>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-4">
          <UButton block color="neutral" variant="soft" @click="closeEditModal">
            取消
          </UButton>
          <UButton block color="primary" @click="saveEdit">保存</UButton>
        </div>
      </template>
    </UModal>

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
