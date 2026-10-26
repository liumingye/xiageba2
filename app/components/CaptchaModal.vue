<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { loadScriptOnce } from "~/utils/loadScript";

/**
 * 全局人机验证弹窗（挂在 app.vue，由 captchaFetch 触发）
 * 新增验证码类型时：在此处 renderWidget 分支补一段渲染逻辑，
 * 并在 server/lib/bot-defense.ts 注册对应 Provider。
 */
const { captchaState, closeCaptcha, submitCaptchaToken } = useCaptcha();

const containerRef = ref<HTMLElement | null>(null);

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";
const GEETEST4_SCRIPT = "https://static.geetest.com/v4/gt4.js";

let turnstileWidgetId: string | null = null;
let geetestCaptcha: any = null;

function destroyWidget() {
  try {
    if (turnstileWidgetId !== null) {
      (window as any).turnstile?.remove(turnstileWidgetId);
      turnstileWidgetId = null;
    }
    if (geetestCaptcha) {
      geetestCaptcha.destroy?.();
      geetestCaptcha = null;
    }
  } catch {
    // 组件销毁失败不阻塞流程
  }
  if (containerRef.value) containerRef.value.innerHTML = "";
}

async function renderWidget() {
  destroyWidget();
  const el = containerRef.value;
  if (!el) return;

  const { captchaType, siteKey } = captchaState;
  if (!siteKey) {
    captchaState.error = "验证码密钥未配置，请联系站长";
    return;
  }

  try {
    if (captchaType === "turnstile") {
      await loadScriptOnce(TURNSTILE_SCRIPT);
      const w = window as any;
      if (!w.turnstile) throw new Error("Turnstile 脚本未加载完成");
      turnstileWidgetId = w.turnstile.render(el, {
        sitekey: siteKey,
        callback: (token: string) => {
          submitCaptchaToken(token);
        },
        "expired-callback": () => {
          captchaState.error = "验证已过期，请重新完成验证";
          if (turnstileWidgetId !== null) {
            (window as any).turnstile?.reset(turnstileWidgetId);
          }
        },
        "error-callback": () => {
          captchaState.error = "验证码加载失败，请刷新重试";
        },
      });
    } else if (captchaType === "geetest4") {
      await loadScriptOnce(GEETEST4_SCRIPT);
      const w = window as any;
      if (typeof w.initGeetest4 !== "function") {
        throw new Error("极验脚本未加载完成");
      }
      w.initGeetest4(
        { captchaId: siteKey, product: "popup" },
        (captcha: any) => {
          geetestCaptcha = captcha;
          captcha.appendTo(el);
          captcha.onSuccess(() => {
            const validate = captcha.getValidate();
            if (validate) submitCaptchaToken(validate);
          });
          captcha.onError(() => {
            captchaState.error = "验证码加载失败，请刷新重试";
          });
          captcha.showCaptcha();
        },
      );
    } else {
      captchaState.error = `暂不支持的验证码类型: ${captchaType}`;
    }
  } catch (e: any) {
    captchaState.error = e?.message || "验证码加载失败";
  }
}

watch(
  () => captchaState.visible,
  async (visible) => {
    if (visible) {
      await nextTick();
      // UModal 内容挂载可能晚一帧，兜底再等一次
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await renderWidget();
    } else {
      destroyWidget();
    }
  },
  { flush: "post" },
);

onUnmounted(destroyWidget);
</script>

<template>
  <UModal
    :open="captchaState.visible"
    title="人机验证"
    :dismissible="false"
    :ui="{
      content: 'z-10000',
    }"
    @update:open="
      (v: boolean) => {
        if (!v) closeCaptcha();
      }
    "
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-sm">
          为继续访问，请完成以下人机验证。验证通过后一段时间内无需重复验证。
        </p>
        <div
          ref="containerRef"
          class="flex min-h-24 items-center justify-center"
        ></div>
        <p v-if="captchaState.error" class="text-center text-sm text-red-500">
          {{ captchaState.error }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end">
        <UButton color="neutral" variant="ghost" @click="closeCaptcha">
          取消
        </UButton>
      </div>
    </template>
  </UModal>
</template>
