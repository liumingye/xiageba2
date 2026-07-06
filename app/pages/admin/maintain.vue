<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { RefreshCw, Eraser, Database, Save, Check, Key, Link, Plus, Trash } from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";

const router = useRouter();
const { isLoggedIn, logout, checkLogin, initialized, getAuthHeaders } =
  useAuth();

const isRebuilding = ref(false);
const rebuildMsg = ref("");
const isClearing = ref(false);
const clearMsg = ref("");

interface RedisConfig {
  redis_host: string;
  redis_port: string;
  redis_db: string;
  redis_password: string;
}

const redisConfig = ref<RedisConfig>({
  redis_host: "",
  redis_port: "6379",
  redis_db: "0",
  redis_password: "",
});
const savingRedis = ref(false);
const savedRedis = ref(false);

interface AesConfig {
  aes_key: string;
  aes_iv: string;
}

const aesConfig = ref<AesConfig>({
  aes_key: "",
  aes_iv: "",
});
const savingAes = ref(false);
const savedAes = ref(false);

interface PanCheckServer {
  url: string;
  password: string;
}

const pancheckServers = ref<PanCheckServer[]>([]);
const savingPancheck = ref(false);
const savedPancheck = ref(false);

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }
  await loadRedisConfig();
  await loadAesConfig();
  await loadPancheckConfig();
});

