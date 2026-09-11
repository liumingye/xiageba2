<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import type { TableColumn } from "@nuxt/ui";

import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";
const toast = useToast();

interface ApiItem {
  id: string;
  name: string;
  type: "api" | "html" | "pansou";
  url: string;
  method: string;
  headers: string;
  fixed_params: string;
  field_map: string;
  count: number;
  html_item: string;
  html_title: string;
  html_url: number;
  html_type: string;
  html_url2: string;
  weight: number;
  status: number;
  createdAt: string;
  updatedAt: string;
}

const columns: TableColumn<ApiItem>[] = [
  { id: "type", accessorKey: "type", header: "类型" },
  { id: "name", accessorKey: "name", header: "线路名称" },
  { id: "url", accessorKey: "url", header: "地址" },
  { id: "count", accessorKey: "count", header: "数量" },
  { id: "weight", accessorKey: "weight", header: "权重" },
  { id: "status", accessorKey: "status", header: "状态" },
  {
    id: "actions",
    header: "操作",
    meta: {
      class: { th: "w-32", td: "" },
    },
  },
];

const router = useRouter();
const route = useRoute();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const apis = ref<ApiItem[]>([]);
const currentPage = ref(1);
const totalPages = ref(1);
const total = ref(0);
const keyword = ref("");

const showModal = ref(false);
const isEdit = ref(false);
const editId = ref("");
const form = ref({
  name: "",
  type: "api" as "api" | "html" | "pansou",
  url: "",
  method: "GET",
  headers: "{}",
  fixed_params: "{}",
  field_map: "{}",
  count: 10,
  html_item: "",
  html_title: "",
  html_url: 0,
  html_type: "",
  html_url2: "",
  weight: 0,
  status: 1,
});
const error = ref("");
const testing = ref(false);

const parseFixedParams = () => {
  try {
    return JSON.parse(form.value.fixed_params || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {} as Record<string, string>;
  }
};

const panSouToken = computed({
  get: () => parseFixedParams().token || "",
  set: (val: string) => {
    const params = parseFixedParams();
    if (val) params.token = val;
    else delete params.token;
    form.value.fixed_params = JSON.stringify(params);
  },
});

const panSouImageProxy = computed({
  get: () => parseFixedParams().image_proxy || "",
  set: (val: string) => {
    const params = parseFixedParams();
    if (val) params.image_proxy = val;
    else delete params.image_proxy;
    form.value.fixed_params = JSON.stringify(params);
  },
});

const loadApis = async () => {
  let url = `/api/admin/apiList?page=${currentPage.value}&pageSize=20`;
  if (keyword.value) {
    url += `&keyword=${encodeURIComponent(keyword.value)}`;
  }
  const data = await get(url);
  apis.value = data.data;
  totalPages.value = data.totalPages;
  total.value = data.total;
};

onMounted(async () => {
  if (!initialized.value) checkLogin();
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }
  currentPage.value = Math.max(1, parseInt(route.query.page as string) || 1);
  keyword.value = (route.query.q as string) || "";
  await loadApis();
});

const resetForm = () => {
  form.value = {
    name: "",
    type: "api",
    url: "",
    method: "GET",
    headers: "{}",
    fixed_params: "{}",
    field_map: "{}",
    count: 10,
    html_item: "",
    html_title: "",
    html_url: 0,
    html_type: "",
    html_url2: "",
    weight: 0,
    status: 1,
  };
};

const openAdd = () => {
  isEdit.value = false;
  editId.value = "";
  resetForm();
  showModal.value = true;
};

