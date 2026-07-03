<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  RefreshCw,
  Eraser,
  Database,
  Save,
  Check,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";

const router = useRouter();
const {
  isLoggedIn,
  logout,
  checkLogin,
  initialized,
  getAuthHeaders,
} = useAuth();

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

const rebuildSearch = async (all: boolean) => {
  if (isRebuilding.value) return;
  if (
    !confirm(
      `确定要重建${all ? "所有音乐" : "没有索引的音乐"}的搜索向量吗？\n这将使用 jieba 分词重新生成搜索向量。`,
    )
  )
    return;

  isRebuilding.value = true;
  rebuildMsg.value = "";
  try {
    const res = await fetch("/api/admin/music/rebuild-search", {
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
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="text-white">重建搜索向量</div>
              <div class="text-sm text-gray-400 mt-1">
                使用 jieba 分词重新生成所有音乐的搜索向量，用于全文搜索
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                :disabled="isRebuilding"
                @click="rebuildSearch(false)"
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
                @click="rebuildSearch(true)"
              >
                <RefreshCw
                  class="w-4 h-4"
                  :class="{ 'animate-spin': isRebuilding }"
                />
                {{ isRebuilding ? "重建中..." : "重建所有索引" }}
              </button>
            </div>
          </div>
          <div v-if="rebuildMsg" class="text-sm text-primary-400">
            {{ rebuildMsg }}
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
    </main>
  </div>
</template>
