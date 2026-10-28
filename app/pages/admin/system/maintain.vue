<script setup lang="ts">
import { getApiErrorMessage } from "~/utils/apiError";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useIntervalFn } from "@vueuse/core";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "系统维护",
});

const router = useRouter();

const isRebuilding = ref(false);
const rebuildMsg = ref("");
const isClearing = ref(false);
const clearMsg = ref("");

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
    clearMsg.value = getApiErrorMessage(err, "请求失败");
  } finally {
    isClearing.value = false;
  }
};

// ============ 生命周期 ============

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

</template>
