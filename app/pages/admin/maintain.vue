<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { useAuth } from "~/composables/useAuth";
import {
  Database,
  Key,
  Link,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Filter,
  MessageSquare,
  Check,
} from "@lucide/vue";
import AdminNav from "~/components/admin/AdminNav.vue";
import AdminHeader from "~/components/admin/AdminHeader.vue";
import { useClipboard } from "@vueuse/core";
import { get, post } from "~/utils/request";

const toast = useToast();
const { copy: copyToClipboard } = useClipboard();

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const isRebuilding = ref(false);
const rebuildMsg = ref("");
const isClearing = ref(false);
const clearMsg = ref("");
const loading = ref(true);

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

const pancheckServers = ref<string[]>([]);
const savingPancheck = ref(false);
const savedPancheck = ref(false);

// 健康检测结果：索引对应 pancheckServers 下标
interface PancheckHealthResult {
  ok: boolean;
  status: string;
  message: string;
  durationMs: number;
}
const checkingPancheckHealth = ref(false);
const pancheckHealthResults = ref<PancheckHealthResult[]>([]);

const checkPancheckHealth = async () => {
  if (checkingPancheckHealth.value) return;

  const servers = pancheckServers.value.map((s) => s.trim()).filter(Boolean);
  if (!servers.length) {
    toast.add({
      title: "请先填写至少一个接口地址",
      icon: "i-lucide-x",
      color: "warning",
    });
    return;
  }

  checkingPancheckHealth.value = true;
  pancheckHealthResults.value = [];

  try {
    const data = await post("/api/admin/config/pancheck/health", { servers });
    if (data.success) {
      pancheckHealthResults.value = data.results || [];
      const okCount = (data.results || []).filter((r: PancheckHealthResult) => r.ok)
        .length;
      toast.add({
        title: `健康检测完成：正常 ${okCount}/${servers.length} 个接口`,
        icon: okCount === servers.length ? "i-lucide-check" : "i-lucide-x",
        color: okCount === servers.length ? "success" : "warning",
      });
    }
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "健康检测失败",
      icon: "i-lucide-x",
      color: "error",
    });
  } finally {
    checkingPancheckHealth.value = false;
  }
};

interface HotWord {
  word: string;
  weight: number;
  type: "music" | "resource";
}

const hotwords = ref<HotWord[]>([]);
const savingHotwords = ref(false);
const savedHotwords = ref(false);

interface AdFilterConfig {
  enabled: boolean;
  keywords: string;
}

const adFilterConfig = ref<AdFilterConfig>({
  enabled: false,
  keywords: "",
});
const savingAdFilter = ref(false);
const savedAdFilter = ref(false);

interface AiSearchConfig {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
}

const aiSearchConfig = ref<AiSearchConfig>({
  enabled: false,
  baseURL: "",
  apiKey: "",
  model: "",
});
const savingAiSearch = ref(false);
const savedAiSearch = ref(false);

interface WebSearchFilterConfig {
  websearch_filter_keywords: string;
}
const webSearchFilterConfig = ref<WebSearchFilterConfig>({
  websearch_filter_keywords: "",
});
const savingWebSearchFilter = ref(false);
const savedWebSearchFilter = ref(false);

// ============ 微信公众号配置 ============
interface WechatConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  token: string;
  encodingAESKey: string;
  autoReplyEnabled: boolean;
  welcomeMessage: string;
  searchLimit: number;
  verifyFileName: string;
  verifyFileContent: string;
}

const wechatConfig = ref<WechatConfig>({
  enabled: false,
  appId: "",
  appSecret: "",
  token: "",
  encodingAESKey: "",
  autoReplyEnabled: true,
  welcomeMessage: "谢谢关注！发送关键词即可搜索资源。",
  searchLimit: 5,
  verifyFileName: "",
  verifyFileContent: "",
});
const savingWechat = ref(false);
const savedWechat = ref(false);

