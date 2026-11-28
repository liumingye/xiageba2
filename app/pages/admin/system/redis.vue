<script setup lang="ts">
import { getApiErrorMessage } from "~/utils/apiError";
import { ref, onMounted } from "vue";
import { Database } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "Redis 配置",
});

const loading = ref(true);
// 加载失败的原因；非空时页面顶部提示并禁止保存（表单里是默认值，保存会把线上配置覆盖成空）
const loadError = ref("");
const toast = useToast();

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

// ============ 生命周期 ============

const loadRedisConfig = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const data = await get("/api/admin/config/redis");
    redisConfig.value = { ...redisConfig.value, ...data.data };
  } catch (e) {
    loadError.value = getApiErrorMessage(e, "配置加载失败");
  } finally {
    loading.value = false;
  }
};

onMounted(loadRedisConfig);

const saveRedisConfig = async () => {
  savingRedis.value = true;
  savedRedis.value = false;
  try {
    await post("/api/admin/config/redis", redisConfig.value);
    savedRedis.value = true;
    setTimeout(() => {
      savedRedis.value = false;
    }, 2000);
  } catch (e) {
    toast.add({
      title: getApiErrorMessage(e, "保存失败"),
      icon: "i-lucide-x",
      color: "error",
    });
  } finally {
    savingRedis.value = false;
  }
};
</script>

<template>
  <UAlert
    v-if="loadError"
    color="error"
    variant="soft"
    title="配置加载失败"
    :description="loadError"
    class="mb-8"
  >
    <template #actions>
      <UButton
        size="xs"
        color="error"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="loadRedisConfig"
      >
        重试
      </UButton>
    </template>
  </UAlert>

  <!-- Redis 配置 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">Redis 配置</h2>
      <UButton
        color="primary"
        :icon="savedRedis ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingRedis"
        :disabled="savingRedis || loading || !!loadError"
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
</template>
