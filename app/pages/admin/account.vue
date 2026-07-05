<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Save, UserCog, Check, Loader2 } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import { useToast } from "~/composables/useToast";

interface AccountConfig {
  quark_cookie: string;
  quark_temp_dir: string;
  baidu_cookie: string;
  baidu_temp_dir: string;
  uc_cookie: string;
  uc_temp_dir: string;
  xunlei_refresh_token: string;
  xunlei_temp_dir: string;
}

const router = useRouter();
const {
  isLoggedIn,
  logout,
  checkLogin,
  initialized,
  getAuthHeaders,
} = useAuth();
const toast = useToast();

const config = ref<AccountConfig>({
  quark_cookie: "",
  quark_temp_dir: "",
  baidu_cookie: "",
  baidu_temp_dir: "",
  uc_cookie: "",
  uc_temp_dir: "",
  xunlei_refresh_token: "",
  xunlei_temp_dir: "",
});

const saving = ref(false);
const saved = ref(false);

const TYPE_LABELS: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  uc: "UC 网盘",
  xunlei: "迅雷云盘",
};

const checking = ref<Record<string, boolean>>({
  quark: false,
  baidu: false,
  uc: false,
  xunlei: false,
});

const checkAccount = async (type: string) => {
  checking.value[type] = true;
  try {
    const res = await fetch(`/api/admin/check-account?type=${type}`, {
      headers: getAuthHeaders(),
    });

    if (res.status === 401) {
      logout();
      router.push("/admin/login");
      return;
    }

    const data = await res.json();
    const label = TYPE_LABELS[type];
    if (data.success) {
      toast.success(`${label}账号有效`);
    } else {
      toast.error(`${label}账号无效：${data.message || "未知错误"}`);
    }
  } catch (error) {
    toast.error("检测失败，请重试");
  } finally {
    checking.value[type] = false;
  }
};

const loadConfig = async () => {
  const res = await fetch("/api/admin/config/accounts", {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
  config.value = data.data;
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
  await loadConfig();
});

const saveConfig = async () => {
  saving.value = true;
  saved.value = false;

  const res = await fetch("/api/admin/config/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(config.value),
  });

  saving.value = false;
  if (res.ok) {
    saved.value = true;
    setTimeout(() => {
      saved.value = false;
    }, 2000);
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />
    <AdminNav />

    <main class="max-w-4xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">账号管理</h2>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          :class="{ 'bg-green-600 hover:bg-green-600': saved }"
          :disabled="saving"
          @click="saveConfig"
        >
          <Check v-if="saved" class="w-4 h-4" />
          <Save v-else class="w-4 h-4" />
          {{ saved ? "已保存" : "保存" }}
        </button>
      </div>

      <div class="space-y-6">
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center"
              >
                <UserCog class="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 class="text-white font-medium">夸克网盘</h3>
                <p class="text-gray-500 text-sm">配置夸克网盘 Cookie 和临时目录</p>
              </div>
            </div>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="checking.quark"
              @click="checkAccount('quark')"
            >
              <Loader2 v-if="checking.quark" class="w-4 h-4 animate-spin" />
              {{ checking.quark ? "检测中..." : "检测账号" }}
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-gray-400 text-sm mb-2">Cookie</label>
              <textarea
                v-model="config.quark_cookie"
                rows="3"
                placeholder="粘贴夸克网盘 Cookie"
                class="input-search resize-none font-mono text-xs"
              ></textarea>
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">临时资源目录</label>
              <input
                v-model="config.quark_temp_dir"
                type="text"
                placeholder="输入目录 Id"
                class="input-search"
              />
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center"
              >
                <UserCog class="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 class="text-white font-medium">百度网盘</h3>
                <p class="text-gray-500 text-sm">配置百度网盘 Cookie 和临时目录</p>
              </div>
            </div>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="checking.baidu"
              @click="checkAccount('baidu')"
            >
              <Loader2 v-if="checking.baidu" class="w-4 h-4 animate-spin" />
              {{ checking.baidu ? "检测中..." : "检测账号" }}
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-gray-400 text-sm mb-2">Cookie</label>
              <textarea
                v-model="config.baidu_cookie"
                rows="3"
                placeholder="粘贴百度网盘 Cookie"
                class="input-search resize-none font-mono text-xs"
              ></textarea>
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">临时资源目录</label>
              <input
                v-model="config.baidu_temp_dir"
                type="text"
                placeholder="输入目录"
                class="input-search"
              />
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center"
              >
                <UserCog class="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 class="text-white font-medium">UC 网盘</h3>
                <p class="text-gray-500 text-sm">配置 UC 网盘 Cookie 和临时目录</p>
              </div>
            </div>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="checking.uc"
              @click="checkAccount('uc')"
            >
              <Loader2 v-if="checking.uc" class="w-4 h-4 animate-spin" />
              {{ checking.uc ? "检测中..." : "检测账号" }}
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-gray-400 text-sm mb-2">Cookie</label>
              <textarea
                v-model="config.uc_cookie"
                rows="3"
                placeholder="粘贴 UC 网盘 Cookie"
                class="input-search resize-none font-mono text-xs"
              ></textarea>
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">临时资源目录</label>
              <input
                v-model="config.uc_temp_dir"
                type="text"
                placeholder="输入目录 Id"
                class="input-search"
              />
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center"
              >
                <UserCog class="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 class="text-white font-medium">迅雷云盘</h3>
                <p class="text-gray-500 text-sm">配置迅雷云盘 Refresh Token 和临时目录</p>
              </div>
            </div>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="checking.xunlei"
              @click="checkAccount('xunlei')"
            >
              <Loader2 v-if="checking.xunlei" class="w-4 h-4 animate-spin" />
              {{ checking.xunlei ? "检测中..." : "检测账号" }}
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-gray-400 text-sm mb-2">Refresh Token</label>
              <textarea
                v-model="config.xunlei_refresh_token"
                rows="3"
                placeholder="粘贴迅雷云盘 Refresh Token"
                class="input-search resize-none font-mono text-xs"
              ></textarea>
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">临时资源目录</label>
              <input
                v-model="config.xunlei_temp_dir"
                type="text"
                placeholder="输入目录 Id"
                class="input-search"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
