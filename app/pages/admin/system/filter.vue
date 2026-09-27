<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { ShieldAlert, Filter } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "过滤配置",
});

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

interface WebSearchFilterConfig {
  websearch_filter_keywords: string;
}
const webSearchFilterConfig = ref<WebSearchFilterConfig>({
  websearch_filter_keywords: "",
});
const savingWebSearchFilter = ref(false);
const savedWebSearchFilter = ref(false);

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
  await loadWebSearchFilterConfig();
  await loadAdFilterConfig();
  loading.value = false;
});

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
</script>

<template>
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
</template>
