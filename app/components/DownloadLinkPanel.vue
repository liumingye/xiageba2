<script setup lang="ts">
import { QrCode, Clipboard, ExternalLink, X } from "@lucide/vue";
import {
  useClipboard,
  useMediaQuery,
  refAutoReset,
  useScrollLock,
} from "@vueuse/core";
import { getStorageTypeFriend } from "#shared/utils";

interface Props {
  /** 是否以弹窗（Teleport + 遮罩 + Transition）方式渲染 */
  asModal?: boolean;
  /** 弹窗标题（仅 asModal=true 生效） */
  modalTitle?: string;
  /** 面板内显示的资源标题（二维码/链接上方展示的资源名） */
  title?: string;
  /** 下载直链 */
  url?: string;
  /** 二维码 dataURL，未传则自动在 url 变更时生成 */
  qrCode?: string;
  /** 是否处于加载中 */
  loading?: boolean;
  /** 错误文案 */
  error?: string;
  /** 移动端是否隐藏二维码（默认 true；内嵌详情页建议传 false 始终显示） */
  hideQrOnMobile?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  asModal: true,
  modalTitle: "获取下载链接",
  title: "",
  url: "",
  qrCode: "",
  loading: false,
  error: "",
  hideQrOnMobile: true,
});

const emit = defineEmits<{
  /** asModal=true 时，点击遮罩或关闭按钮触发 */
  (e: "close"): void;
  /** 点击"复制链接"并复制成功后触发，父组件可做额外逻辑（可选） */
  (e: "copied", payload: { url: string }): void;
}>();

// v-model:open 支持（弹窗模式）
const open = defineModel<boolean>("open", { default: false });

// ---------------- 内部状态：二维码自动生成 ----------------
const innerQrCode = ref("");
const resolvedQr = computed(() => props.qrCode || innerQrCode.value);

watch(
  () => props.url,
  async (next) => {
    if (props.qrCode) {
      innerQrCode.value = "";
      return;
    }
    if (!next) {
      innerQrCode.value = "";
      return;
    }
    try {
      const qrcode = await import("qrcode");
      innerQrCode.value = await qrcode.toDataURL(next, {
        width: 200,
        margin: 2,
        color: { dark: "#000", light: "#fff" },
      });
    } catch {
      innerQrCode.value = "";
    }
  },
  { immediate: true },
);

let disposeFunny: (() => void) | null = null;
const innerFunnyText = ref("");

// 注意：watch 源直接传原始值即可。若写成 () => [props.loading]，
// 每次求值都返回新数组引用，会导致 watch 在每次渲染后都触发。
watch(
  () => props.loading,
  (loading, __, onCleanup) => {
    onCleanup(() => {
      if (disposeFunny) {
        disposeFunny();
        disposeFunny = null;
      }
    });
    if (loading && !disposeFunny) {
      const { currentText, start, stop } = useFunnyLoading();
      if (!currentText.value) return;
      start();
      innerFunnyText.value = currentText.value;
      const stopWatcher = watch(currentText, (t) => {
        if (!t) return;
        innerFunnyText.value = t;
      });
      disposeFunny = () => {
        stopWatcher();
        stop();
      };
    } else if (!loading && disposeFunny) {
      disposeFunny();
      disposeFunny = null;
    }
  },
  { immediate: true, flush: "post" },
);

onBeforeUnmount(() => {
  if (disposeFunny) {
    disposeFunny();
    disposeFunny = null;
  }
});

const displayFunnyText = computed(() => innerFunnyText.value || "");

// ---------------- 衍生状态 ----------------
const { success, error: showError } = useToast();
const { copy } = useClipboard();
const isLocked = useScrollLock(window);

const storageTypeName = computed(() =>
  props.url ? getStorageTypeFriend(props.url) : "",
);

const isMobile = useMediaQuery("(max-width: 767px)");
const shouldShowQr = computed(() => {
  if (props.hideQrOnMobile && isMobile.value) return false;
  return true;
});

const message = refAutoReset("复制链接", 3000);

const handleCopyUrl = async () => {
  if (!props.url) return;
  try {
    await copy(props.url);
    message.value = "复制成功";
    success("复制成功");
    emit("copied", { url: props.url });
  } catch {
    message.value = "复制失败";
    showError("复制失败");
  }
};

const closeModal = () => {
  open.value = false;
  emit("close");
};

watch(
  () => open.value,
  (next) => {
    if (next) {
      isLocked.value = true;
    } else {
      isLocked.value = false;
    }
  },
);
</script>

