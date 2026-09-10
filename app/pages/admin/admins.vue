<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { User, Loader2 } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";

interface Admin {
  id: string;
  username: string;
  createdAt: string;
}

const columns: TableColumn<Admin>[] = [
  { id: "username", accessorKey: "username", header: "用户名" },
  { id: "createdAt", accessorKey: "createdAt", header: "创建时间" },
  {
    id: "actions",
    header: "操作",
    meta: {
      class: { th: "text-center", td: "text-center" },
    },
  },
];

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const admins = ref<Admin[]>([]);
const showAddModal = ref(false);
const showEditModal = ref(false);
const newUsername = ref("");
const newPassword = ref("");
const editUsername = ref("");
const editPassword = ref("");
const editAdminId = ref("");
const error = ref("");

const isLoading = ref(false);

const loadAdmins = async () => {
  isLoading.value = true;
  const data = await get("/api/admin");
  admins.value = data;
  isLoading.value = false;
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
  await loadAdmins();
});

const openAddModal = () => {
  showAddModal.value = true;
  newUsername.value = "";
  newPassword.value = "";
  error.value = "";
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const openEditModal = (admin: Admin) => {
  showEditModal.value = true;
  editAdminId.value = admin.id;
  editUsername.value = admin.username;
  editPassword.value = "";
  error.value = "";
};

const closeEditModal = () => {
  showEditModal.value = false;
};

const addAdmin = async () => {
  if (!newUsername.value.trim() || !newPassword.value.trim()) {
    error.value = "用户名和密码不能为空";
    return;
  }

  try {
    await post("/api/admin", {
      username: newUsername.value,
      password: newPassword.value,
    });
    await loadAdmins();
    closeAddModal();
  } catch (e: any) {
    error.value = e.response?.data?.message || "添加失败";
  }
};

const editAdmin = async () => {
  if (!editAdminId.value) {
    error.value = "缺少管理员ID";
    return;
  }

  const updateData: any = { id: editAdminId.value };
  if (editUsername.value.trim())
    updateData.username = editUsername.value.trim();
  if (editPassword.value.trim())
    updateData.password = editPassword.value.trim();

  if (!updateData.username && !updateData.password) {
    error.value = "请提供要修改的用户名或密码";
    return;
  }

  try {
    await put("/api/admin", updateData);
    await loadAdmins();
    closeEditModal();
  } catch (e: any) {
    error.value = e.response?.data?.message || "更新失败";
  }
};

const deleteAdmin = async (id: string) => {
  if (!confirm("确定要删除该管理员吗？")) return;

  await del("/api/admin", { data: { id } });
  await loadAdmins();
};
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />

    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium">管理员列表</h2>
        <div class="flex items-center gap-2">
          <UButton color="primary" icon="i-lucide-plus" @click="openAddModal">
            添加管理员
          </UButton>
        </div>
      </div>

      <UCard
        :ui="{
          body: 'p-0 sm:p-0',
        }"
      >
        <UTable
          :data="admins"
          :columns="columns"
          :get-row-id="(row: Admin) => row.id"
          :loading="isLoading"
        >
          <template #username-cell="{ row }">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-color-300 rounded-full flex items-center justify-center"
              >
                <User class="w-5 h-5 text-color-500" />
              </div>
              <span>{{ row.original.username }}</span>
            </div>
          </template>
          <template #createdAt-cell="{ row }">
            <span class="text-color-400">{{
              new Date(row.original.createdAt).toLocaleString("zh-CN")
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
                color="error"
                variant="ghost"
                square
                size="sm"
                icon="i-lucide-trash-2"
                title="删除"
                aria-label="删除"
                @click="deleteAdmin(row.original.id)"
              />
            </div>
          </template>
          <template #empty>
            <div v-if="isLoading" class="flex flex-col items-center gap-2 py-8">
              <Loader2 class="w-6 h-6 text-primary-500 animate-spin" />
              <p class="text-muted text-sm mt-2">加载中...</p>
            </div>
            <p v-else class="text-center text-muted py-12">暂无管理员</p>
          </template>
        </UTable>
      </UCard>
    </main>

    <UModal
      :open="showAddModal"
      title="添加管理员"
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
            <label class="block text-color-400 text-sm mb-2" for="add-username"
              >用户名 *</label
            >
            <UInput
              id="add-username"
              v-model="newUsername"
              type="text"
              placeholder="请输入用户名"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-color-400 text-sm mb-2" for="add-password"
              >密码 *</label
            >
            <UInput
              id="add-password"
              v-model="newPassword"
              type="password"
              placeholder="请输入密码"
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
          <UButton color="primary" @click="addAdmin">添加</UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="showEditModal"
      title="编辑管理员"
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
            <label class="block text-color-400 text-sm mb-2" for="edit-username"
              >用户名</label
            >
            <UInput
              id="edit-username"
              v-model="editUsername"
              type="text"
              placeholder="请输入用户名"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-color-400 text-sm mb-2" for="edit-password"
              >密码（留空则不修改）</label
            >
            <UInput
              id="edit-password"
              v-model="editPassword"
              type="password"
              placeholder="请输入新密码"
              class="w-full"
            />
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-4">
          <UButton color="neutral" variant="soft" @click="closeEditModal">
            取消
          </UButton>
          <UButton color="primary" @click="editAdmin">保存</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