// 验证文件上传
const wechatVerifyFile = ref<File | null>(null);
const wechatVerifyUploading = ref(false);
const wechatVerifyFileInput = ref<HTMLInputElement | null>(null);
const wechatOrigin = ref("");

const loadWechatConfig = async () => {
  const data = await get("/api/admin/config/wechat");
  if (data.data) {
    wechatConfig.value = { ...wechatConfig.value, ...data.data };
  }
};

const saveWechatConfig = async () => {
  savingWechat.value = true;
  savedWechat.value = false;
  try {
    const res = await post("/api/admin/config/wechat", wechatConfig.value);
    // 更新前端缓存的验证文件名等（接口返回脱敏后的值）
    if (res?.data) {
      wechatConfig.value = { ...wechatConfig.value, ...res.data };
    }
    savedWechat.value = true;
    setTimeout(() => {
      savedWechat.value = false;
    }, 2000);
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "保存失败",
      icon: "i-lucide-x",
      color: "error",
    });
  } finally {
    savingWechat.value = false;
  }
};

const onPickWechatVerifyFile = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0] || null;
  if (file && /\.txt$/i.test(file.name)) {
    wechatVerifyFile.value = file;
  } else {
    toast.add({
      title: "请选择 .txt 文件",
      icon: "i-lucide-x",
      color: "error",
    });
    wechatVerifyFile.value = null;
    if (wechatVerifyFileInput.value) wechatVerifyFileInput.value.value = "";
  }
};

const uploadWechatVerifyFile = async () => {
  if (!wechatVerifyFile.value) {
    toast.add({
      title: "请先选择 TXT 验证文件",
      icon: "i-lucide-x",
      color: "warning",
    });
    return;
  }
  wechatVerifyUploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", wechatVerifyFile.value);
    const res = await post("/api/admin/config/wechat-verify-file", fd);
    if (res?.success) {
      wechatConfig.value.verifyFileName = res.file_name || "";
      toast.add({
        title: "验证文件上传成功",
        icon: "i-lucide-check",
        color: "success",
      });
      wechatVerifyFile.value = null;
      if (wechatVerifyFileInput.value) wechatVerifyFileInput.value.value = "";
    }
  } catch (e: any) {
    toast.add({
      title: e?.response?.data?.message || "上传失败",
      icon: "i-lucide-x",
      color: "error",
    });
  } finally {
    wechatVerifyUploading.value = false;
  }
};

const copyText = async (text: string, label?: string) => {
  try {
    await copyToClipboard(text);
    toast.add({
      title: label ? `${label}已复制` : "已复制到剪贴板",
      icon: "i-lucide-check",
      color: "success",
    });
  } catch {
    toast.add({
      title: "复制失败，请手动选择复制",
      icon: "i-lucide-x",
      color: "error",
    });
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
  await loadRedisConfig();
  await loadAesConfig();
  await loadPancheckConfig();
  await loadHotwordsConfig();
  await loadAdFilterConfig();
  await loadAiSearchConfig();
  await loadWebSearchFilterConfig();
  await loadWechatConfig();
  // 构造回调地址域名（仅用于显示复制）
  if (typeof window !== "undefined") {
    wechatOrigin.value = window.location.origin;
  }
  loading.value = false;
});

const loadRedisConfig = async () => {
  const data = await get("/api/admin/config/redis");
  redisConfig.value = { ...redisConfig.value, ...data.data };
};

