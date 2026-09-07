<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { get, post, put, del } from "~/utils/request";
import { Loader2, KeyRound, UserCog } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import DirPickerModal from "~/components/admin/DirPickerModal.vue";
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
    toast.add({
      title: "获取账号信息失败",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
  }
};

const closeForm = () => {
  formShow.value = false;
};

const saveForm = async () => {
  const f = formData.value;

  // 校验
  if ((f.type === "quark" || f.type === "uc") && !f.cookie) {
    toast.add({
      title: "请填写 Cookie",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
    return;
  }
  if (f.type === "baidu" && !f.cookie) {
    toast.add({
      title: "请填写 Cookie",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
    return;
  }
  if (f.type === "xunlei" && !f.refreshToken) {
    toast.add({
      title: "请填写 Refresh Token",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
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
      toast.add({
        title: "账号已更新",
        icon: "i-lucide-check",
        color: "success",
        duration: 2000,
      });
    } else {
      await post("/api/admin/accounts", payload);
      toast.add({
        title: "账号已添加",
        icon: "i-lucide-check",
        color: "success",
        duration: 2000,
      });
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
    toast.add({
      title: "账号已删除",
      icon: "i-lucide-check",
      color: "success",
      duration: 2000,
    });
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
    toast.add({
      title: newStatus === 1 ? "账号已启用" : "账号已停用",
      icon: "i-lucide-check",
      color: "success",
      duration: 2000,
    });
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
      toast.add({
        title: `${label}账号 #${account.id} 有效`,
        icon: "i-lucide-check",
        color: "success",
        duration: 2000,
      });
    } else {
      toast.add({
        title: `${label}账号 #${account.id} 无效：${data.message || "未知错误"}`,
        icon: "i-lucide-x",
        color: "error",
        duration: 2000,
      });
    }
  } catch {
    toast.add({
      title: "检测失败，请重试",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
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
        toast.add({
          title: "请先填写 Cookie",
          icon: "i-lucide-x",
          color: "error",
          duration: 2000,
        });
        return;
      }
    } else if (t === "xunlei") {
      if (!formData.value.refreshToken) {
        toast.add({
          title: "请先填写 Refresh Token",
          icon: "i-lucide-x",
          color: "error",
          duration: 2000,
        });
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
    toast.add({
      title: "获取授权链接失败",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
  } finally {
    gettingOauthUrl.value = false;
  }
};

const getBaiduOauthToken = async () => {
  if (!baiduOauthCode.value.trim()) {
    toast.add({
      title: "请先填写授权码",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
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
      toast.add({
        title: "获取 Token 成功",
        icon: "i-lucide-check",
        color: "success",
        duration: 2000,
      });
      baiduOauthUrl.value = "";
      baiduOauthCodeVerifier.value = "";
      baiduOauthCode.value = "";
    } else {
      toast.add({
        title: "获取 Token 失败",
        icon: "i-lucide-x",
        color: "error",
        duration: 2000,
      });
    }
  } catch {
    toast.add({
      title: "获取 Token 失败",
      icon: "i-lucide-x",
      color: "error",
      duration: 2000,
    });
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
        <UButton color="primary" icon="i-lucide-plus" @click="openAddForm">
          添加账号
        </UButton>
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
            <UCard
              v-for="account in groupedAccounts[type]"
              :key="account.id"
              :ui="{
                root: account.status === 0 ? 'opacity-50' : '',
                body: 'p-4',
              }"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2 min-w-0">
                  <UBadge
                    :color="account.status === 1 ? 'success' : 'neutral'"
                    class="shrink-0 font-mono"
                  >
                    #{{ account.id }}
                  </UBadge>
                  <span
                    v-if="account.name"
                    class="text-sm truncate"
                    :title="account.name"
                  >
                    {{ account.name }}
                  </span>
                  <UBadge
                    :color="account.status === 1 ? 'success' : 'neutral'"
                    variant="soft"
                    class="shrink-0"
                  >
                    {{ account.status === 1 ? "启用" : "停用" }}
                  </UBadge>
                </div>
                <div class="flex items-center gap-1">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    square
                    size="sm"
                    icon="i-lucide-check"
                    :loading="checking[account.id]"
                    :disabled="checking[account.id]"
                    title="检测账号"
                    aria-label="检测账号"
                    @click="checkAccount(account)"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    square
                    size="sm"
                    icon="i-lucide-pencil"
                    title="编辑"
                    aria-label="编辑"
                    @click="openEditForm(account)"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    square
                    size="sm"
                    :icon="
                      account.status === 1
                        ? 'i-lucide-power'
                        : 'i-lucide-power-off'
                    "
                    :title="account.status === 1 ? '停用' : '启用'"
                    :aria-label="account.status === 1 ? '停用' : '启用'"
                    @click="toggleStatus(account)"
                  />
                  <UButton
                    color="error"
                    variant="ghost"
                    square
                    size="sm"
                    icon="i-lucide-trash-2"
                    title="删除"
                    aria-label="删除"
                    @click="deleteAccount(account)"
                  />
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
            </UCard>
          </div>
        </div>
      </div>
    </main>

    <!-- 添加/编辑弹窗 -->
    <UModal
      :open="formShow"
      :title="formIsEdit ? '编辑账号' : '添加账号'"
      :dismissible="false"
      @update:open="
        (v) => {
          if (!v) closeForm();
        }
      "
      :ui="{
        footer: 'justify-end',
      }"
    >
      <template #body>
        <div class="space-y-4">
          <!-- 网盘类型 -->
          <div>
            <label class="block text-color-400 text-sm mb-2" for="form-type"
              >网盘类型</label
            >
            <USelect
              id="form-type"
              v-model="formData.type"
              value-key="value"
              :items="[
                { label: '夸克网盘', value: 'quark' },
                { label: '百度网盘', value: 'baidu' },
                { label: 'UC 网盘', value: 'uc' },
                { label: '迅雷云盘', value: 'xunlei' },
              ]"
              :disabled="formIsEdit"
              class="w-full"
            />
          </div>

          <!-- Cookie -->
          <div v-if="formData.type !== 'xunlei'">
            <label class="block text-color-400 text-sm mb-2" for="form-cookie"
              >Cookie</label
            >
            <UTextarea
              id="form-cookie"
              v-model="formData.cookie"
              :rows="3"
              placeholder="粘贴 Cookie"
              class="font-mono text-xs w-full"
            />
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
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-link-2"
                :loading="gettingOauthUrl"
                :disabled="gettingOauthUrl"
                @click="getBaiduOauthUrl"
              >
                {{ gettingOauthUrl ? "获取中..." : "获取授权链接" }}
              </UButton>
            </div>
            <div v-if="baiduOauthUrl" class="flex items-center gap-2">
              <UInput
                v-model="baiduOauthCode"
                type="text"
                placeholder="粘贴授权码 (code)"
                class="flex-1"
              />
              <UButton
                color="success"
                icon="i-lucide-check"
                :loading="gettingOauthToken"
                :disabled="gettingOauthToken || !baiduOauthCode.trim()"
                @click="getBaiduOauthToken"
              >
                {{ gettingOauthToken ? "获取中..." : "获取 Token" }}
              </UButton>
            </div>
          </div>

          <!-- Refresh Token -->
          <div v-if="formData.type === 'baidu' || formData.type === 'xunlei'">
            <label class="block text-color-400 text-sm mb-2" for="form-refresh"
              >Refresh Token</label
            >
            <UTextarea
              id="form-refresh"
              v-model="formData.refreshToken"
              :rows="2"
              placeholder="粘贴 Refresh Token"
              class="font-mono text-xs w-full"
            />
          </div>

          <!-- 临时目录 -->
          <div>
            <label class="block text-color-400 text-sm mb-2" for="form-tempdir"
              >临时资源目录</label
            >
            <div class="flex gap-2">
              <UInput
                id="form-tempdir"
                v-model="formData.tempDir"
                type="text"
                placeholder="输入目录 ID 或路径"
                class="flex-1"
              />
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-folder-open"
                title="从网盘选择目录"
                @click="openDirPicker"
              >
                选择
              </UButton>
            </div>
          </div>

          <!-- 状态 -->
          <div>
            <label class="block text-color-400 text-sm mb-2" for="form-status"
              >状态</label
            >
            <USelect
              id="form-status"
              v-model="formData.status"
              value-key="value"
              :items="[
                { label: '启用', value: 1 },
                { label: '停用', value: 0 },
              ]"
              class="w-full"
            />
          </div>
        </div>
      </template>

      <!-- 底部操作 -->
      <template #footer>
        <div class="flex items-center justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="closeForm">
            取消
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-save"
            :loading="formSaving"
            :disabled="formSaving"
            @click="saveForm"
          >
            {{ formSaving ? "保存中..." : "保存" }}
          </UButton>
        </div>
      </template>
    </UModal>

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
