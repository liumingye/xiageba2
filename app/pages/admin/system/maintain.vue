<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { useAuth } from "~/composables/useAuth";
import { Globe } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "系统维护",
});

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

const isRebuilding = ref(false);
const rebuildMsg = ref("");
const isClearing = ref(false);
const clearMsg = ref("");

// ============ 站点 SEO 配置 ============
interface SiteSeoConfig {
  site_seo_title: string;
  site_seo_short_title: string;
  site_seo_description: string;
  site_icp_licence: string;
}
const siteSeoConfig = ref<SiteSeoConfig>({
  site_seo_title: "",
  site_seo_short_title: "",
  site_seo_description: "",
  site_icp_licence: "",
});
const savingSiteSeo = ref(false);
const savedSiteSeo = ref(false);

// 站点 SEO 配置
const loadSiteSeoConfig = async () => {
  const data = await get("/api/admin/config/site-seo");
  if (data.data) {
    siteSeoConfig.value = { ...siteSeoConfig.value, ...data.data };
  }
};

const saveSiteSeoConfig = async () => {
  savingSiteSeo.value = true;
  savedSiteSeo.value = false;
  try {
    await post("/api/admin/config/site-seo", siteSeoConfig.value);
    savedSiteSeo.value = true;
    setTimeout(() => {
      savedSiteSeo.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingSiteSeo.value = false;
  }
};

// 当前正在轮询的重建类型，null 表示未在轮询
const pollingType = ref<"music" | "source" | null>(null);

// 轮询进度的函数（组件卸载时由 useIntervalFn 自动清理，避免内存/请求泄漏）
const checkStatus = async () => {
  const type = pollingType.value;
  if (!type) return;
  try {
    const data = await get(`/api/admin/${type}/rebuild-status`);

    if (data.status === "running") {
      rebuildMsg.value = `服务器正在疯狂分批处理中... 目前已完成: ${data.current} 条`;
    } else if (data.status === "done") {
      rebuildMsg.value = "🎉 全文索引重建圆满完成！";
      isRebuilding.value = false;
      pollingType.value = null;
      poll.pause();
    }
  } catch {
    // 静默降级，网络波动不中断轮询
  }
};

const poll = useIntervalFn(checkStatus, 2000, { immediate: false });

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
  rebuildMsg.value = "正在启动后台任务...";

  try {
    const data = await post(`/api/admin/${type}/rebuild-search`, { all });

    if (data.success) {
      // 启动每 2 秒一次的轻量级 Redis 状态轮询
      pollingType.value = type;
      poll.resume();
    } else {
      rebuildMsg.value = data.message || "启动失败";
      isRebuilding.value = false;
    }
  } catch {
    rebuildMsg.value = "请求失败";
    isRebuilding.value = false;
  }
};

const clearISRCache = async () => {
  if (isClearing.value) return;
  if (!confirm(`确定要清理 全部缓存吗？`)) return;

  isClearing.value = true;
  clearMsg.value = "";
  try {
    const data = await post("/api/admin/cache/clear");
    clearMsg.value = `已清理全部缓存，共 ${data.total} 项`;
  } catch (err: any) {
    clearMsg.value = err?.response?.data?.message || "请求失败";
  } finally {
    isClearing.value = false;
  }
};

// ============ 生命周期 ============

onMounted(async () => {
  if (!initialized.value) {
    checkLogin();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!isLoggedIn.value) {
    router.push("/admin/login");
    return;
  }
  await loadSiteSeoConfig();
  loading.value = false;
});
</script>

<template>
  <!-- 搜索索引 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">搜索索引</h2>
    </div>
    <UCard>
      <div class="space-y-4">
        <div v-if="rebuildMsg" class="text-sm text-primary-400">
          {{ rebuildMsg }}
        </div>
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div>重建音乐搜索向量</div>
            <div class="text-sm text-muted mt-1">
              使用 jieba 分词重新生成所有音乐的搜索向量，用于全文搜索
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="isRebuilding"
              :disabled="isRebuilding"
              @click="rebuildSearch(false, 'music')"
            >
              {{ isRebuilding ? "重建中..." : "重建未重建索引" }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="isRebuilding"
              :disabled="isRebuilding"
              @click="rebuildSearch(true, 'music')"
            >
              {{ isRebuilding ? "重建中..." : "重建所有索引" }}
            </UButton>
          </div>
        </div>
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div>重建资源搜索向量</div>
            <div class="text-sm text-muted mt-1">
              使用 jieba 分词重新生成所有资源的搜索向量，用于全文搜索
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="isRebuilding"
              :disabled="isRebuilding"
              @click="rebuildSearch(false, 'source')"
            >
              {{ isRebuilding ? "重建中..." : "重建未重建索引" }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="isRebuilding"
              :disabled="isRebuilding"
              @click="rebuildSearch(true, 'source')"
            >
              {{ isRebuilding ? "重建中..." : "重建所有索引" }}
            </UButton>
          </div>
        </div>
      </div>
    </UCard>
  </section>

  <!--  缓存 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">Nitro 缓存</h2>
    </div>
    <UCard>
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div>清理全部缓存</div>
          <div class="text-sm text-muted mt-1">
            清空全部Nitro缓存，包括路由ISR缓存、页面缓存
          </div>
        </div>
        <UButton
          color="error"
          icon="i-lucide-eraser"
          :loading="isClearing"
          :disabled="isClearing"
          @click="clearISRCache()"
        >
          清理全部
        </UButton>
      </div>

      <div v-if="clearMsg" class="text-sm text-primary-400">
        {{ clearMsg }}
      </div>
    </UCard>
  </section>

  <!-- 站点 SEO 配置（暂时隐藏） -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">SEO 配置</h2>
      <UButton
        color="primary"
        :icon="savedSiteSeo ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingSiteSeo"
        :disabled="savingSiteSeo || loading"
        @click="saveSiteSeoConfig"
      >
        {{ savedSiteSeo ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-sky-600 rounded-lg flex items-center justify-center"
        >
          <Globe class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">站点标题与描述</h3>
          <p class="text-color-500 text-sm">
            标题用于首页 title，短标题用作内页 title 后缀，描述用于全站默认 meta
            description；留空使用默认值
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-muted text-sm mb-2" for="seo-title">
            SEO 标题
          </label>
          <UInput
            id="seo-title"
            v-model="siteSeoConfig.site_seo_title"
            type="text"
            placeholder="全盘搜 - 免费网盘资源搜索引擎"
            class="w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            建议不超过 30 个字符，仅在首页生效
          </p>
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="seo-short-title">
            短标题
          </label>
          <UInput
            id="seo-short-title"
            v-model="siteSeoConfig.site_seo_short_title"
            type="text"
            placeholder="全盘搜"
            class="w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            建议不超过 10 个字符，用于内页标题后缀（如「歌名 - 短标题」）
          </p>
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="seo-description">
            SEO 描述
          </label>
          <UTextarea
            id="seo-description"
            v-model="siteSeoConfig.site_seo_description"
            :rows="4"
            placeholder="全盘搜是一个快捷便利的公开网盘搜索引擎，为您提供各类网盘资源的在线搜索、精准筛选服务。"
            class="w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            建议不超过 120 个字符，页面自身设置了描述时优先使用页面的
          </p>
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="icp-licence">
            ICP 备案号
          </label>
          <UInput
            id="icp-licence"
            v-model="siteSeoConfig.site_icp_licence"
            type="text"
            placeholder="如：粤ICP备2023000000号"
            class="w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            建议使用 粤ICP备2023000000号 格式
          </p>
        </div>
      </div>
    </UCard>
  </section>
</template>