const openEdit = (item: ApiItem) => {
  isEdit.value = true;
  editId.value = item.id;
  form.value = {
    name: item.name,
    type: item.type as "api" | "html",
    url: item.url,
    method: item.method || "GET",
    headers: item.headers || "{}",
    fixed_params: item.fixed_params || "{}",
    field_map: item.field_map || "{}",
    count: item.count || 10,
    html_item: item.html_item || "",
    html_title: item.html_title || "",
    html_url: item.html_url || 0,
    html_type: item.html_type || "",
    html_url2: item.html_url2 || "",
    weight: item.weight || 0,
    status: item.status ?? 1,
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  error.value = "";
};

const validateForm = () => {
  if (!form.value.name.trim()) return "请输入线路名称";
  if (!form.value.url.trim()) return "请输入地址";
  if (form.value.count < 1) return "总数限制至少为1";
  try {
    JSON.parse(form.value.headers || "{}");
    JSON.parse(form.value.fixed_params || "{}");
    JSON.parse(form.value.field_map || "{}");
  } catch (e) {
    return "JSON 格式错误";
  }
  return "";
};

const saveApi = async () => {
  error.value = validateForm();
  if (error.value) return;

  try {
    if (isEdit.value) {
      await put(`/api/admin/apiList/${editId.value}`, form.value);
    } else {
      await post("/api/admin/apiList", form.value);
    }
    showModal.value = false;
    await loadApis();
  } catch (e: any) {
    const data = e?.response?.data;
    error.value = data?.message || "保存失败";
  }
};

const testApi = async () => {
  if (!form.value.url.trim()) {
    error.value = "请先填写地址";
    return;
  }
  testing.value = true;
  try {
    const data = await post("/api/admin/apiList/test", {
      config: form.value,
      keyword: "凡人",
    });
    if (data.success) {
      toast.add({
        title: `测试成功，搜索「凡人」找到 ${data.count} 条结果`,
        icon: "i-lucide-check",
        color: "success",
      });
    } else {
      toast.add({
        title: `测试失败，错误信息： ${data.message || "未知错误"}`,
        icon: "i-lucide-x",
        color: "error",
      });
    }
  } catch {
    toast.add({
      title: "测试失败，网络错误",
      icon: "i-lucide-x",
      color: "error",
    });
  } finally {
    testing.value = false;
  }
};

const deleteApi = async (id: string) => {
  if (!confirm("确定删除该接口配置？")) return;
  try {
    await del(`/api/admin/apiList/${id}`);
  } catch {
    // 401 已由拦截器处理
  }
  await loadApis();
};

const goToPage = async (page: number) => {
  currentPage.value = page;
  const query: any = {};
  if (page > 1) query.page = page;
  if (keyword.value) query.q = keyword.value;
  await router.replace({ query });
  await loadApis();
};

const search = async () => {
  currentPage.value = 1;
  await goToPage(1);
};

const typeLabel = (type: string) => {
  if (type === "api") return "API接口";
  if (type === "pansou") return "PanSou";
  return "网页爬虫";
};
const statusLabel = (status: number) => (status === 1 ? "启用" : "禁用");
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium">接口配置</h2>
        <UButton color="primary" icon="i-lucide-plus" @click="openAdd">
          添加线路
        </UButton>
      </div>

      <UCard
        class="mb-4"
        :ui="{
          body: 'p-4',
        }"
      >
        <div class="flex gap-3">
          <UInput
            v-model="keyword"
            type="text"
            placeholder="搜索线路名称"
            class="flex-1"
            @keyup.enter="search"
          />
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-search"
            @click="search"
          >
            搜索
          </UButton>
        </div>
      </UCard>

      <UCard
        :ui="{
          body: 'p-0 sm:p-0',
        }"
      >
        <UTable
          :data="apis"
          :columns="columns"
          :get-row-id="(row: ApiItem) => row.id"
        >
          <template #type-cell="{ row }">
            <UBadge
              :color="
                row.original.type === 'pansou'
                  ? 'secondary'
                  : row.original.type === 'html'
                    ? 'success'
                    : 'info'
              "
              variant="solid"
            >
              {{ typeLabel(row.original.type) }}
            </UBadge>
          </template>
          <template #name-cell="{ row }">
            <span class="text-white">{{ row.original.name }}</span>
          </template>
          <template #url-cell="{ row }">
            <span
              class="block max-w-xs truncate text-color-400"
              :title="row.original.url"
              >{{ row.original.url }}</span
            >
          </template>
          <template #count-cell="{ row }">
            <span class="text-color-400">{{ row.original.count }}</span>
          </template>
          <template #weight-cell="{ row }">
            <span class="text-color-400">{{ row.original.weight }}</span>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :color="row.original.status === 1 ? 'success' : 'error'"
              variant="subtle"
            >
              {{ statusLabel(row.original.status) }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex items-center gap-2">
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
                @click="deleteApi(row.original.id)"
              />
            </div>
          </template>
          <template #empty>
            <p class="text-center text-color-500 py-10">暂无接口配置</p>
          </template>
        </UTable>
      </UCard>

      <AdminPagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :total="total"
        @page-change="goToPage"
      />
    </main>

    <!-- Modal -->
    <UModal
      :open="showModal"
      :title="isEdit ? '编辑线路' : '添加线路'"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) closeModal();
        }
      "
      :ui="{
        footer: 'justify-between',
      }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="error" color="error" variant="soft" :title="error" />

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-color-400 text-sm mb-1" for="api-name"
                >线路名称</label
              >
              <UInput
                id="api-name"
                v-model="form.name"
                type="text"
                placeholder="线路名称"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-color-400 text-sm mb-1" for="api-type"
                >类型</label
              >
              <USelect
                id="api-type"
                v-model="form.type"
                value-key="value"
                :items="[
                  { label: 'API接口', value: 'api' },
                  { label: 'PanSou', value: 'pansou' },
                  { label: '网页爬虫', value: 'html' },
                ]"
                class="w-full"
              />
            </div>
          </div>

          <div>
            <label class="block text-color-400 text-sm mb-1" for="api-url">{{
              form.type === "html" ? "目标网址" : "接口地址"
            }}</label>
            <UInput
              id="api-url"
              v-model="form.url"
              type="text"
              placeholder="支持 {keyword} 占位符"
              class="w-full"
            />
          </div>

          <template v-if="form.type === 'api' || form.type === 'pansou'">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-method"
                  >请求方式</label
                >
                <USelect
                  id="api-method"
                  v-model="form.method"
                  value-key="value"
                  :items="[
                    { label: 'GET', value: 'GET' },
                    { label: 'POST', value: 'POST' },
                  ]"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-color-400 text-sm mb-1" for="api-count"
                  >总数限制</label
                >
                <UInput
                  id="api-count"
                  v-model.number="form.count"
                  type="number"
                  min="1"
                  class="w-full"
                />
              </div>
            </div>

            <template v-if="form.type === 'pansou'">
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="pansou-token"
                  >认证令牌（可选）</label
                >
                <UInput
                  id="pansou-token"
                  v-model="panSouToken"
                  type="text"
                  class="font-mono text-xs w-full"
                  placeholder="启用认证时填写，自动附加 Bearer"
                />
              </div>
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="pansou-proxy"
                  >图片加速域名（可选）</label
                >
                <UInput
                  id="pansou-proxy"
                  v-model="panSouImageProxy"
                  type="text"
                  class="font-mono text-xs w-full"
                  placeholder="留空则直接使用原图，如 https://proxyd.picpi.top/"
                />
              </div>
            </template>

            <template v-if="form.type === 'api'">
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-headers"
                  >请求头 (JSON)</label
                >
                <UTextarea
                  id="api-headers"
                  v-model="form.headers"
                  :rows="3"
                  class="font-mono text-xs w-full"
                />
              </div>
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-params"
                  >接口参数 (JSON)</label
                >
                <UTextarea
                  id="api-params"
                  v-model="form.fixed_params"
                  :rows="4"
                  class="font-mono text-xs w-full"
                />
              </div>
              <div>
                <label class="block text-color-400 text-sm mb-1" for="api-map"
                  >字段映射 (JSON)</label
                >
                <UTextarea
                  id="api-map"
                  v-model="form.field_map"
                  :rows="5"
                  class="font-mono text-xs w-full"
                />
              </div>
            </template>
          </template>

          <template v-else>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-html-item"
                  >内容标签</label
                >
                <UInput
                  id="api-html-item"
                  v-model="form.html_item"
                  type="text"
                  placeholder="如：div+merged-card"
                  class="w-full"
                />
              </div>
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-html-title"
                  >标题标签</label
                >
                <UInput
                  id="api-html-title"
                  v-model="form.html_title"
                  type="text"
                  placeholder="如：div+result-title"
                  class="w-full"
                />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-html-detail"
                  >是否需要详情页</label
                >
                <USelect
                  id="api-html-detail"
                  v-model.number="form.html_url"
                  value-key="value"
                  :items="[
                    { label: '不需要', value: 0 },
                    { label: '需要', value: 1 },
                  ]"
                  class="w-full"
                />
              </div>
              <div>
                <label
                  class="block text-color-400 text-sm mb-1"
                  for="api-html-count"
                  >总数限制</label
                >
                <UInput
                  id="api-html-count"
                  v-model.number="form.count"
                  type="number"
                  min="1"
                  class="w-full"
                />
              </div>
            </div>
            <div>
              <label
                class="block text-color-400 text-sm mb-1"
                for="api-html-type"
                >详情页标签</label
              >
              <UInput
                id="api-html-type"
                v-model="form.html_type"
                type="text"
                placeholder="如：a+post_url"
                class="w-full"
              />
            </div>
            <div>
              <label
                class="block text-color-400 text-sm mb-1"
                for="api-html-url2"
                >网盘链接标签</label
              >
              <UInput
                id="api-html-url2"
                v-model="form.html_url2"
                type="text"
                placeholder="如：div+link-url"
                class="w-full"
              />
            </div>
          </template>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-color-400 text-sm mb-1" for="api-weight"
                >权重</label
              >
              <UInput
                id="api-weight"
                v-model.number="form.weight"
                type="number"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-color-400 text-sm mb-1" for="api-status"
                >状态</label
              >
              <USelect
                id="api-status"
                v-model.number="form.status"
                value-key="value"
                :items="[
                  { label: '启用', value: 1 },
                  { label: '禁用', value: 0 },
                ]"
                class="w-full"
              />
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton
          color="warning"
          icon="i-lucide-zap"
          :loading="testing"
          :disabled="testing"
          @click="testApi"
        >
          {{ testing ? "测试中..." : "测试线路" }}
        </UButton>
        <div class="flex gap-3">
          <UButton color="neutral" variant="ghost" @click="closeModal">
            取消
          </UButton>
          <UButton color="primary" @click="saveApi">保存</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