const loadRedisConfig = async () => {
  const res = await fetch("/api/admin/config/redis", {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
  redisConfig.value = { ...redisConfig.value, ...data.data };
};

const saveRedisConfig = async () => {
  savingRedis.value = true;
  savedRedis.value = false;

  const res = await fetch("/api/admin/config/redis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(redisConfig.value),
  });

  savingRedis.value = false;
  if (res.ok) {
    savedRedis.value = true;
    setTimeout(() => {
      savedRedis.value = false;
    }, 2000);
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const loadAesConfig = async () => {
  const res = await fetch("/api/admin/config/aes", {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
  aesConfig.value = { ...aesConfig.value, ...data.data };
};

const saveAesConfig = async () => {
  savingAes.value = true;
  savedAes.value = false;

  const res = await fetch("/api/admin/config/aes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(aesConfig.value),
  });

  savingAes.value = false;
  if (res.ok) {
    savedAes.value = true;
    setTimeout(() => {
      savedAes.value = false;
    }, 2000);
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const loadPancheckConfig = async () => {
  const res = await fetch("/api/admin/config/pancheck", {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    logout();
    router.push("/admin/login");
    return;
  }
  const data = await res.json();
  pancheckServers.value = data.data?.servers || [];
};

const savePancheckConfig = async () => {
  savingPancheck.value = true;
  savedPancheck.value = false;

  const res = await fetch("/api/admin/config/pancheck", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ servers: pancheckServers.value }),
  });

  savingPancheck.value = false;
  if (res.ok) {
    savedPancheck.value = true;
    setTimeout(() => {
      savedPancheck.value = false;
    }, 2000);
  } else if (res.status === 401) {
    logout();
    router.push("/admin/login");
  }
};

const addPancheckServer = () => {
  pancheckServers.value.push({ url: "", password: "" });
};

const removePancheckServer = (index: number) => {
  pancheckServers.value.splice(index, 1);
};

const rebuildSearch = async (all: boolean, type: "music" | "source") => {
  if (isRebuilding.value) return;
  const name = type === "music" ? "音乐" : "资源";
  if (
    !confirm(
      `确定要重建${all ? "所有" : "没有索引的"}${name}的搜索向量吗？\n这将使用 jieba 分词重新生成搜索向量。`,
    )
  )
    return;

  isRebuilding.value = true;
  rebuildMsg.value = "";
  try {
    const res = await fetch(`/api/admin/${type}/rebuild-search`, {
      method: "POST",
      body: JSON.stringify({ all }),
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
    });
    const data = await res.json();
    if (data.message) {
      rebuildMsg.value = data.message || "重建失败";
    } else {
      rebuildMsg.value = `已处理 ${data.total} 项，成功 ${data.updated} 项，失败 ${data.errors} 项`;
    }
  } catch {
    rebuildMsg.value = "请求失败";
  } finally {
    isRebuilding.value = false;
  }
};

const clearISRCache = async (route?: string) => {
  if (isClearing.value) return;
  const label = !route ? "全部 ISR 缓存" : route === "/" ? "主页" : route;
  if (!confirm(`确定要清理 ${label} 吗？`)) return;

  isClearing.value = true;
  clearMsg.value = "";
  try {
    const res = await fetch("/api/admin/cache/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ route }),
    });
    const data = await res.json();
    if (res.ok) {
      clearMsg.value = `已清理 ${label}，共 ${data.total} 项`;
    } else {
      clearMsg.value = data.message || "清理失败";
    }
  } catch {
    clearMsg.value = "请求失败";
  } finally {
    isClearing.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-dark-300">
    <AdminHeader />

    <AdminNav />

    <main class="max-w-7xl mx-auto px-6 py-6">
      <!-- 搜索索引 -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white">搜索索引</h2>
        </div>
        <div class="card p-6 space-y-4">
          <div v-if="rebuildMsg" class="text-sm text-primary-400">
            {{ rebuildMsg }}
          </div>
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="text-white">重建音乐搜索向量</div>
              <div class="text-sm text-gray-400 mt-1">
                使用 jieba 分词重新生成所有音乐的搜索向量，用于全文搜索
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                :disabled="isRebuilding"
                @click="rebuildSearch(false, 'music')"
              >
                <RefreshCw
                  class="w-4 h-4"
                  :class="{ 'animate-spin': isRebuilding }"
                />
                {{ isRebuilding ? "重建中..." : "重建未重建索引" }}
              </button>
              <button
                class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                :disabled="isRebuilding"
                @click="rebuildSearch(true, 'music')"
              >
                <RefreshCw
                  class="w-4 h-4"
                  :class="{ 'animate-spin': isRebuilding }"
                />
                {{ isRebuilding ? "重建中..." : "重建所有索引" }}
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="text-white">重建资源搜索向量</div>
              <div class="text-sm text-gray-400 mt-1">
                使用 jieba 分词重新生成所有资源的搜索向量，用于全文搜索
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                :disabled="isRebuilding"
                @click="rebuildSearch(false, 'source')"
              >
                <RefreshCw
                  class="w-4 h-4"
                  :class="{ 'animate-spin': isRebuilding }"
                />
                {{ isRebuilding ? "重建中..." : "重建未重建索引" }}
              </button>
              <button
                class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                :disabled="isRebuilding"
                @click="rebuildSearch(true, 'source')"
              >
                <RefreshCw
                  class="w-4 h-4"
                  :class="{ 'animate-spin': isRebuilding }"
                />
                {{ isRebuilding ? "重建中..." : "重建所有索引" }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ISR 缓存 -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white">ISR 缓存</h2>
        </div>
        <div class="card p-6 space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="text-white">清理全部 ISR 缓存</div>
              <div class="text-sm text-gray-400 mt-1">
                让所有启用 ISR 的路由重新生成静态页面
              </div>
            </div>
            <button
              class="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              :disabled="isClearing"
              @click="clearISRCache()"
            >
              <Eraser class="w-4 h-4" :class="{ 'animate-spin': isClearing }" />
              清理全部
            </button>
          </div>

          <div v-if="clearMsg" class="text-sm text-primary-400">
            {{ clearMsg }}
          </div>
        </div>
      </section>

      <!-- Redis 配置 -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white">Redis 配置</h2>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
            :class="{ 'bg-green-600 hover:bg-green-600': savedRedis }"
            :disabled="savingRedis"
            @click="saveRedisConfig"
          >
            <Check v-if="savedRedis" class="w-4 h-4" />
            <Save v-else class="w-4 h-4" />
            {{ savedRedis ? "已保存" : "保存" }}
          </button>
        </div>
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-6">
            <div
              class="w-10 h-10 bg-red-900/50 rounded-lg flex items-center justify-center"
            >
              <Database class="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 class="text-white font-medium">缓存服务</h3>
              <p class="text-gray-500 text-sm">
                配置 Redis 用于缓存全网搜结果，空 host 表示不启用缓存
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-gray-400 text-sm mb-2">Host</label>
              <input
                v-model="redisConfig.redis_host"
                type="text"
                placeholder="127.0.0.1"
                class="input-search"
              />
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">Port</label>
              <input
                v-model="redisConfig.redis_port"
                type="text"
                placeholder="6379"
                class="input-search"
              />
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">DB</label>
              <input
                v-model="redisConfig.redis_db"
                type="text"
                placeholder="0"
                class="input-search"
              />
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2">Password</label>
              <input
                v-model="redisConfig.redis_password"
                type="password"
                placeholder="无密码可留空"
                class="input-search"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- AES 配置 -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white">加密配置</h2>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
            :class="{ 'bg-green-600 hover:bg-green-600': savedAes }"
            :disabled="savingAes"
            @click="saveAesConfig"
          >
            <Check v-if="savedAes" class="w-4 h-4" />
            <Save v-else class="w-4 h-4" />
            {{ savedAes ? "已保存" : "保存" }}
          </button>
        </div>
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-6">
            <div
              class="w-10 h-10 bg-yellow-900/50 rounded-lg flex items-center justify-center"
            >
              <Key class="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 class="text-white font-medium">AES-GCM 密钥</h3>
              <p class="text-gray-500 text-sm">
                Key 需为 16/24/32 字节 base64，IV 需为 12 字节 base64
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-gray-400 text-sm mb-2"
                >Key (base64)</label
              >
              <input
                v-model="aesConfig.aes_key"
                type="text"
                placeholder="输入 base64 编码的 AES key"
                class="input-search font-mono text-xs"
              />
            </div>
            <div>
              <label class="block text-gray-400 text-sm mb-2"
                >IV (base64)</label
              >
              <input
                v-model="aesConfig.aes_iv"
                type="text"
                placeholder="输入 base64 编码的 12 字节 IV"
                class="input-search font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- PanCheck 配置 -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white">网盘检测配置</h2>
          <button
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
            :class="{ 'bg-green-600 hover:bg-green-600': savedPancheck }"
            :disabled="savingPancheck"
            @click="savePancheckConfig"
          >
            <Check v-if="savedPancheck" class="w-4 h-4" />
            <Save v-else class="w-4 h-4" />
            {{ savedPancheck ? "已保存" : "保存" }}
          </button>
        </div>
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-6">
            <div
              class="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center"
            >
              <Link class="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 class="text-white font-medium">PanCheck 接口</h3>
              <p class="text-gray-500 text-sm">
                配置网盘链接检测服务接口，格式：接口地址 + 密码
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <div
              v-for="(server, index) in pancheckServers"
              :key="index"
              class="flex items-start gap-3"
            >
              <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-gray-400 text-sm mb-2">接口地址</label>
                  <input
                    v-model="server.url"
                    type="text"
                    placeholder="http://localhost:6080"
                    class="input-search"
                  />
                </div>
                <div>
                  <label class="block text-gray-400 text-sm mb-2">密码</label>
                  <input
                    v-model="server.password"
                    type="text"
                    placeholder="admin123"
                    class="input-search"
                  />
                </div>
              </div>
              <button
                class="mt-6 p-2 text-red-400 hover:text-red-300 transition-colors"
                @click="removePancheckServer(index)"
              >
                <Trash class="w-4 h-4" />
              </button>
            </div>

            <button
              class="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              @click="addPancheckServer"
            >
              <Plus class="w-4 h-4" />
              添加接口
            </button>

            <div v-if="pancheckServers.length === 0" class="text-gray-500 text-sm">
              未配置 PanCheck 接口，搜索页将不会显示链接有效性检测
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
