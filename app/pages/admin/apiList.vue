<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Plus, Trash2, Edit3, Webhook, Globe, Search, X } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminPagination from "~/components/admin/AdminPagination.vue";

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

const router = useRouter();
const route = useRoute();
const { isLoggedIn, logout, checkLogin, initialized, getAuthHeaders } =
  useAuth();

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

const parseFixedParams = () => {
  try {
    return JSON.parse(form.value.fixed_params || "{}") as Record<string, string>;
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
  const res = await fetch(url, { headers: { ...getAuthHeaders() } });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
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

  const url = isEdit.value
    ? `/api/admin/apiList/${editId.value}`
    : "/api/admin/apiList";
  const method = isEdit.value ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(form.value),
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  if (res.ok) {
    showModal.value = false;
    await loadApis();
  } else {
    const data = await res.json();
    error.value = data.message || "保存失败";
  }
};

const deleteApi = async (id: string) => {
  if (!confirm("确定删除该接口配置？")) return;
  const res = await fetch(`/api/admin/apiList/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  await loadApis();
};

const goPage = async (page: number) => {
  currentPage.value = page;
  const query: any = {};
  if (page > 1) query.page = page;
  if (keyword.value) query.q = keyword.value;
  await router.replace({ query });
  await loadApis();
};

const search = async () => {
  currentPage.value = 1;
  await goPage(1);
};

const typeLabel = (type: string) => {
  if (type === "api") return "API接口";
  if (type === "pansou") return "PanSou";
  return "网页爬虫";
};
const statusLabel = (status: number) => (status === 1 ? "启用" : "禁用");
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">接口配置</h2>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          @click="openAdd"
        >
          <Plus class="w-4 h-4" />
          添加线路
        </button>
      </div>

      <div class="card p-4 mb-4">
        <div class="flex gap-3">
          <input
            v-model="keyword"
            type="text"
            placeholder="搜索线路名称"
            class="input-search flex-1"
            @keyup.enter="search"
          />
          <button
            class="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            @click="search"
          >
            <Search class="w-4 h-4" />
            搜索
          </button>
        </div>
      </div>

      <div class="card overflow-hidden">
        <table class="table-auto w-full text-sm text-left">
          <thead class="bg-gray-800 text-gray-400">
            <tr>
              <th class="px-4 py-3 w-32">类型</th>
              <th class="px-4 py-3">线路名称</th>
              <th class="px-4 py-3">地址</th>
              <th class="px-4 py-3 w-20">数量</th>
              <th class="px-4 py-3 w-20">权重</th>
              <th class="px-4 py-3 w-20">状态</th>
              <th class="px-4 py-3 w-32">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr
              v-for="item in apis"
              :key="item.id"
              class="hover:bg-gray-800/50"
            >
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                  :class="
                    item.type === 'api'
                      ? 'bg-blue-500/20 text-blue-400'
                      : item.type === 'pansou'
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'bg-green-500/20 text-green-400'
                  "
                >
                  <component
                    :is="item.type === 'html' ? Globe : Webhook"
                    class="w-3 h-3"
                  />
                  {{ typeLabel(item.type) }}
                </span>
              </td>
              <td class="px-4 py-3 text-white">{{ item.name }}</td>
              <td
                class="px-4 py-3 text-gray-400 truncate max-w-xs"
                :title="item.url"
              >
                {{ item.url }}
              </td>
              <td class="px-4 py-3 text-gray-400">{{ item.count }}</td>
              <td class="px-4 py-3 text-gray-400">{{ item.weight }}</td>
              <td class="px-4 py-3">
                <span
                  class="px-2 py-1 rounded text-xs"
                  :class="
                    item.status === 1
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  "
                >
                  {{ statusLabel(item.status) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <button
                    class="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                    title="编辑"
                    @click="openEdit(item)"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                    title="删除"
                    @click="deleteApi(item.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="apis.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                暂无接口配置
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AdminPagination
        v-if="totalPages > 1"
        :current-page="currentPage"
        :total-pages="totalPages"
        :total="total"
        @change="goPage"
      />
    </main>

    <!-- Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      >
        <div
          class="bg-dark-300 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700"
        >
          <div
            class="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-dark-300"
          >
            <h3 class="text-white font-medium">
              {{ isEdit ? "编辑线路" : "添加线路" }}
            </h3>
            <button class="text-gray-400 hover:text-white" @click="closeModal">
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="p-4 space-y-4">
            <div
              v-if="error"
              class="p-3 bg-red-500/20 text-red-400 rounded-lg text-sm"
            >
              {{ error }}
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-gray-400 text-sm mb-1">线路名称</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="input-search w-full"
                  placeholder="线路名称"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-1">类型</label>
                <select v-model="form.type" class="input-search w-full">
                  <option value="api">API接口</option>
                  <option value="pansou">PanSou</option>
                  <option value="html">网页爬虫</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-gray-400 text-sm mb-1">{{
                form.type === "html" ? "目标网址" : "接口地址"
              }}</label>
              <input
                v-model="form.url"
                type="text"
                class="input-search w-full"
                placeholder="支持 {keyword} 占位符"
              />
            </div>

            <template v-if="form.type === 'api' || form.type === 'pansou'">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >请求方式</label
                  >
                  <select v-model="form.method" class="input-search w-full">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >总数限制</label
                  >
                  <input
                    v-model.number="form.count"
                    type="number"
                    min="1"
                    class="input-search w-full"
                  />
                </div>
              </div>

              <template v-if="form.type === 'pansou'">
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >认证令牌（可选）</label
                  >
                  <input
                    v-model="panSouToken"
                    type="text"
                    class="input-search w-full font-mono text-xs"
                    placeholder="启用认证时填写，自动附加 Bearer"
                  />
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >图片加速域名（可选）</label
                  >
                  <input
                    v-model="panSouImageProxy"
                    type="text"
                    class="input-search w-full font-mono text-xs"
                    placeholder="留空则直接使用原图，如 https://proxyd.picpi.top/"
                  />
                </div>
              </template>

              <template v-if="form.type === 'api'">
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >请求头 (JSON)</label
                  >
                  <textarea
                    v-model="form.headers"
                    rows="3"
                    class="input-search w-full font-mono text-xs resize-none"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >接口参数 (JSON)</label
                  >
                  <textarea
                    v-model="form.fixed_params"
                    rows="4"
                    class="input-search w-full font-mono text-xs resize-none"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >字段映射 (JSON)</label
                  >
                  <textarea
                    v-model="form.field_map"
                    rows="5"
                    class="input-search w-full font-mono text-xs resize-none"
                  ></textarea>
                </div>
              </template>
            </template>

            <template v-else>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >内容标签</label
                  >
                  <input
                    v-model="form.html_item"
                    type="text"
                    class="input-search w-full"
                    placeholder="如：div+merged-card"
                  />
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >标题标签</label
                  >
                  <input
                    v-model="form.html_title"
                    type="text"
                    class="input-search w-full"
                    placeholder="如：div+result-title"
                  />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >是否需要详情页</label
                  >
                  <select
                    v-model.number="form.html_url"
                    class="input-search w-full"
                  >
                    <option :value="0">不需要</option>
                    <option :value="1">需要</option>
                  </select>
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-1"
                    >总数限制</label
                  >
                  <input
                    v-model.number="form.count"
                    type="number"
                    min="1"
                    class="input-search w-full"
                  />
                </div>
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-1"
                  >详情页标签</label
                >
                <input
                  v-model="form.html_type"
                  type="text"
                  class="input-search w-full"
                  placeholder="如：a+post_url"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-1"
                  >网盘链接标签</label
                >
                <input
                  v-model="form.html_url2"
                  type="text"
                  class="input-search w-full"
                  placeholder="如：div+link-url"
                />
              </div>
            </template>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-gray-400 text-sm mb-1">权重</label>
                <input
                  v-model.number="form.weight"
                  type="number"
                  class="input-search w-full"
                />
              </div>
              <div>
                <label class="block text-gray-400 text-sm mb-1">状态</label>
                <select
                  v-model.number="form.status"
                  class="input-search w-full"
                >
                  <option :value="1">启用</option>
                  <option :value="0">禁用</option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 p-4 border-t border-gray-800">
            <button
              class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              @click="closeModal"
            >
              取消
            </button>
            <button
              class="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
              @click="saveApi"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
