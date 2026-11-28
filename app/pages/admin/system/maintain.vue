<script setup lang="ts">
import { getApiErrorMessage } from "~/utils/apiError";
import { computed, onMounted, reactive, ref } from "vue";
import { useIntervalFn } from "@vueuse/core";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "系统维护",
});

// ============ 服务状态 ============

type ServiceStatus = "up" | "down" | "unconfigured" | "unknown";

interface ServiceResult {
  status: ServiceStatus;
  version: string | null;
  latencyMs: number | null;
  message: string | null;
  fullVersion?: string | null;
}

interface ServicesSnapshot {
  checkedAt: string;
  postgres: ServiceResult;
  redis: ServiceResult;
}

const SERVICE_BADGE: Record<
  ServiceStatus,
  { color: "success" | "error" | "neutral" | "warning"; label: string }
> = {
  up: { color: "success", label: "正常" },
  down: { color: "error", label: "异常" },
  unconfigured: { color: "neutral", label: "未配置" },
  unknown: { color: "warning", label: "未知" },
};

const services = ref<ServicesSnapshot | null>(null);
const servicesLoading = ref(false);
const servicesError = ref("");

const serviceRows = computed(() => [
  { name: "PostgreSQL", result: services.value?.postgres },
  { name: "Redis", result: services.value?.redis },
]);

const loadServices = async () => {
  servicesLoading.value = true;
  servicesError.value = "";
  try {
    services.value = await get<ServicesSnapshot>("/api/admin/system/services");
  } catch (err) {
    servicesError.value = getApiErrorMessage(err, "获取服务状态失败");
  } finally {
    servicesLoading.value = false;
  }
};

const formatLatency = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? "-" : `${ms} ms`;

const formatCheckedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });

// ============ 运行时 ============

interface RuntimeSnapshot {
  collectedAt: string;
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
    nodeEnv: string | undefined;
  };
  memory: {
    rss: number;
    heapUsed: number;
    external: number;
    native: number | null;
    gcRan: boolean;
    gcReclaimedMB: number;
    note?: string;
  };
  heap: { limit: number; used: number; usageRatio: number };
  host: { totalMem: number; freeMem: number };
  deltaFromLastCall: { elapsedSeconds: number; heapUsedDeltaMB: number } | null;
  verdict: string[];
}

const runtime = ref<RuntimeSnapshot | null>(null);
const runtimeLoading = ref(false);
const runtimeError = ref("");
const runtimeGcMsg = ref("");

const loadRuntime = async (gc = false) => {
  runtimeLoading.value = true;
  runtimeError.value = "";
  runtimeGcMsg.value = "";
  try {
    const data = await get<RuntimeSnapshot>(
      `/api/admin/system/memory${gc ? "?gc=1" : ""}`,
    );
    runtime.value = data;
    if (gc) {
      runtimeGcMsg.value = data.memory.gcRan
        ? `已强制 GC，回收 ${data.memory.gcReclaimedMB} MB`
        : data.memory.note || "已请求 GC 但未能执行";
    }
  } catch (err) {
    runtimeError.value = getApiErrorMessage(err, "获取运行时信息失败");
  } finally {
    runtimeLoading.value = false;
  }
};

