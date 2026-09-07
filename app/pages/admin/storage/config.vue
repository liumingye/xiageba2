<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { HardDrive } from "@lucide/vue";
import type { TableColumn } from "@nuxt/ui";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
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

const columns: TableColumn<S3Config>[] = [
  { id: "name", accessorKey: "name", header: "名称" },
  { id: "bucket", accessorKey: "bucket", header: "存储桶" },
  { id: "prefix", accessorKey: "prefix", header: "前缀" },
  { id: "endpoint", accessorKey: "endpoint", header: "端点" },
  { id: "region", accessorKey: "region", header: "可用区" },
  { id: "accessKey", accessorKey: "accessKey", header: "AccessKey" },
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
        <UButton color="primary" icon="i-lucide-plus" @click="openAdd">
          添加配置
        </UButton>
      </div>

      <UCard
        :ui="{
          body: 'p-0 sm:p-0',
        }"
      >
        <UTable
          :data="configs"
          :columns="columns"
          :get-row-id="(row: S3Config) => row.id"
        >
          <template #name-cell="{ row }">
            <div class="flex items-center gap-2">
              <HardDrive class="w-4 h-4 text-color-500 shrink-0" />
              <span class="truncate" :title="row.original.name">{{
                row.original.name
              }}</span>
            </div>
          </template>
          <template #bucket-cell="{ row }">
            <span
              class="truncate text-color-300"
              :title="row.original.bucket"
              >{{ row.original.bucket }}</span
            >
          </template>
          <template #prefix-cell="{ row }">
            <span
              class="truncate text-color-300"
              :title="row.original.prefix"
              >{{ row.original.prefix || "-" }}</span
            >
          </template>
          <template #endpoint-cell="{ row }">
            <span
              class="truncate text-color-400"
              :title="row.original.endpoint"
              >{{ row.original.endpoint || "-" }}</span
            >
          </template>
          <template #region-cell="{ row }">
            <span class="text-color-300">{{ row.original.region || "-" }}</span>
          </template>
          <template #accessKey-cell="{ row }">
            <span
              class="truncate text-color-400"
              :title="row.original.accessKey"
              >{{ row.original.accessKey }}</span
            >
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
                @click="openEdit(row.original)"
              />
              <UButton
                color="error"
                variant="ghost"
                square
                size="sm"
                icon="i-lucide-trash-2"
                title="删除"
                aria-label="删除"
                @click="deleteConfig(row.original.id)"
              />
            </div>
          </template>
          <template #empty>
            <p class="text-center text-color-500 py-12">暂无存储配置</p>
          </template>
        </UTable>
      </UCard>
    </main>

    <UModal
      :open="showModal"
      :title="isEdit ? '编辑存储配置' : '添加存储配置'"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) closeModal();
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
            <label class="block text-color-400 text-sm mb-2" for="cfg-name"
              >配置名称 *</label
            >
            <UInput
              id="cfg-name"
              v-model="form.name"
              type="text"
              placeholder="请输入配置名称"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-bucket"
              >存储桶 *</label
            >
            <UInput
              id="cfg-bucket"
              v-model="form.bucket"
              type="text"
              placeholder="请输入存储桶名称"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-baseurl"
              >BaseURL</label
            >
            <UInput
              id="cfg-baseurl"
              v-model="form.baseUrl"
              type="text"
              placeholder="如 https://cdn.example.com"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-prefix"
              >前缀</label
            >
            <UInput
              id="cfg-prefix"
              v-model="form.prefix"
              type="text"
              placeholder="对象 key 前缀"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-endpoint"
              >端点</label
            >
            <UInput
              id="cfg-endpoint"
              v-model="form.endpoint"
              type="text"
              placeholder="S3 端点地址"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-region"
              >可用区</label
            >
            <UInput
              id="cfg-region"
              v-model="form.region"
              type="text"
              placeholder="如 us-east-1"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-access"
              >AccessKey *</label
            >
            <UInput
              id="cfg-access"
              v-model="form.accessKey"
              type="text"
              placeholder="请输入 AccessKey"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-color-400 text-sm mb-2" for="cfg-secret"
              >SecretKey *</label
            >
            <UInput
              id="cfg-secret"
              v-model="form.secretKey"
              :type="showSecret ? 'text' : 'password'"
              :placeholder="isEdit ? '•••••••• 表示不修改' : '请输入 SecretKey'"
              class="w-full"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="ghost"
                  square
                  size="sm"
                  :icon="showSecret ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showSecret ? '隐藏' : '显示'"
                  @click="showSecret = !showSecret"
                />
              </template>
            </UInput>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-4">
          <UButton block color="neutral" variant="soft" @click="closeModal">
            取消
          </UButton>
          <UButton
            block
            color="primary"
            :loading="saving"
            :disabled="saving"
            @click="saveConfig"
          >
            {{ saving ? "保存中..." : "保存" }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
