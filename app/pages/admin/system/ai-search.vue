<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Sparkles } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "AI 搜索配置",
});

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

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
  await loadAiSearchConfig();
  loading.value = false;
});

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
</script>

<template>
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
</template>