<template>
  <!-- ============================================================ -->
  <!-- 弹窗模式：Teleport + Transition + 遮罩 + 头部关闭按钮       -->
  <!-- ============================================================ -->
  <Teleport v-if="asModal" to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
        @click.self="closeModal"
      >
        <div
          class="flex flex-col max-h-[85vh] modal-content bg-color-100 rounded-xl max-w-xl w-full border border-color-300 shadow-2xl overflow-hidden"
        >
          <div
            class="flex items-center justify-between py-2 px-3 border-b border-color-300"
          >
            <h3 class="text-color-300 font-medium">{{ modalTitle }}</h3>
            <button
              class="text-color-400 transition-all opacity-80 hover:opacity-100 hover:bg-color-300 rounded-md p-2"
              type="button"
              @click="closeModal"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="p-4 h-full overflow-auto">
            <!-- 加载 -->
            <div v-if="loading" class="text-center py-8">
              <div
                class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
              />
              <p class="text-color-400 text-sm">
                {{ displayFunnyText || "加载中..." }}
                <br />请耐心等待，这可能需要几秒钟
              </p>
            </div>
            <!-- 错误 -->
            <div v-else-if="error" class="text-center py-8">
              <p class="text-red-400 text-sm">{{ error }}</p>
            </div>
            <!-- 结果 -->
            <div v-else-if="url" class="space-y-4">
              <div class="flex flex-col items-center gap-4">
                <template
                  v-if="
                    shouldShowQr &&
                    storageTypeName !== '磁力链接' &&
                    storageTypeName !== '其他链接'
                  "
                >
                  <span
                    >可使用
                    <span class="text-primary-500">
                      {{ storageTypeName }}
                    </span>
                    APP 扫码获取</span
                  >
                  <div v-if="resolvedQr" class="flex-shrink-0 border border-color-300 rounded-lg">
                    <img
                      :src="resolvedQr"
                      alt="下载链接二维码"
                      class="w-60 h-auto rounded-lg"
                    />
                  </div>
                  <div
                    v-else
                    class="w-28 h-28 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <QrCode class="w-10 h-10 text-zinc-600" />
                  </div>
                </template>
                <p
                  class="w-full font-medium text-center text-lg line-clamp-5"
                  :class="{ truncate: shouldShowQr }"
                >
                  {{ title }}
                </p>
                <p class="text-center break-all">
                  资源地址：<a
                    :href="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary-500"
                    >{{ url }}</a
                  >
                </p>
                <div class="w-full flex items-center justify-center gap-2">
                  <button
                    class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border h-9 px-4 py-2 flex-1 border-primary-600 bg-primary-800/10 hover:bg-primary-800/30 text-green-600"
                    type="button"
                    @click="handleCopyUrl"
                  >
                    <Clipboard class="w-4 h-4" />
                    {{ message }}
                  </button>
                  <a
                    :href="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all h-9 px-4 py-2 flex-1 bg-primary-600 hover:bg-primary-700 text-white"
                  >
                    <ExternalLink class="w-4 h-4" />
                    打开链接
                  </a>
                </div>
                <p class="text-xs text-gray-500 text-center">
                  网盘链接有效期为30分钟，请及时转存，失效后可重新获取。<br />
                  文件内容请自行辨别，如发现违规请通过<a
                    href="/page/version"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary-500"
                    >版权说明</a
                  >联系我们删除。本站仅供学习交流，无任何收费行为。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ============================================================ -->
  <!-- 内嵌模式：直接渲染内容（无遮罩/关闭按钮/标题栏）            -->
  <!-- ============================================================ -->
  <template v-else>
    <!-- 加载 -->
    <div v-if="loading" class="text-center py-8">
      <div
        class="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3"
      />
      <p class="text-color-400 text-sm">
        {{ displayFunnyText || "加载中..." }}
        <br />请耐心等待，这可能需要几秒钟
      </p>
    </div>
    <!-- 错误 -->
    <div v-else-if="error" class="text-center py-8">
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
    <!-- 结果 -->
    <div v-else-if="url" class="space-y-4">
      <div class="flex flex-col items-center gap-4">
        <template
          v-if="
            storageTypeName !== '磁力链接' && storageTypeName !== '其他链接'
          "
        >
          <template v-if="shouldShowQr">
            <span
              >可使用
              <span class="text-primary-500">
                {{ storageTypeName }}
              </span>
              APP 扫码获取</span
            >
            <div v-if="resolvedQr" class="flex-shrink-0 border border-color-300 rounded-lg">
              <img
                :src="resolvedQr"
                alt="下载链接二维码"
                class="w-60 h-auto rounded-lg"
              />
            </div>
            <div
              v-else
              class="w-28 h-28 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0"
            >
              <QrCode class="w-10 h-10 text-zinc-600" />
            </div>
          </template>
          <p
            class="w-full font-medium text-center text-lg line-clamp-5"
            :class="{ truncate: shouldShowQr }"
          >
            {{ title }}
          </p>
        </template>
        <p class="text-center break-all">
          资源地址：<a
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-500"
            >{{ url }}</a
          >
        </p>
        <div class="w-full flex items-center justify-center gap-2">
          <button
            class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all border h-9 px-4 py-2 flex-1 border-primary-600 bg-primary-800/10 hover:bg-primary-800/30 text-green-600"
            type="button"
            @click="handleCopyUrl"
          >
            <Clipboard class="w-4 h-4" />
            {{ message }}
          </button>
          <a
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all h-9 px-4 py-2 flex-1 bg-primary-600 hover:bg-primary-700 text-white"
          >
            <ExternalLink class="w-4 h-4" />
            打开链接
          </a>
        </div>
        <p class="text-xs text-gray-500 text-center">
          网盘链接有效期为30分钟，请及时转存，失效后可重新获取。<br />
          文件内容请自行辨别，如发现违规请通过<a
            href="/page/version"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-500"
            >版权说明</a
          >联系我们删除。本站仅供学习交流，无任何收费行为。
        </p>
      </div>
    </div>
  </template>
</template>

<style scoped>
.modal-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.modal-content {
  will-change: opacity, transform;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(-8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.985) translateY(0);
}
</style>
