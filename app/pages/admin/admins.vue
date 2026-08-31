<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Plus, Trash2, User, Edit3 } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminModal from "~/components/admin/Modal.vue";

interface Admin {
  id: string;
  username: string;
  createdAt: string;
}

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

const loadAdmins = async () => {
  const data = await get("/api/admin");
  admins.value = data;
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
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            @click="openAddModal"
          >
            <Plus class="w-4 h-4" />
            添加管理员
          </button>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-color-100">
            <tr>
              <th class="px-4 py-3 text-left text-color-400 text-sm font-medium">
                用户名
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-48"
              >
                创建时间
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
              v-for="admin in admins"
              :key="admin.id"
              class="border-t border-color-300 hover:bg-color-300"
            >
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 bg-color-300 rounded-full flex items-center justify-center"
                  >
                    <User class="w-5 h-5 text-color-500" />
                  </div>
                  <span>{{ admin.username }}</span>
                </div>
              </td>
              <td class="px-4 py-4 text-color-400">
                {{ new Date(admin.createdAt).toLocaleString("zh-CN") }}
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-color-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="openEditModal(admin)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-color-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteAdmin(admin.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="admins.length === 0" class="py-12 text-center">
          <p class="text-color-500">暂无管理员</p>
        </div>
      </div>
    </main>

    <AdminModal
      :show="showAddModal"
      title="添加管理员"
      @close="closeAddModal"
    >
      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2">用户名 *</label>
          <input
            v-model="newUsername"
            type="text"
            placeholder="请输入用户名"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2">密码 *</label>
          <input
            v-model="newPassword"
            type="password"
            placeholder="请输入密码"
            class="input-search"
          />
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
            @click="addAdmin"
          >
            添加
          </button>
        </div>
      </template>
    </AdminModal>

    <AdminModal
      :show="showEditModal"
      title="编辑管理员"
      @close="closeEditModal"
    >
      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2">用户名</label>
          <input
            v-model="editUsername"
            type="text"
            placeholder="请输入用户名"
            class="input-search"
          />
        </div>

        <div>
          <label class="block text-color-400 text-sm mb-2"
            >密码（留空则不修改）</label
          >
          <input
            v-model="editPassword"
            type="password"
            placeholder="请输入新密码"
            class="input-search"
          />
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
            @click="editAdmin"
          >
            保存
          </button>
        </div>
      </template>
    </AdminModal>
  </div>
</template>
