<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import {
  Plus,
  Save,
  Pencil,
  Trash2,
  Check,
  Loader2,
  Link2,
  KeyRound,
  FolderOpen,
  Power,
  UserCog,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import AdminModal from "~/components/admin/Modal.vue";
import DirPickerModal from "~/components/admin/DirPickerModal.vue";
import { useToast } from "~/composables/useToast";
import { getPanTypeLabel } from "~/utils/pan";

interface AccountListItem {
  id: number;
  type: string;
  name: string;
  tempDir: string;
  status: number;
  hasCookie: boolean;
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface AccountFormData {
  id?: number;
  type: "quark" | "baidu" | "uc" | "xunlei";
  cookie: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  tempDir: string;
  status: number;
}

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();
const toast = useToast();

const accounts = ref<AccountListItem[]>([]);
const loading = ref(false);

// 添加/编辑弹窗
const formShow = ref(false);
const formSaving = ref(false);
const formData = ref<AccountFormData>(getEmptyForm());
const formIsEdit = computed(() => formData.value.id !== undefined);

// 目录选择弹窗
const dirPickerShow = ref(false);

// 账号检测状态
const checking = ref<Record<number, boolean>>({});

// 百度 OAuth2
const baiduOauthUrl = ref("");
const baiduOauthCodeVerifier = ref("");
const baiduOauthCode = ref("");
const gettingOauthUrl = ref(false);
const gettingOauthToken = ref(false);

function getEmptyForm(): AccountFormData {
  return {
    type: "quark",
    cookie: "",
    refreshToken: "",
    accessToken: "",
    expiresAt: "",
    tempDir: "",
    status: 1,
  };
}

const loadAccounts = async () => {
  loading.value = true;
  try {
    const data = await get("/api/admin/accounts");
    accounts.value = data.data || [];
  } catch {
    // 401 已由拦截器处理
  } finally {
    loading.value = false;
  }
};

const openAddForm = () => {
  formData.value = getEmptyForm();
  baiduOauthUrl.value = "";
  baiduOauthCodeVerifier.value = "";
  baiduOauthCode.value = "";
  formShow.value = true;
};

const openEditForm = async (account: AccountListItem) => {
  try {
    const data = await get(`/api/admin/accounts/${account.id}`);
    const a = data.data;
    formData.value = {
      id: a.id,
      type: a.type,
      cookie: a.cookie || "",
      refreshToken: a.refreshToken || "",
      accessToken: a.accessToken || "",
      expiresAt: a.expiresAt || "",
      tempDir: a.tempDir || "",
      status: a.status,
    };
    baiduOauthUrl.value = "";
    baiduOauthCodeVerifier.value = "";
    baiduOauthCode.value = "";
    formShow.value = true;
  } catch {
    toast.error("获取账号信息失败");
  }
};

const closeForm = () => {
  formShow.value = false;
};

const saveForm = async () => {
  const f = formData.value;

  // 校验
  if ((f.type === "quark" || f.type === "uc") && !f.cookie) {
    toast.error("请填写 Cookie");
    return;
  }
  if (f.type === "baidu" && !f.cookie) {
    toast.error("请填写 Cookie");
    return;
  }
  if (f.type === "xunlei" && !f.refreshToken) {
    toast.error("请填写 Refresh Token");
    return;
  }

  formSaving.value = true;
  try {
    const payload: Record<string, any> = {
      type: f.type,
      cookie: f.cookie,
      refreshToken: f.refreshToken,
      accessToken: f.accessToken,
      expiresAt: f.expiresAt || null,
      tempDir: f.tempDir,
      status: f.status,
    };

    if (f.id) {
      await put(`/api/admin/accounts/${f.id}`, payload);
      toast.success("账号已更新");
    } else {
      await post("/api/admin/accounts", payload);
      toast.success("账号已添加");
    }
    formShow.value = false;
    await loadAccounts();
  } catch {
    // 401 已由拦截器处理
  } finally {
    formSaving.value = false;
  }
};

const deleteAccount = async (account: AccountListItem) => {
  if (
    !confirm(`确定删除 ${getPanTypeLabel(account.type)} 账号 #${account.id}？`)
  )
    return;
  try {
    await del(`/api/admin/accounts/${account.id}`);
    toast.success("账号已删除");
    await loadAccounts();
  } catch {
    // 401 已由拦截器处理
  }
};

const toggleStatus = async (account: AccountListItem) => {
  const newStatus = account.status === 1 ? 0 : 1;
  try {
    await put(`/api/admin/accounts/${account.id}`, { status: newStatus });
    account.status = newStatus;
    toast.success(newStatus === 1 ? "账号已启用" : "账号已停用");
  } catch {
    // 401 已由拦截器处理
  }
};

const checkAccount = async (account: AccountListItem) => {
  checking.value[account.id] = true;
  try {
    const data = await get(`/api/admin/check-account?accountId=${account.id}`);
    const label = getPanTypeLabel(account.type);
    if (data.success) {
      toast.success(`${label}账号 #${account.id} 有效`);
    } else {
      toast.error(
        `${label}账号 #${account.id} 无效：${data.message || "未知错误"}`,
      );
    }
  } catch {
    toast.error("检测失败，请重试");
  } finally {
    checking.value[account.id] = false;
  }
};

const openDirPicker = () => {
  // 添加模式：校验临时凭证是否填写
  if (!formData.value.id) {
    const t = formData.value.type;
    if (t === "quark" || t === "uc" || t === "baidu") {
      if (!formData.value.cookie) {
        toast.error("请先填写 Cookie");
        return;
      }
    } else if (t === "xunlei") {
      if (!formData.value.refreshToken) {
        toast.error("请先填写 Refresh Token");
        return;
      }
    }
  }
  dirPickerShow.value = true;
};

const handleDirSelect = (id: string) => {
  formData.value.tempDir = id;
  dirPickerShow.value = false;
};

// 百度 OAuth2
const getBaiduOauthUrl = async () => {
  gettingOauthUrl.value = true;
  try {
    const data = await post("/api/admin/baidu/oauth-authorize");
    baiduOauthUrl.value = data.url;
    baiduOauthCodeVerifier.value = data.codeVerifier;
    baiduOauthCode.value = "";
    window.open(data.url, "_blank");
  } catch {
    toast.error("获取授权链接失败");
  } finally {
    gettingOauthUrl.value = false;
  }
};

const getBaiduOauthToken = async () => {
  if (!baiduOauthCode.value.trim()) {
    toast.error("请先填写授权码");
    return;
  }
  gettingOauthToken.value = true;
  try {
    const data = await post("/api/admin/baidu/oauth-token", {
      code: baiduOauthCode.value.trim(),
      codeVerifier: baiduOauthCodeVerifier.value,
    });
    if (data.accessToken) {
      formData.value.accessToken = data.accessToken;
      formData.value.refreshToken = data.refreshToken || "";
      toast.success("获取 Token 成功");
      baiduOauthUrl.value = "";
      baiduOauthCodeVerifier.value = "";
      baiduOauthCode.value = "";
    } else {
      toast.error(data.message || "获取 Token 失败");
    }
  } catch {
    toast.error("获取 Token 失败");
  } finally {
    gettingOauthToken.value = false;
  }
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
  await loadAccounts();
});

// 按类型分组
const groupedAccounts = computed(() => {
  const groups: Record<string, AccountListItem[]> = {};
  for (const a of accounts.value) {
    (groups[a.type] ??= []).push(a);
  }
  return groups;
});

const TYPE_ORDER = ["quark", "baidu", "uc", "xunlei"];
</script>

<template>
  <div class="min-h-screen">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-7xl mx-auto px-2 py-6 sm:px-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium">账号管理</h2>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors text-white"
          @click="openAddForm"
        >
          <Plus class="w-4 h-4" />
          添加账号
        </button>
      </div>

      <!-- 加载中 -->
      <div
        v-if="loading"
        class="flex items-center justify-center py-20 text-color-500"
      >
        <Loader2 class="w-6 h-6 animate-spin mr-2" />
        加载中...
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="accounts.length === 0"
        class="flex flex-col items-center justify-center py-20 text-color-500"
      >
        <UserCog class="w-12 h-12 mb-3 text-zinc-700" />
        <p class="text-sm">暂无网盘账号，点击「添加账号」开始配置</p>
      </div>

      <!-- 账号列表（按类型分组） -->
      <div v-else class="space-y-6">
        <div
          v-for="type in TYPE_ORDER"
          :key="type"
          v-show="groupedAccounts[type]"
        >
          <h3 class="text-sm text-color-400 mb-3 px-1">
            {{ getPanTypeLabel(type) }}
            <span class="text-zinc-600"
              >({{ groupedAccounts[type]?.length || 0 }})</span
            >
          </h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="account in groupedAccounts[type]"
              :key="account.id"
              class="card p-4"
              :class="{ 'opacity-50': account.status === 0 }"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2 min-w-0">
                  <span
                    class="inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-lg text-xs font-mono"
                    :class="
                      account.status === 1
                        ? 'bg-green-500 text-white'
                        : 'bg-color-300 text-color-500'
                    "
                  >
                    #{{ account.id }}
                  </span>
                  <span
                    v-if="account.name"
                    class="text-sm truncate"
                    :title="account.name"
                  >
                    {{ account.name }}
                  </span>
                  <span
                    class="text-xs px-2 py-0.5 shrink-0 rounded-full"
                    :class="
                      account.status === 1
                        ? 'bg-green-500 text-white'
                        : 'bg-color-300 text-color-500'
                    "
                  >
                    {{ account.status === 1 ? "启用" : "停用" }}
                  </span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="p-1.5 hover:bg-color-300 rounded-lg text-color-400 transition-colors"
                    :disabled="checking[account.id]"
                    title="检测账号"
                    @click="checkAccount(account)"
                  >
                    <Loader2
                      v-if="checking[account.id]"
                      class="w-4 h-4 animate-spin"
                    />
                    <Check v-else class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 hover:bg-color-300 rounded-lg text-color-400 transition-colors"
                    title="编辑"
                    @click="openEditForm(account)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 hover:bg-color-300 rounded-lg text-color-400 transition-colors"
                    :title="account.status === 1 ? '停用' : '启用'"
                    @click="toggleStatus(account)"
                  >
                    <Power class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 hover:bg-red-500 rounded-lg text-color-400 hover:text-white transition-colors"
                    title="删除"
                    @click="deleteAccount(account)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div class="space-y-1.5 text-xs">
                <div
                  v-if="type !== 'xunlei'"
                  class="flex items-center gap-2 text-color-500"
                >
                  <span class="w-16 shrink-0">Cookie</span>
                  <span
                    :class="
                      account.hasCookie ? 'text-green-400' : 'text-red-400'
                    "
                  >
                    {{ account.hasCookie ? "已配置" : "未配置" }}
                  </span>
                </div>
                <div
                  v-if="type === 'baidu' || type === 'xunlei'"
                  class="flex items-center gap-2 text-color-500"
                >
                  <span class="w-16 shrink-0">Token</span>
                  <span
                    :class="
                      account.hasRefreshToken
                        ? 'text-green-400'
                        : 'text-red-400'
                    "
                  >
                    {{ account.hasRefreshToken ? "已配置" : "未配置" }}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-color-500">
                  <span class="w-16 shrink-0">临时目录</span>
                  <span
                    class="truncate text-color-400 font-mono"
                    :title="account.tempDir"
                  >
                    {{ account.tempDir || "未配置" }}
                  </span>
                </div>
                <div
                  v-if="account.expiresAt"
                  class="flex items-center gap-2 text-color-500"
                >
                  <span class="w-16 shrink-0">过期时间</span>
                  <span class="text-color-400">
                    {{ new Date(account.expiresAt).toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 添加/编辑弹窗 -->
    <AdminModal
      :show="formShow"
      :title="formIsEdit ? '编辑账号' : '添加账号'"
      max-width="max-w-lg"
      @close="closeForm"
    >
      <div class="space-y-4">
        <!-- 网盘类型 -->
        <div>
          <label class="block text-color-400 text-sm mb-2">网盘类型</label>
          <select
            v-model="formData.type"
            class="input-search w-full"
            :disabled="formIsEdit"
          >
            <option value="quark">夸克网盘</option>
            <option value="baidu">百度网盘</option>
            <option value="uc">UC 网盘</option>
            <option value="xunlei">迅雷云盘</option>
          </select>
        </div>

        <!-- Cookie -->
        <div v-if="formData.type !== 'xunlei'">
          <label class="block text-color-400 text-sm mb-2">Cookie</label>
          <textarea
            v-model="formData.cookie"
            rows="3"
            placeholder="粘贴 Cookie"
            class="input-search resize-none w-full font-mono text-xs"
          ></textarea>
        </div>

        <!-- 百度 OAuth2 -->
        <div
          v-if="formData.type === 'baidu'"
          class="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 space-y-3"
        >
          <div class="flex items-center gap-2 text-sm text-color-400">
            <KeyRound class="w-4 h-4" />
            <span>OAuth2 授权获取 Token</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-color-400 hover:bg-color-500 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="gettingOauthUrl"
              @click="getBaiduOauthUrl"
            >
              <Loader2
                v-if="gettingOauthUrl"
                class="w-4 h-4 animate-spin"
              />
              <Link2 v-else class="w-4 h-4" />
              {{ gettingOauthUrl ? "获取中..." : "获取授权链接" }}
            </button>
          </div>
          <div v-if="baiduOauthUrl" class="flex items-center gap-2">
            <input
              v-model="baiduOauthCode"
              type="text"
              placeholder="粘贴授权码 (code)"
              class="input-search flex-1"
            />
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              :disabled="gettingOauthToken || !baiduOauthCode.trim()"
              @click="getBaiduOauthToken"
            >
              <Loader2
                v-if="gettingOauthToken"
                class="w-4 h-4 animate-spin"
              />
              {{ gettingOauthToken ? "获取中..." : "获取 Token" }}
            </button>
          </div>
        </div>

        <!-- Refresh Token -->
        <div
          v-if="formData.type === 'baidu' || formData.type === 'xunlei'"
        >
          <label class="block text-color-400 text-sm mb-2"
            >Refresh Token</label
          >
          <textarea
            v-model="formData.refreshToken"
            rows="2"
            placeholder="粘贴 Refresh Token"
            class="input-search resize-none w-full font-mono text-xs"
          ></textarea>
        </div>

        <!-- 临时目录 -->
        <div>
          <label class="block text-color-400 text-sm mb-2">临时资源目录</label>
          <div class="flex gap-2">
            <input
              v-model="formData.tempDir"
              type="text"
              placeholder="输入目录 ID 或路径"
              class="input-search flex-1"
            />
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-sm bg-color-400 hover:bg-color-500 rounded-lg transition-colors whitespace-nowrap"
              title="从网盘选择目录"
              @click="openDirPicker"
            >
              <FolderOpen class="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        <!-- 状态 -->
        <div>
          <label class="block text-color-400 text-sm mb-2">状态</label>
          <select v-model="formData.status" class="input-search w-full">
            <option :value="1">启用</option>
            <option :value="0">停用</option>
          </select>
        </div>
      </div>

      <!-- 底部操作 -->
      <template #footer>
        <div
          class="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-color-300"
        >
          <button
            class="px-4 py-2 text-sm text-color-400 hover:bg-color-300 rounded-lg transition-colors"
            @click="closeForm"
          >
            取消
          </button>
          <button
            class="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="formSaving"
            @click="saveForm"
          >
            <Loader2 v-if="formSaving" class="w-4 h-4 animate-spin" />
            <Save v-else class="w-4 h-4" />
            {{ formSaving ? "保存中..." : "保存" }}
          </button>
        </div>
      </template>
    </AdminModal>

    <DirPickerModal
      :show="dirPickerShow"
      :type="formData.type"
      :account-id="formData.id"
      :cookie="formData.cookie"
      :refresh-token="formData.refreshToken"
      :access-token="formData.accessToken"
      @close="dirPickerShow = false"
      @select="handleDirSelect"
    />
  </div>
</template>
