<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import {
  Music,
  LogOut,
  RefreshCw,
  Eraser,
} from "lucide-vue-next";
import AdminNav from "~/components/admin/AdminNav.vue";

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
    </main>
  </div>
</template>
