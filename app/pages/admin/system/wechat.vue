<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "~/composables/useAuth";
import { MessageSquare } from "@lucide/vue";
import { useClipboard } from "@vueuse/core";
import { get, post } from "~/utils/request";

useSeoMeta({
  title: "微信公众号配置",
});

const toast = useToast();
const { copy: copyToClipboard } = useClipboard();

const router = useRouter();
const { isLoggedIn, checkLogin, initialized } = useAuth();

const loading = ref(true);

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
  await loadWechatConfig();
  // 构造回调地址域名（仅用于显示复制）
  if (typeof window !== "undefined") {
    wechatOrigin.value = window.location.origin;
  }
  loading.value = false;
});
</script>

<template>
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
