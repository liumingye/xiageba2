<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  HardDrive,
  Plus,
  Edit3,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminModal from "~/components/admin/Modal.vue";
import { get, post, put, del } from "~/utils/request";

defineOptions({ name: "StorageConfigPage" });

interface S3Config {
  id: string;
  name: string;
  baseUrl: string;
  bucket: string;
  prefix: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  createdAt: string;
  updatedAt: string;
}

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const configs = ref<S3Config[]>([]);
const showModal = ref(false);
const isEdit = ref(false);
const editId = ref("");
const saving = ref(false);
const showSecret = ref(false);
const error = ref("");

const form = ref({
  name: "",
  baseUrl: "",
  bucket: "",
  prefix: "",
  endpoint: "",
  region: "",
  accessKey: "",
  secretKey: "",
});

const loadConfigs = async () => {
  const data = await get("/api/admin/storage/config");
  configs.value = data.data;
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
  await loadConfigs();
});

const resetForm = () => {
  form.value = {
    name: "",
    baseUrl: "",
    bucket: "",
    prefix: "",
    endpoint: "",
    region: "",
    accessKey: "",
    secretKey: "",
  };
  showSecret.value = false;
  error.value = "";
};

const openAdd = () => {
  isEdit.value = false;
  editId.value = "";
  resetForm();
  showModal.value = true;
};

const openEdit = (item: S3Config) => {
  isEdit.value = true;
  editId.value = item.id;
  form.value = {
    name: item.name,
    baseUrl: item.baseUrl || "",
    bucket: item.bucket,
    prefix: item.prefix || "",
    endpoint: item.endpoint || "",
    region: item.region || "",
    accessKey: item.accessKey,
    secretKey: "••••••••",
  };
  showSecret.value = false;
  error.value = "";
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  error.value = "";
};

const validateForm = () => {
  if (!form.value.name.trim()) return "配置名称不能为空";
  if (!form.value.bucket.trim()) return "存储桶不能为空";
  if (!form.value.accessKey.trim()) return "AccessKey 不能为空";
  if (!form.value.secretKey.trim()) return "SecretKey 不能为空";
  return "";
};

const saveConfig = async () => {
  error.value = validateForm();
  if (error.value) return;

  saving.value = true;
  try {
    if (isEdit.value) {
      await put(`/api/admin/storage/config/${editId.value}`, form.value);
    } else {
      await post("/api/admin/storage/config", form.value);
    }
    showModal.value = false;
    await loadConfigs();
  } catch (err: any) {
    error.value = err?.response?.data?.message || "保存失败";
  } finally {
    saving.value = false;
  }
};

const deleteConfig = async (id: string) => {
  if (!confirm("确定删除此存储配置？")) return;
  await del(`/api/admin/storage/config/${id}`);
  await loadConfigs();
};
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium">存储配置</h2>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="openAdd"
        >
          <Plus class="w-4 h-4" />
          添加配置
        </button>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-color-100">
            <tr>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-32"
              >
                名称
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-40"
              >
                存储桶
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-32"
              >
                前缀
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium"
              >
                端点
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-24"
              >
                可用区
              </th>
              <th
                class="px-4 py-3 text-left text-color-400 text-sm font-medium w-40"
              >
                AccessKey
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
              v-for="item in configs"
              :key="item.id"
              class="border-t border-color-300 hover:bg-color-300"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <HardDrive class="w-4 h-4 text-color-500 shrink-0" />
                  <span class="truncate" :title="item.name">{{
                    item.name
                  }}</span>
                </div>
              </td>
              <td
                class="px-4 py-3 text-color-300 truncate"
                :title="item.bucket"
              >
                {{ item.bucket }}
              </td>
              <td
                class="px-4 py-3 text-color-300 truncate"
                :title="item.prefix"
              >
                {{ item.prefix || "-" }}
              </td>
              <td
                class="px-4 py-3 text-color-400 truncate"
                :title="item.endpoint"
              >
                {{ item.endpoint || "-" }}
              </td>
              <td class="px-4 py-3 text-color-300">
                {{ item.region || "-" }}
              </td>
              <td
                class="px-4 py-3 text-color-400 truncate"
                :title="item.accessKey"
              >
                {{ item.accessKey }}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-2">
                  <button
                    class="p-2 text-color-400 hover:text-primary-500 transition-colors"
                    title="编辑"
                    @click="openEdit(item)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-2 text-color-400 hover:text-red-500 transition-colors"
                    title="删除"
                    @click="deleteConfig(item.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="configs.length === 0" class="py-12 text-center">
          <p class="text-color-500">暂无存储配置</p>
        </div>
      </div>
    </main>

    <AdminModal
      :show="showModal"
      :title="isEdit ? '编辑存储配置' : '添加存储配置'"
      max-width="max-w-lg"
      @close="closeModal"
    >
      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-color-400 text-sm mb-2">配置名称 *</label>
          <input
            v-model="form.name"
            type="text"
            placeholder="请输入配置名称"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">存储桶 *</label>
          <input
            v-model="form.bucket"
            type="text"
            placeholder="请输入存储桶名称"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">BaseURL</label>
          <input
            v-model="form.baseUrl"
            type="text"
            placeholder="如 https://cdn.example.com"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">前缀</label>
          <input
            v-model="form.prefix"
            type="text"
            placeholder="对象 key 前缀"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">端点</label>
          <input
            v-model="form.endpoint"
            type="text"
            placeholder="S3 端点地址"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">可用区</label>
          <input
            v-model="form.region"
            type="text"
            placeholder="如 us-east-1"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">AccessKey *</label>
          <input
            v-model="form.accessKey"
            type="text"
            placeholder="请输入 AccessKey"
            class="input-search w-full"
          />
        </div>
        <div>
          <label class="block text-color-400 text-sm mb-2">SecretKey *</label>
          <div class="relative">
            <input
              v-model="form.secretKey"
              :type="showSecret ? 'text' : 'password'"
              :placeholder="
                isEdit ? '•••••••• 表示不修改' : '请输入 SecretKey'
              "
              class="input-search w-full pr-10"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-color-400 transition-colors"
              @click="showSecret = !showSecret"
            >
              <Eye v-if="!showSecret" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      <template #footer>
        <div class="flex gap-4">
          <button
            class="flex-1 py-3 bg-color-400 hover:bg-color-500 rounded-lg transition-colors"
            @click="closeModal"
          >
            取消
          </button>
          <button
            :disabled="saving"
            class="flex items-center justify-center gap-2 flex-1 py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-lg transition-colors"
            @click="saveConfig"
          >
            <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
            {{ saving ? "保存中..." : "保存" }}
          </button>
        </div>
      </template>
    </AdminModal>
  </div>
</template>
