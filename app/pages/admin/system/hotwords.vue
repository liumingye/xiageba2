<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { TrendingUp } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "热搜词配置",
});

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

interface HotWord {
  word: string;
  weight: number;
  type: "music" | "resource";
}

const hotwords = ref<HotWord[]>([]);
const savingHotwords = ref(false);
const savedHotwords = ref(false);

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
  await loadHotwordsConfig();
  loading.value = false;
});

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
</script>

<template>
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
</template>