const saveRedisConfig = async () => {
  savingRedis.value = true;
  savedRedis.value = false;
  try {
    await post("/api/admin/config/redis", redisConfig.value);
    savedRedis.value = true;
    setTimeout(() => {
      savedRedis.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingRedis.value = false;
  }
};

const loadAesConfig = async () => {
  const data = await get("/api/admin/config/aes");
  aesConfig.value = { ...aesConfig.value, ...data.data };
};

const saveAesConfig = async () => {
  savingAes.value = true;
  savedAes.value = false;
  try {
    await post("/api/admin/config/aes", aesConfig.value);
    savedAes.value = true;
    setTimeout(() => {
      savedAes.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingAes.value = false;
  }
};

const loadPancheckConfig = async () => {
  const data = await get("/api/admin/config/pancheck");
  pancheckServers.value = data.data?.servers || [];
};

const savePancheckConfig = async () => {
  savingPancheck.value = true;
  savedPancheck.value = false;
  try {
    await post("/api/admin/config/pancheck", {
      servers: pancheckServers.value,
    });
    savedPancheck.value = true;
    setTimeout(() => {
      savedPancheck.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingPancheck.value = false;
  }
};

const addPancheckServer = () => {
  pancheckServers.value.push("");
};

const removePancheckServer = (index: number) => {
  pancheckServers.value.splice(index, 1);
};

const loadHotwordsConfig = async () => {
  const data = await get("/api/admin/config/hotwords");
  hotwords.value = data.data || [];
};

const saveHotwordsConfig = async () => {
  savingHotwords.value = true;
  savedHotwords.value = false;
  try {
    await post("/api/admin/config/hotwords", { hotwords: hotwords.value });
    savedHotwords.value = true;
    setTimeout(() => {
      savedHotwords.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingHotwords.value = false;
  }
};

const addHotword = () => {
  hotwords.value.push({ word: "", weight: 1, type: "music" });
};

const removeHotword = (index: number) => {
  hotwords.value.splice(index, 1);
};

const loadAdFilterConfig = async () => {
  const data = await get("/api/admin/config/ad-filter");
  if (data.data) {
    adFilterConfig.value = { ...adFilterConfig.value, ...data.data };
  }
};

const saveAdFilterConfig = async () => {
  savingAdFilter.value = true;
  savedAdFilter.value = false;
  try {
    await post("/api/admin/config/ad-filter", adFilterConfig.value);
    savedAdFilter.value = true;
    setTimeout(() => {
      savedAdFilter.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingAdFilter.value = false;
  }
};

const loadAiSearchConfig = async () => {
  const data = await get("/api/admin/config/ai-search");
  if (data.data) {
    aiSearchConfig.value = { ...aiSearchConfig.value, ...data.data };
  }
};

const saveAiSearchConfig = async () => {
  savingAiSearch.value = true;
  savedAiSearch.value = false;
  try {
    await post("/api/admin/config/ai-search", aiSearchConfig.value);
    savedAiSearch.value = true;
    setTimeout(() => {
      savedAiSearch.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingAiSearch.value = false;
  }
};

// 全网搜过滤词配置
const loadWebSearchFilterConfig = async () => {
  const data = await get("/api/admin/config/web-search-filter");
  if (data.data) {
    webSearchFilterConfig.value = {
      ...webSearchFilterConfig.value,
      ...data.data,
    };
  }
};

const saveWebSearchFilterConfig = async () => {
  savingWebSearchFilter.value = true;
  savedWebSearchFilter.value = false;
  try {
    await post(
      "/api/admin/config/web-search-filter",
      webSearchFilterConfig.value,
    );
    savedWebSearchFilter.value = true;
    setTimeout(() => {
      savedWebSearchFilter.value = false;
    }, 2000);
  } catch {
    // 保存失败
  } finally {
    savingWebSearchFilter.value = false;
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
</script>

<template>
  <!-- 搜索索引 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">搜索索引</h2>
    </div>
    <UCard>
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

  <!-- Redis 配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">Redis 配置</h2>
      <UButton
        color="primary"
        :icon="savedRedis ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingRedis"
        :disabled="savingRedis || loading"
        @click="saveRedisConfig"
      >
        {{ savedRedis ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-red-600 rounded-lg flex items-center justify-center"
        >
          <Database class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">缓存服务</h3>
          <p class="text-color-500 text-sm">
            配置 Redis 用于缓存全网搜结果，空 host 表示不启用缓存
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-muted text-sm mb-2" for="redis-host"
            >Host</label
          >
          <UInput
            id="redis-host"
            v-model="redisConfig.redis_host"
            type="text"
            placeholder="127.0.0.1"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="redis-port"
            >Port</label
          >
          <UInput
            id="redis-port"
            v-model="redisConfig.redis_port"
            type="text"
            placeholder="6379"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="redis-db">DB</label>
          <UInput
            id="redis-db"
            v-model="redisConfig.redis_db"
            type="text"
            placeholder="0"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="redis-pass"
            >Password</label
          >
          <UInput
            id="redis-pass"
            v-model="redisConfig.redis_password"
            type="password"
            placeholder="无密码可留空"
            class="w-full"
          />
        </div>
      </div>
    </UCard>
  </section>

  <!-- AES 配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">加密配置</h2>
      <UButton
        color="primary"
        :icon="savedAes ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingAes"
        :disabled="savingAes || loading"
        @click="saveAesConfig"
      >
        {{ savedAes ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-yellow-600 rounded-lg flex items-center justify-center"
        >
          <Key class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">AES-CBC 密钥</h3>
          <p class="text-color-500 text-sm">
            Key 需为 16/24/32 字节 base64，IV 需为 16 字节 base64
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-muted text-sm mb-2" for="aes-key"
            >Key (base64)</label
          >
          <UInput
            id="aes-key"
            v-model="aesConfig.aes_key"
            type="text"
            placeholder="输入 base64 编码的 AES key"
            class="font-mono text-xs w-full"
          />
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="aes-iv"
            >IV (base64)</label
          >
          <UInput
            id="aes-iv"
            v-model="aesConfig.aes_iv"
            type="text"
            placeholder="输入 base64 编码的 12 字节 IV"
            class="font-mono text-xs w-full"
          />
        </div>
      </div>
    </UCard>
  </section>

  <!-- 全网搜过滤词配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">全网搜过滤词配置</h2>
      <UButton
        color="primary"
        :icon="savedWebSearchFilter ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingWebSearchFilter"
        :disabled="savingWebSearchFilter || loading"
        @click="saveWebSearchFilterConfig"
      >
        {{ savedWebSearchFilter ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-emerald-600 rounded-lg flex items-center justify-center"
        >
          <Filter class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">搜索结果过滤词</h3>
          <p class="text-color-500 text-sm">
            配置全网搜中需要过滤掉的资源关键词，关键词用英文逗号隔开
          </p>
        </div>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-muted text-sm mb-2" for="wsf-words">
            过滤关键词（英文逗号隔开）
          </label>
          <UTextarea
            id="wsf-words"
            v-model="webSearchFilterConfig.websearch_filter_keywords"
            :rows="10"
            placeholder="例如：加微信,关注公众号,推广,广告,赌博"
            class="w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            标题中包含任一关键词的资源都会被过滤掉，关键词不区分大小写
          </p>
        </div>
      </div>
    </UCard>
  </section>

  <!-- 广告过滤配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">广告过滤配置</h2>
      <UButton
        color="primary"
        :icon="savedAdFilter ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingAdFilter"
        :disabled="savingAdFilter || loading"
        @click="saveAdFilterConfig"
      >
        {{ savedAdFilter ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-purple-600 rounded-lg flex items-center justify-center"
        >
          <ShieldAlert class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">转存广告过滤</h3>
          <p class="text-color-500 text-sm">
            转存网盘资源后，自动删除包含广告词的文件或目录（最深2层）
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <UCheckbox
          id="adFilterEnabled"
          v-model="adFilterConfig.enabled"
          label="启用广告过滤"
        />
        <div>
          <label class="block text-muted text-sm mb-2" for="adf-words">
            广告关键词（英文逗号隔开）
          </label>
          <UTextarea
            id="adf-words"
            v-model="adFilterConfig.keywords"
            :rows="10"
            placeholder="例如：关注公众号,加微信,广告,推广"
            class="w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            文件名或目录名包含任一关键词即被删除，关键词不区分大小写
          </p>
        </div>
      </div>
    </UCard>
  </section>

  <!-- AI 搜索配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">AI 搜索配置</h2>
      <UButton
        color="primary"
        :icon="savedAiSearch ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingAiSearch"
        :disabled="savingAiSearch || loading"
        @click="saveAiSearchConfig"
      >
        {{ savedAiSearch ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-cyan-600 rounded-lg flex items-center justify-center"
        >
          <Sparkles class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">AI 智能搜索</h3>
          <p class="text-color-500 text-sm">
            配置 AI 模型接口，支持 OpenAI 兼容协议（DeepSeek、通义千问等）
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <UCheckbox
          id="aiSearchEnabled"
          v-model="aiSearchConfig.enabled"
          label="启用 AI 搜索"
        />
        <div>
          <label class="block text-muted text-sm mb-2" for="ai-base"
            >Base URL</label
          >
          <UInput
            id="ai-base"
            v-model="aiSearchConfig.baseURL"
            type="text"
            placeholder="https://api.deepseek.com/v1"
            class="font-mono text-xs w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            OpenAI 兼容的 API 地址，需包含 /v1 路径
          </p>
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="ai-key"
            >API Key</label
          >
          <UInput
            id="ai-key"
            v-model="aiSearchConfig.apiKey"
            type="password"
            placeholder="sk-..."
            class="font-mono text-xs w-full"
          />
          <p class="text-color-500 text-xs mt-2">模型服务商提供的密钥</p>
        </div>
        <div>
          <label class="block text-muted text-sm mb-2" for="ai-model"
            >模型名称</label
          >
          <UInput
            id="ai-model"
            v-model="aiSearchConfig.model"
            type="text"
            placeholder="qwen-plus"
            class="font-mono text-xs w-full"
          />
          <p class="text-color-500 text-xs mt-2">
            调用的模型标识，如 qwen-plus、deepseek-chat 等
          </p>
        </div>
      </div>
    </UCard>
  </section>

  <!-- 热搜词配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">热搜词配置</h2>
      <UButton
        color="primary"
        :icon="savedHotwords ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingHotwords"
        :disabled="savingHotwords || loading"
        @click="saveHotwordsConfig"
      >
        {{ savedHotwords ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-orange-600 rounded-lg flex items-center justify-center"
        >
          <TrendingUp class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">热门搜索词</h3>
          <p class="text-color-500 text-sm">
            配置首页热门搜索词，权重越高排名越靠前
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        <div
          v-for="(hotword, index) in hotwords"
          :key="index"
          class="flex items-center gap-2"
        >
          <div class="flex-1">
            <label
              class="block text-muted text-sm mb-2"
              :for="`hot-${index}-word`"
              >搜索词</label
            >
            <UInput
              :id="`hot-${index}-word`"
              v-model="hotword.word"
              type="text"
              placeholder="输入搜索词"
              class="w-full"
            />
          </div>
          <div class="w-20">
            <label
              class="block text-muted text-sm mb-2"
              :for="`hot-${index}-type`"
              >类型</label
            >
            <USelect
              :id="`hot-${index}-type`"
              v-model="hotword.type"
              class="w-full"
              :items="[
                { label: '音乐', value: 'music' },
                { label: '资源', value: 'resource' },
              ]"
            />
          </div>
          <div class="w-24">
            <label
              class="block text-muted text-sm mb-2"
              :for="`hot-${index}-weight`"
              >权重</label
            >
            <div class="flex gap-2">
              <UInput
                :id="`hot-${index}-weight`"
                v-model.number="hotword.weight"
                type="number"
                min="1"
                max="999"
                placeholder="1-999"
                class="w-full"
              />
              <UButton
                color="error"
                variant="ghost"
                square
                size="sm"
                icon="i-lucide-trash-2"
                aria-label="删除搜索词"
                @click="removeHotword(index)"
              />
            </div>
          </div>
        </div>
      </div>

      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        class="self-start"
        @click="addHotword"
      >
        添加搜索词
      </UButton>

      <div v-if="hotwords.length === 0" class="text-color-500 text-sm">
        未配置热搜词，首页热门搜索区域将不显示
      </div>
    </UCard>
  </section>

  <!-- PanCheck 配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">网盘检测配置</h2>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-heart-pulse"
          :loading="checkingPancheckHealth"
          :disabled="checkingPancheckHealth || loading"
          @click="checkPancheckHealth"
        >
          {{ checkingPancheckHealth ? "检测中..." : "健康检测" }}
        </UButton>
        <UButton
          color="primary"
          :icon="savedPancheck ? 'i-lucide-check' : 'i-lucide-save'"
          :loading="savingPancheck"
          :disabled="savingPancheck || loading"
          @click="savePancheckConfig"
        >
          {{ savedPancheck ? "已保存" : "保存" }}
        </UButton>
      </div>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-blue-600 rounded-lg flex items-center justify-center"
        >
          <Link class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">PanCheck 接口</h3>
          <p class="text-color-500 text-sm">配置网盘链接检测服务接口地址</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
        <div v-for="(_, index) in pancheckServers" :key="index">
          <label class="flex items-center gap-1.5 text-muted text-sm mb-2" :for="`pan-${index}-url`"
            >接口地址
            <UIcon
              v-if="checkingPancheckHealth"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-muted"
              title="检测中..."
            />
            <template v-else-if="pancheckHealthResults[index]">
              <UIcon
                v-if="pancheckHealthResults[index].ok"
                name="i-lucide-circle-check"
                class="size-4 text-green-500"
                :title="`正常（${pancheckHealthResults[index].durationMs}ms）`"
              />
              <UIcon
                v-else
                name="i-lucide-circle-x"
                class="size-4 text-red-500"
                :title="`异常：${pancheckHealthResults[index].message || pancheckHealthResults[index].status}（${pancheckHealthResults[index].durationMs}ms）`"
              />
            </template>
          </label>
          <div class="flex flex-1 gap-1">
            <UInput
              :id="`pan-${index}-url`"
              v-model="pancheckServers[index]"
              type="text"
              placeholder="http://localhost:6080"
              class="w-full"
            />
            <UButton
              color="error"
              variant="ghost"
              square
              size="sm"
              icon="i-lucide-trash-2"
              aria-label="删除接口"
              @click="removePancheckServer(index)"
            />
          </div>
        </div>
      </div>

      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        class="self-start"
        @click="addPancheckServer"
      >
        添加接口
      </UButton>

      <div v-if="pancheckServers.length === 0" class="text-color-500 text-sm">
        未配置 PanCheck 接口，搜索页将不会显示链接有效性检测
      </div>
    </UCard>
  </section>

  <!-- 微信公众号配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">微信公众号配置</h2>
      <UButton
        color="primary"
        :icon="savedWechat ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingWechat"
        :disabled="savingWechat || loading"
        @click="saveWechatConfig"
      >
        {{ savedWechat ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard
      :ui="{
        body: 'p-6 space-y-8',
      }"
    >
      <!-- 基础配置 -->
      <div>
        <div class="flex items-center gap-3 mb-6">
          <div
            class="w-10 h-10 shrink-0 bg-green-600 rounded-lg flex items-center justify-center"
          >
            <MessageSquare class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-medium">基础配置</h3>
            <p class="text-color-500 text-sm">
              在微信公众平台「开发管理 → 基本配置」中获取 AppID / AppSecret
            </p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-muted text-sm mb-2" for="wx-appid"
              >AppID</label
            >
            <UInput
              id="wx-appid"
              v-model="wechatConfig.appId"
              type="text"
              placeholder="如：wx1234567890abcdef"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-muted text-sm mb-2" for="wx-secret"
              >AppSecret</label
            >
            <UInput
              id="wx-secret"
              v-model="wechatConfig.appSecret"
              type="password"
              placeholder="填写后保存以更新；已配置则显示星号"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-muted text-sm mb-2" for="wx-token"
              >Token</label
            >
            <UInput
              id="wx-token"
              v-model="wechatConfig.token"
              type="text"
              placeholder="自定义任意字符串，服务器校验用"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-muted text-sm mb-2" for="wx-aeskey"
              >EncodingAESKey（可选）</label
            >
            <UInput
              id="wx-aeskey"
              v-model="wechatConfig.encodingAESKey"
              type="password"
              placeholder="消息加解密密钥；安全模式下必填"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <!-- 功能配置 -->
      <div>
        <h4
          class="text-sm font-medium text-muted pb-2 mb-4 border-b border-muted"
        >
          功能配置
        </h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            class="flex items-center justify-between p-3 bg-elevated rounded-lg"
          >
            <div>
              <div class="text-sm">启用机器人</div>
              <div class="text-xs text-color-500 mt-0.5">
                关闭后微信服务器回调将不再回复消息
              </div>
            </div>
            <UButton
              size="sm"
              :color="wechatConfig.enabled ? 'success' : 'neutral'"
              :variant="wechatConfig.enabled ? 'solid' : 'soft'"
              :icon="
                wechatConfig.enabled ? 'i-lucide-power' : 'i-lucide-power-off'
              "
              @click="wechatConfig.enabled = !wechatConfig.enabled"
            >
              {{ wechatConfig.enabled ? "已启用" : "已停用" }}
            </UButton>
          </div>
          <div
            class="flex items-center justify-between p-3 bg-elevated rounded-lg"
          >
            <div>
              <div class="text-sm">自动回复</div>
              <div class="text-xs text-color-500 mt-0.5">
                开启后用户发送关键词将触发站内搜索回复
              </div>
            </div>
            <UButton
              size="sm"
              :color="wechatConfig.autoReplyEnabled ? 'success' : 'neutral'"
              :variant="wechatConfig.autoReplyEnabled ? 'solid' : 'soft'"
              :icon="
                wechatConfig.autoReplyEnabled
                  ? 'i-lucide-power'
                  : 'i-lucide-power-off'
              "
              @click="
                wechatConfig.autoReplyEnabled = !wechatConfig.autoReplyEnabled
              "
            >
              {{ wechatConfig.autoReplyEnabled ? "已启用" : "已停用" }}
            </UButton>
          </div>
          <div>
            <label class="block text-muted text-sm mb-2" for="wx-limit"
              >搜索结果限制</label
            >
            <UInput
              id="wx-limit"
              v-model.number="wechatConfig.searchLimit"
              type="number"
              min="1"
              max="100"
              class="w-full"
            />
            <p class="text-color-500 text-xs mt-1.5">
              每次搜索最多返回的条数（1-100）
            </p>
          </div>
          <div class="md:col-span-2">
            <label class="block text-muted text-sm mb-2" for="wx-msg"
              >欢迎消息</label
            >
            <UTextarea
              id="wx-msg"
              v-model="wechatConfig.welcomeMessage"
              :rows="3"
              placeholder="新用户关注公众号时自动发送的消息"
              class="resize-none w-full"
            />
          </div>
        </div>
      </div>

      <!-- 服务器配置 -->
      <div>
        <h4
          class="text-sm font-medium text-muted pb-2 mb-4 border-b border-muted"
        >
          服务器配置（微信公众平台填写）
        </h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-muted text-sm mb-2">URL（复制使用）</label>
            <UInput
              :model-value="
                wechatOrigin ? `${wechatOrigin}/api/wechat` : '/api/wechat'
              "
              readonly
              class="w-full"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="ghost"
                  square
                  size="sm"
                  icon="i-lucide-copy"
                  title="复制 URL"
                  aria-label="复制 URL"
                  @click="
                    copyText(
                      wechatOrigin
                        ? `${wechatOrigin}/api/wechat`
                        : '/api/wechat',
                      'URL',
                    )
                  "
                />
              </template>
            </UInput>
            <p class="text-color-500 text-xs mt-1.5">
              服务器必须支持 HTTPS（微信要求）。若域名不同请手动拼接
            </p>
          </div>
          <div>
            <label class="block text-muted text-sm mb-2">Token（同上）</label>
            <UInput
              :model-value="wechatConfig.token"
              readonly
              class="font-mono w-full"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="ghost"
                  square
                  size="sm"
                  icon="i-lucide-copy"
                  title="复制 Token"
                  aria-label="复制 Token"
                  @click="copyText(wechatConfig.token, 'Token')"
                />
              </template>
            </UInput>
          </div>
        </div>
      </div>

      <!-- 验证文件上传 -->
      <div>
        <h4
          class="text-sm font-medium text-muted pb-2 mb-4 border-b border-muted"
        >
          微信公众号验证文件
        </h4>
        <div class="p-4 bg-elevated border border-muted rounded-lg mb-4">
          <p class="text-sm leading-relaxed">
            微信公众平台在填写服务器 URL 时会要求上传一个
            <code
              class="px-1.5 py-0.5 rounded bg-accented font-mono text-xs break-all"
              >MP_verify_*.txt</code
            >
            到网站根目录验证所有权。请按以下步骤操作：
          </p>
          <ol
            class="mt-2 text-sm text-muted list-decimal list-inside space-y-1"
          >
            <li>在微信公众平台下载 MP_verify_*.txt 验证文件</li>
            <li>点击下方「选择文件」上传 TXT 内容到数据库</li>
            <li>
              上传成功后可通过
              <code
                class="px-1.5 py-0.5 rounded bg-accented font-mono text-xs break-all"
                >域名/MP_verify_xxx.txt</code
              >
              直接访问
            </li>
            <li>返回微信公众平台点击「验证」即可</li>
          </ol>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <UButton
            as="label"
            color="neutral"
            variant="soft"
            icon="i-lucide-upload"
            class="cursor-pointer"
          >
            选择 TXT 文件
            <input
              ref="wechatVerifyFileInput"
              type="file"
              accept=".txt"
              class="hidden"
              @change="onPickWechatVerifyFile"
            />
          </UButton>
          <div class="text-sm text-muted min-w-0">
            <template v-if="wechatVerifyFile">
              已选择：{{ wechatVerifyFile.name }}
            </template>
            <template v-else
              >未选择（仅支持
              <code class="font-mono">.txt</code> 格式）</template
            >
          </div>
          <UButton
            icon="i-lucide-upload"
            :loading="wechatVerifyUploading"
            :disabled="!wechatVerifyFile || wechatVerifyUploading"
            @click="uploadWechatVerifyFile"
          >
            {{ wechatVerifyUploading ? "上传中..." : "上传验证文件" }}
          </UButton>
        </div>

        <UAlert
          v-if="wechatConfig.verifyFileName"
          class="mt-4"
          title="验证文件已上传，可通过以下地址访问："
          :description="`${wechatOrigin}/${wechatConfig.verifyFileName}`"
          icon="i-lucide-check"
          orientation="horizontal"
          color="success"
          :actions="[
            {
              label: '新标签打开',
              icon: 'i-lucide-external-link',
              color: 'neutral',
              target: '_blank',
              to: `${wechatOrigin}/${wechatConfig.verifyFileName}`,
            },
          ]"
          :ui="{
            description: 'break-all',
          }"
        />
      </div>

      <!-- 注意事项 -->
      <div class="p-4 bg-elevated border border-muted rounded-lg">
        <h5 class="text-sm font-medium text-muted mb-2">注意事项</h5>
        <ul class="text-sm list-disc list-inside space-y-1">
          <li>服务器必须支持 HTTPS（微信要求）且域名已备案</li>
          <li>
            首次配置时，微信会发送 GET 请求校验签名，请先填写 Token 并保存
          </li>
          <li>搜索结果同时来自「资源」与「音乐」，支持中文分词检索</li>
          <li>
            消息加解密：若填写了
            EncodingAESKey，可在微信公众平台选择「安全模式」
          </li>
        </ul>
      </div>
    </UCard>
  </section>
</template>
