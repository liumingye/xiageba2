<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  Music,
  Users,
  LogOut,
  Settings,
  RefreshCw,
  Eraser,
} from "lucide-vue-next";

const router = useRouter();
const {
  isLoggedIn,
  username,
  logout,
  checkLogin,
  initialized,
  getAuthHeaders,
} = useAuth();

const isRebuilding = ref(false);
const rebuildMsg = ref("");
const isClearing = ref(false);
const clearMsg = ref("");

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
  }
});

const handleLogout = () => {
  logout();
  router.push("/admin/login");
};

const rebuildSearch = async () => {
  if (isRebuilding.value) return;
  if (!confirm("确定要重建所有音乐的搜索索引吗？\n这将使用 jieba 分词重新生成搜索向量。")) return;

  isRebuilding.value = true;
  rebuildMsg.value = "";
  try {
    const res = await fetch("/api/admin/music/rebuild-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
    });
    const data = await res.json();
    if (res.ok) {
      rebuildMsg.value = `已处理 ${data.removed?.length || 0} 项`;
    } else {
      rebuildMsg.value = data.message || "重建失败";
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
      clearMsg.value = `已清理 ${label}，共 ${data.removed?.length || 0} 项`;
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
          <span class="text-gray-400">{{ username }}</span>
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
          class="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Users class="w-5 h-5" />
          管理员管理
        </a>
        <a
          href="/admin/maintain"
          class="flex items-center gap-2 text-primary-500 font-medium"
        >
          <Settings class="w-5 h-5" />
          系统维护
        </a>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-6 py-6">
      <!-- 搜索索引 -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white">搜索索引</h2>
        </div>
        <div class="card p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-white">重建搜索向量</div>
              <div class="text-sm text-gray-400 mt-1">
                使用 jieba 分词重新生成所有音乐的搜索向量，用于全文搜索
              </div>
            </div>
            <button
              class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
              :disabled="isRebuilding"
              @click="rebuildSearch"
            >
              <RefreshCw
                class="w-4 h-4"
                :class="{ 'animate-spin': isRebuilding }"
              />
              {{ isRebuilding ? "重建中..." : "重建索引" }}
            </button>
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
          <div class="flex items-center justify-between">
            <div>
              <div class="text-white">清理主页缓存</div>
              <div class="text-sm text-gray-400 mt-1">
                让首页重新渲染成最新数据
              </div>
            </div>
            <button
              class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
              :disabled="isClearing"
              @click="clearISRCache('/')"
            >
              <Eraser class="w-4 h-4" :class="{ 'animate-spin': isClearing }" />
              清理主页
            </button>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="text-white">清理音乐详情缓存</div>
              <div class="text-sm text-gray-400 mt-1">
                让所有音乐详情页重新渲染
              </div>
            </div>
            <button
              class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
              :disabled="isClearing"
              @click="clearISRCache('/music/**')"
            >
              <Eraser class="w-4 h-4" :class="{ 'animate-spin': isClearing }" />
              清理音乐详情
            </button>
          </div>

          <div class="flex items-center justify-between">
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
    </main>
  </div>
</template>