const forceGc = async () => {
  if (
    !confirm(
      "确定要强制执行一次 GC 再采样吗？\n进程会短暂停顿，用于区分「惰性 GC」与「真实内存占用」。",
    )
  )
    return;
  await loadRuntime(true);
};

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d} 天 ${h} 小时 ${m} 分`;
  if (h > 0) return `${h} 小时 ${m} 分 ${s} 秒`;
  return `${m} 分 ${s} 秒`;
};

const formatMB = (mb: number | null | undefined) => {
  if (mb === null || mb === undefined) return "-";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
};

// ============ 搜索索引 ============

type IndexKey = "music" | "source";
type IndexStatus = "unknown" | "idle" | "starting" | "running";

interface IndexState {
  status: IndexStatus;
  current: number;
  message: string;
  tone: "success" | "error" | "";
  // 本页启动任务的时间戳；0 表示非本页启动
  localStartedAt: number;
}

interface RebuildStatusResponse {
  status: "idle" | "running" | "done" | "error";
  current?: number;
  message?: string;
}

const initState = (): IndexState => ({
  status: "unknown",
  current: 0,
  message: "",
  tone: "",
  localStartedAt: 0,
});

const INDEXES: { key: IndexKey; name: string; title: string; desc: string }[] = [
  {
    key: "music",
    name: "音乐",
    title: "重建音乐搜索向量",
    desc: "使用 jieba 分词重新生成所有音乐的搜索向量，用于全文搜索",
  },
  {
    key: "source",
    name: "资源",
    title: "重建资源搜索向量",
    desc: "使用 jieba 分词重新生成所有资源的搜索向量，用于全文搜索",
  },
];

const indexState = reactive<Record<IndexKey, IndexState>>({
  music: initState(),
  source: initState(),
});

// 服务端在第一批处理完成后才写入 running 状态，这期间状态接口返回的是 idle；
// 本页刚启动的任务在这个宽限期内不能把 idle 当作空闲，否则运行中会重新出现按钮
const LOCAL_START_GRACE_MS = 60_000;

const applyStatus = (key: IndexKey, data: RebuildStatusResponse) => {
  const s = indexState[key];

  if (data.status === "running") {
    s.status = "running";
    s.current = data.current ?? 0;
    s.message = `服务器正在疯狂分批处理中... 目前已完成: ${s.current} 条`;
    return;
  }

  if (data.status === "done") {
    s.status = "idle";
    s.localStartedAt = 0;
    s.tone = "success";
    s.message = `🎉 全文索引重建圆满完成！共处理 ${data.current ?? 0} 条`;
    return;
  }

  if (data.status === "error") {
    s.status = "idle";
    s.localStartedAt = 0;
    s.tone = "error";
    s.message = data.message || "全文索引重建失败";
    return;
  }

  // idle
  if (s.status === "starting" || s.status === "running") {
    if (
      s.localStartedAt > 0 &&
      Date.now() - s.localStartedAt < LOCAL_START_GRACE_MS
    ) {
      s.status = "running";
      s.message = "任务已启动，等待首批处理结果...";
      return;
    }
    s.status = "idle";
    s.localStartedAt = 0;
    s.tone = "error";
    s.message = "任务已不在运行，但未读到完成状态，请查看服务器日志";
    return;
  }

  s.status = "idle";
};

const checking: Record<IndexKey, boolean> = { music: false, source: false };

const checkIndex = async (key: IndexKey) => {
  if (checking[key]) return;
  checking[key] = true;
  try {
    const data = await get<RebuildStatusResponse>(
      `/api/admin/${key}/rebuild-status`,
    );
    applyStatus(key, data);
  } catch {
    // 网络波动不打断轮询；初始状态查询失败时保持 unknown
  } finally {
    checking[key] = false;
    syncPolling();
  }
};

// 单个定时器，每个 tick 只查处于运行中的索引（组件卸载时自动清理）
const poll = useIntervalFn(
  () =>
    Promise.allSettled(
      INDEXES.filter((i) => indexState[i.key].status === "running").map((i) =>
        checkIndex(i.key),
      ),
    ),
  2000,
  { immediate: false },
);

const syncPolling = () => {
  if (INDEXES.some((i) => indexState[i.key].status === "running")) {
    poll.resume();
  } else {
    poll.pause();
  }
};

const rebuildSearch = async (all: boolean, key: IndexKey) => {
  const s = indexState[key];
  if (s.status !== "idle") return;

  const idx = INDEXES.find((i) => i.key === key)!;
  if (
    !confirm(
      `确定要重建${all ? "所有" : "没有索引的"}${idx.name}的搜索向量吗？\n这将使用 jieba 分词重新生成搜索向量。`,
    )
  )
    return;

  s.status = "starting";
  s.tone = "";
  s.localStartedAt = Date.now();
  s.message = "正在启动后台任务...";

  try {
    const data = await post(`/api/admin/${key}/rebuild-search`, { all });
    if (data.success) {
      s.status = "running";
    } else {
      s.status = "idle";
      s.localStartedAt = 0;
      s.tone = "error";
      s.message = data.message || "启动失败";
    }
  } catch (err: any) {
    if (err?.response?.status === 423) {
      // 服务端锁已持有：同类型任务在运行（例如另一个页面启动的），转入运行中跟踪
      s.status = "running";
      s.message = getApiErrorMessage(err, "已有任务在运行中");
    } else {
      s.status = "idle";
      s.localStartedAt = 0;
      s.tone = "error";
      s.message = getApiErrorMessage(err, "请求失败");
    }
  }

  syncPolling();
  if (s.status === "running") checkIndex(key);
};

const messageClass = (key: IndexKey) => {
  const tone = indexState[key].tone;
  if (tone === "success") return "text-success";
  if (tone === "error") return "text-error";
  return "text-primary-400";
};

// ============ Nitro 缓存 ============

const isClearing = ref(false);
const clearMsg = ref("");

const clearISRCache = async () => {
  if (isClearing.value) return;
  if (!confirm(`确定要清理 全部缓存吗？`)) return;

  isClearing.value = true;
  clearMsg.value = "";
  try {
    const data = await post("/api/admin/cache/clear");
    clearMsg.value = `已清理全部缓存，共 ${data.total} 项`;
  } catch (err: any) {
    clearMsg.value = getApiErrorMessage(err, "请求失败");
  } finally {
    isClearing.value = false;
  }
};

// ============ 生命周期 ============

onMounted(() => {
  loadServices();
  loadRuntime();
  INDEXES.forEach((i) => checkIndex(i.key));
});
</script>

<template>
  <!-- 服务状态 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">服务状态</h2>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :loading="servicesLoading"
        :disabled="servicesLoading"
        @click="loadServices()"
      >
        刷新
      </UButton>
    </div>
    <div v-if="servicesError" class="text-sm text-error mb-4">
      {{ servicesError }}
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="svc in serviceRows" :key="svc.name">
        <div class="flex items-center justify-between gap-3">
          <div class="font-medium">{{ svc.name }}</div>
          <UBadge
            v-if="svc.result"
            :color="SERVICE_BADGE[svc.result.status].color"
            variant="soft"
            class="w-16 justify-center"
          >
            {{ SERVICE_BADGE[svc.result.status].label }}
          </UBadge>
        </div>
        <div class="mt-4 space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">版本</span>
            <span class="text-right" :title="svc.result?.fullVersion ?? undefined">
              {{ svc.result?.version ?? "-" }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">延迟</span>
            <span>{{ formatLatency(svc.result?.latencyMs) }}</span>
          </div>
        </div>
        <div
          v-if="svc.result?.message"
          class="text-sm text-muted mt-3 break-all"
        >
          {{ svc.result.message }}
        </div>
      </UCard>
    </div>
    <div v-if="services" class="text-sm text-muted mt-4">
      最近检查：{{ formatCheckedAt(services.checkedAt) }}
    </div>
    <div v-else-if="servicesLoading" class="text-sm text-muted mt-4">
      正在检测服务状态...
    </div>
  </section>

  <!-- 运行时 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">运行时</h2>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-trash-2"
          :disabled="runtimeLoading"
          @click="forceGc()"
        >
          强制 GC
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :loading="runtimeLoading"
          :disabled="runtimeLoading"
          @click="loadRuntime()"
        >
          刷新
        </UButton>
      </div>
    </div>
    <div v-if="runtimeError" class="text-sm text-error mb-4">
      {{ runtimeError }}
    </div>
    <div v-if="runtimeGcMsg" class="text-sm text-primary-400 mb-4">
      {{ runtimeGcMsg }}
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard>
        <div class="font-medium">进程</div>
        <div class="mt-4 space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">Node 版本</span>
            <span>{{ runtime?.process.nodeVersion ?? "-" }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">PID</span>
            <span>{{ runtime?.process.pid ?? "-" }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">运行时长</span>
            <span>
              {{
                runtime ? formatUptime(runtime.process.uptimeSeconds) : "-"
              }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">环境</span>
            <span>{{ runtime?.process.nodeEnv || "-" }}</span>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="font-medium">内存</div>
        <div class="mt-4 space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">RSS</span>
            <span>{{ formatMB(runtime?.memory.rss) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">堆已用 / 上限</span>
            <span>
              <template v-if="runtime">
                {{ runtime.heap.used }} MB / {{ formatMB(runtime.heap.limit) }}
                （{{ Math.round(runtime.heap.usageRatio * 100) }}%）
              </template>
              <template v-else>-</template>
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">External</span>
            <span>{{ formatMB(runtime?.memory.external) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">堆外占用</span>
            <span>{{ formatMB(runtime?.memory.native) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted">主机空闲 / 总内存</span>
            <span>
              <template v-if="runtime">
                {{ formatMB(runtime.host.freeMem) }} /
                {{ formatMB(runtime.host.totalMem) }}
              </template>
              <template v-else>-</template>
            </span>
          </div>
          <div
            v-if="runtime?.deltaFromLastCall"
            class="flex items-center justify-between gap-3 text-muted"
          >
            <span>较上次采样</span>
            <span>
              {{ runtime.deltaFromLastCall.elapsedSeconds }} 秒前，堆
              {{ runtime.deltaFromLastCall.heapUsedDeltaMB >= 0 ? "+" : "" }}
              {{ runtime.deltaFromLastCall.heapUsedDeltaMB }} MB
            </span>
          </div>
        </div>
      </UCard>

      <UCard v-if="runtime?.verdict?.length" class="sm:col-span-2">
        <div class="font-medium">诊断结论</div>
        <ul class="mt-3 space-y-1 text-sm text-muted list-disc list-inside">
          <li v-for="(item, i) in runtime.verdict" :key="i">{{ item }}</li>
        </ul>
      </UCard>
    </div>
    <div v-if="!runtime && runtimeLoading" class="text-sm text-muted mt-4">
      正在获取运行时信息...
    </div>
  </section>

  <!-- 搜索索引 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">搜索索引</h2>
    </div>
    <UCard>
      <div class="space-y-4">
        <div
          v-for="idx in INDEXES"
          :key="idx.key"
          class="flex items-start justify-between flex-wrap gap-3"
        >
          <div>
            <div>{{ idx.title }}</div>
            <div class="text-sm text-muted mt-1">
              {{ idx.desc }}
            </div>
            <div v-if="indexState[idx.key].message" class="text-sm mt-1 min-h-5" :class="messageClass(idx.key)">
              {{ indexState[idx.key].message }}
            </div>
          </div>
          <div class="flex items-center gap-2 min-h-8">
            <template v-if="indexState[idx.key].status === 'idle'">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                @click="rebuildSearch(false, idx.key)"
              >
                重建未重建索引
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                @click="rebuildSearch(true, idx.key)"
              >
                重建所有索引
              </UButton>
            </template>
            <template v-else-if="indexState[idx.key].status === 'unknown'">
              <UBadge color="neutral" variant="soft">
                {{ checking[idx.key] ? "获取状态中..." : "状态未知" }}
              </UBadge>
              <UButton
                v-if="!checking[idx.key]"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="checkIndex(idx.key)"
              >
                重试
              </UButton>
            </template>
            <template v-else>
              <UBadge
                :color="
                  indexState[idx.key].status === 'starting'
                    ? 'neutral'
                    : 'primary'
                "
                variant="soft"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="animate-spin size-3.5"
                />
                {{ indexState[idx.key].status === "starting" ? "启动中" : "运行中" }}
              </UBadge>
            </template>
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
</template>
