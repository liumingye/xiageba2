<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Key } from "@lucide/vue";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "加密配置",
});

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

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
  await loadAesConfig();
  loading.value = false;
});

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
</script>

<template>
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
</template>
