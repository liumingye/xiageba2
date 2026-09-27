<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Link } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "网盘检测配置",
});

const toast = useToast();

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

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
      const okCount = (data.results || []).filter(
        (r: PancheckHealthResult) => r.ok,
      ).length;
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
  await loadPancheckConfig();
  loading.value = false;
});

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
  // 同步删除对应下标的健康检测结果，避免结果错位
  if (index < pancheckHealthResults.value.length) {
    pancheckHealthResults.value.splice(index, 1);
  }
};
</script>

<template>
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
          <label
            class="flex items-center gap-1.5 text-muted text-sm mb-2"
            :for="`pan-${index}-url`"
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
              <span
                class="text-xs"
                :class="
                  pancheckHealthResults[index].ok
                    ? 'text-green-500'
                    : 'text-red-500'
                "
              >
                {{
                  pancheckHealthResults[index].ok
                    ? `${pancheckHealthResults[index].durationMs}ms`
                    : `${pancheckHealthResults[index].message || pancheckHealthResults[index].status}（${pancheckHealthResults[index].durationMs}ms）`
                }}
              </span>
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
</template>
