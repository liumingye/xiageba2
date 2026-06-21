<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  Music,
  Users,
  LogOut,
  Plus,
  Trash2,
  User,
  Edit3,
  Settings,
} from "lucide-vue-next";

interface Admin {
  id: string;
  username: string;
  createdAt: string;
}

const router = useRouter();
const {
  isLoggedIn,
  username: currentUsername,
  logout,
  checkLogin,
  initialized,
  getAuthHeaders,
} = useAuth();

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
  const res = await fetch("/api/admin", {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  admins.value = await res.json();
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

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      username: newUsername.value,
      password: newPassword.value,
    }),
  });

  if (res.ok) {
    await loadAdmins();
    closeAddModal();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "添加失败";
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

  const res = await fetch("/api/admin", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(updateData),
  });

  if (res.ok) {
    await loadAdmins();
    closeEditModal();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  } else {
    const err = await res.json();
    error.value = err.message || "更新失败";
  }
};

const deleteAdmin = async (id: string) => {
  if (!confirm("确定要删除该管理员吗？")) return;

  const res = await fetch("/api/admin", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ id }),
  });

  if (res.ok) {
    await loadAdmins();
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const handleLogout = () => {
  logout();
  router.push("/admin/login");
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <header class="bg-gray-900 border-b border-gray-800 px-6 py-4">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center"
          >
            <Music class="w-5 h-5 text-white" />
          </div>
          <h1 class="text-xl font-bold text-white">下歌吧管理后台</h1>
        </div>

        <div class="flex items-center gap-4">
          <span class="text-gray-400">{{ currentUsername }}</span>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            @click="handleLogout"
          >
            <LogOut class="w-4 h-4" />
            退出
          </button>
        </div>
      </div>
    </header>

    <nav class="bg-gray-900/50 border-b border-gray-800 px-6 py-3">
      <div class="flex items-center gap-4 max-w-7xl mx-auto">
        <a
          href="/admin"
          class="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Music class="w-5 h-5" />
          音乐管理
        </a>
        <a
          href="/admin/admins"
          class="flex items-center gap-2 text-primary-500 font-medium"
        >
          <Users class="w-5 h-5" />
          管理员管理
        </a>
        <a
          href="/admin/maintain"
          class="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Settings class="w-5 h-5" />
          系统维护
        </a>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">管理员列表</h2>
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
        <table class="w-full">
          <thead class="bg-gray-800">
            <tr>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                用户名
              </th>
              <th class="px-4 py-3 text-left text-gray-400 text-sm font-medium">
                创建时间
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
              v-for="admin in admins"
              :key="admin.id"
              class="border-t border-gray-800 hover:bg-gray-800/50"
            >
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                  >
                    <User class="w-5 h-5 text-gray-500" />
                  </div>
                  <span class="text-white">{{ admin.username }}</span>
                </div>
              </td>
              <td class="px-4 py-4 text-gray-400">
                {{ new Date(admin.createdAt).toLocaleString("zh-CN") }}
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="openEditModal(admin)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
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
          <p class="text-gray-500">暂无管理员</p>
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
            class="modal-content relative bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-800"
          >
            <h3 class="text-xl font-medium text-white mb-6">添加管理员</h3>

            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2">用户名 *</label>
                <input
                  v-model="newUsername"
                  type="text"
                  placeholder="请输入用户名"
                  class="input-search"
                />
              </div>

              <div>
                <label class="block text-gray-400 text-sm mb-2">密码 *</label>
                <input
                  v-model="newPassword"
                  type="password"
                  placeholder="请输入密码"
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
                  @click="addAdmin"
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
            class="modal-content relative bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-800"
          >
            <h3 class="text-xl font-medium text-white mb-6">编辑管理员</h3>

            <div
              v-if="error"
              class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
            >
              {{ error }}
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-gray-400 text-sm mb-2">用户名</label>
                <input
                  v-model="editUsername"
                  type="text"
                  placeholder="请输入用户名"
                  class="input-search"
                />
              </div>

              <div>
                <label class="block text-gray-400 text-sm mb-2"
                  >密码（留空则不修改）</label
                >
                <input
                  v-model="editPassword"
                  type="password"
                  placeholder="请输入新密码"
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
                  @click="editAdmin"
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
  transition: all 0.25s ease;
}

.modal-content {
  transition: transform 0.25s ease;
  transform: translateY(-10px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(0);
}
</style>
