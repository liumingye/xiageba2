<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { Key, ShieldCheck } from "@lucide/vue";
import { get, post } from "~/utils/request";
import { loadScriptOnce } from "~/utils/loadScript";

useSeoMeta({
  title: "安全配置",
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

// ============ BOT 防御配置 ============

interface BotDefenseConfig {
  captchaType: string;
  siteKey: string;
  secretKey: string;
  protectedApis: string[];
  verifyTtlMinutes: number;
}

interface ProviderMeta {
  type: string;
  label: string;
  scriptUrl: string;
  siteKeyLabel: string;
  secretKeyLabel: string;
}

interface ApiMeta {
  path: string;
  label: string;
  description?: string;
}

const DEFAULT_BOT_CONFIG: BotDefenseConfig = {
  captchaType: "none",
  siteKey: "",
  secretKey: "",
  protectedApis: [],
  verifyTtlMinutes: 60,
};

const botConfig = ref<BotDefenseConfig>({ ...DEFAULT_BOT_CONFIG });
const providers = ref<ProviderMeta[]>([]);
const apiOptions = ref<ApiMeta[]>([]);
const savingBot = ref(false);
const savedBot = ref(false);
const botSaveError = ref("");

const currentProvider = computed(() =>
  providers.value.find((p) => p.type === botConfig.value.captchaType),
);

const captchaTypeOptions = computed(() => [
  { label: "无（关闭 BOT 防御）", value: "none" },
  ...providers.value.map((p) => ({ label: p.label, value: p.type })),
]);

const toggleApi = (path: string, checked: boolean) => {
  const set = new Set(botConfig.value.protectedApis);
  if (checked) set.add(path);
  else set.delete(path);
  botConfig.value.protectedApis = [...set];
};

const loadBotDefense = async () => {
  const data = await get("/api/admin/config/bot-defense");
  botConfig.value = { ...DEFAULT_BOT_CONFIG, ...(data.data || {}) };
  botConfig.value.protectedApis = Array.isArray(botConfig.value.protectedApis)
    ? botConfig.value.protectedApis
    : [];
  providers.value = data.providers || [];
  apiOptions.value = data.apis || [];
};

const saveBotDefense = async () => {
  savingBot.value = true;
  savedBot.value = false;
  botSaveError.value = "";
  try {
    await post("/api/admin/config/bot-defense", {
      captchaType: botConfig.value.captchaType,
      siteKey: botConfig.value.siteKey,
      secretKey: botConfig.value.secretKey,
      protectedApis: botConfig.value.protectedApis,
      verifyTtlMinutes: botConfig.value.verifyTtlMinutes,
    });
    savedBot.value = true;
    setTimeout(() => {
      savedBot.value = false;
    }, 2000);
  } catch (e: any) {
    botSaveError.value =
      e?.response?.data?.message || e?.message || "保存失败，请检查配置";
  } finally {
    savingBot.value = false;
  }
};

// ---- 验证码实时预览 ----
const previewRef = ref<HTMLElement | null>(null);
const previewError = ref("");

const previewReady = computed(
  () =>
    botConfig.value.captchaType !== "none" && !!botConfig.value.siteKey.trim(),
);

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const GEETEST4_SCRIPT = "https://static.geetest.com/v4/gt4.js";

let previewTurnstileId: string | null = null;
let previewGeetest: any = null;

function destroyPreview() {
  try {
    if (previewTurnstileId !== null) {
      (window as any).turnstile?.remove(previewTurnstileId);
      previewTurnstileId = null;
    }
    if (previewGeetest) {
      previewGeetest.destroy?.();
      previewGeetest = null;
    }
  } catch {
    // 忽略销毁异常
  }
  if (previewRef.value) previewRef.value.innerHTML = "";
}

async function renderPreview() {
  destroyPreview();
  previewError.value = "";
  const el = previewRef.value;
  if (!el || !previewReady.value) return;

  const siteKey = botConfig.value.siteKey.trim();
  try {
    if (botConfig.value.captchaType === "turnstile") {
      await loadScriptOnce(TURNSTILE_SCRIPT);
      const w = window as any;
      if (!w.turnstile) throw new Error("Turnstile 脚本未加载完成");
      previewTurnstileId = w.turnstile.render(el, { sitekey: siteKey });
    } else if (botConfig.value.captchaType === "geetest4") {
      await loadScriptOnce(GEETEST4_SCRIPT);
      const w = window as any;
      if (typeof w.initGeetest4 !== "function") {
        throw new Error("极验脚本未加载完成");
      }
      w.initGeetest4({ captchaId: siteKey, product: "float" }, (captcha: any) => {
        previewGeetest = captcha;
        captcha.appendTo(el);
      });
    }
  } catch (e: any) {
    previewError.value = e?.message || "验证码预览加载失败";
  }
}

// 密钥 / 类型变化后防抖刷新预览
let previewTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  [() => botConfig.value.captchaType, () => botConfig.value.siteKey],
  () => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      renderPreview();
    }, 600);
  },
);

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
  await Promise.all([loadAesConfig(), loadBotDefense()]);
  loading.value = false;
  renderPreview();
});

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer);
  destroyPreview();
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

  <!-- BOT 防御配置 -->
  <section>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">BOT 防御</h2>
      <UButton
        color="primary"
        :icon="savedBot ? 'i-lucide-check' : 'i-lucide-save'"
        :loading="savingBot"
        :disabled="savingBot || loading"
        @click="saveBotDefense"
      >
        {{ savedBot ? "已保存" : "保存" }}
      </UButton>
    </div>
    <UCard>
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 shrink-0 bg-emerald-600 rounded-lg flex items-center justify-center"
        >
          <ShieldCheck class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-medium">人机验证（验证码）</h3>
          <p class="text-color-500 text-sm">
            为指定接口启用人机验证，防止脚本滥用；验证通过后在有效期内免重复验证
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <!-- 验证码类型 -->
        <div>
          <label class="block text-muted text-sm mb-2" for="bot-captcha-type"
            >验证码类型</label
          >
          <USelect
            id="bot-captcha-type"
            v-model="botConfig.captchaType"
            value-key="value"
            :items="captchaTypeOptions"
            class="w-full"
          />
        </div>

        <template v-if="botConfig.captchaType !== 'none'">
          <!-- 网站密钥 -->
          <div>
            <label class="block text-muted text-sm mb-2" for="bot-site-key">{{
              currentProvider?.siteKeyLabel || "网站密钥"
            }}</label>
            <UInput
              id="bot-site-key"
              v-model="botConfig.siteKey"
              type="text"
              :placeholder="
                botConfig.captchaType === 'geetest4'
                  ? '极验 Captcha ID'
                  : 'Turnstile Site Key'
              "
              class="font-mono text-xs w-full"
            />
          </div>

          <!-- 平台密钥 -->
          <div>
            <label class="block text-muted text-sm mb-2" for="bot-secret-key">{{
              currentProvider?.secretKeyLabel || "平台密钥 (SecretKey)"
            }}</label>
            <UInput
              id="bot-secret-key"
              v-model="botConfig.secretKey"
              type="password"
              placeholder="仅服务端使用，请妥善保管"
              class="font-mono text-xs w-full"
            />
          </div>

          <!-- 验证码预览 -->
          <div>
            <label class="block text-muted text-sm mb-2">验证码预览</label>
            <div
              class="rounded-lg border border-default bg-gray-50 dark:bg-gray-900 p-4"
            >
              <p
                v-if="!previewReady"
                class="text-muted text-sm text-center py-4"
              >
                填写网站密钥后此处将展示验证码实际效果
              </p>
              <template v-else>
                <div ref="previewRef" class="flex justify-center min-h-16"></div>
                <p v-if="previewError" class="text-red-500 text-sm text-center mt-2">
                  {{ previewError }}
                </p>
                <p class="text-muted text-xs mt-2">
                  预览需当前域名已在对应平台的后台添加为合法域名
                </p>
              </template>
            </div>
          </div>
        </template>

        <!-- 受保护接口（多选） -->
        <div>
          <label class="block text-muted text-sm mb-2">需要验证的接口</label>
          <div class="space-y-2">
            <label
              v-for="api in apiOptions"
              :key="api.path"
              class="flex items-start gap-3 rounded-lg border border-default p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <UCheckbox
                :model-value="botConfig.protectedApis.includes(api.path)"
                @update:model-value="
                  (v: boolean | 'indeterminate') =>
                    toggleApi(api.path, v === true)
                "
              />
              <div>
                <p class="text-sm font-medium">{{ api.label }}</p>
                <p class="text-muted text-xs font-mono">{{ api.path }}</p>
                <p v-if="api.description" class="text-muted text-xs">
                  {{ api.description }}
                </p>
              </div>
            </label>
            <p v-if="apiOptions.length === 0" class="text-muted text-sm">
              暂无可用接口
            </p>
          </div>
        </div>

        <!-- 验证有效时间 -->
        <div>
          <label class="block text-muted text-sm mb-2" for="bot-ttl"
            >验证有效时间（分钟）</label
          >
          <UInputNumber
            id="bot-ttl"
            v-model="botConfig.verifyTtlMinutes"
            :min="1"
            :max="1440"
            class="w-full"
          />
          <p class="text-muted text-xs mt-1">
            用户通过验证后，该时间内访问受保护接口无需重新验证，过期后需重新验证（1-1440）
          </p>
        </div>

        <p
          v-if="botSaveError"
          class="text-red-500 text-sm"
        >
          {{ botSaveError }}
        </p>
      </div>
    </UCard>
  </section>
</template>
