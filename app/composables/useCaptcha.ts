import { reactive } from "vue";
import { storeCaptchaPass } from "~/utils/captcha-pass";

/**
 * 人机验证全局状态（模块级单例，可在任意组件 / 工具函数中调用）
 *
 * 流程：
 * 1. captchaFetch 收到 403 CAPTCHA_REQUIRED → requestCaptchaPass() 拉起弹窗
 * 2. CaptchaModal 渲染验证码组件，用户完成后 → submitCaptchaToken()
 * 3. /api/captcha/verify 二次校验通过 → 存储通行令牌并 resolve，原请求自动重试
 *    校验失败 → state.error 提示，组件重置后可重试
 * 4. 用户关闭弹窗 → reject，原请求拿到原始 403 响应
 */

export interface CaptchaRuntimeState {
  visible: boolean;
  captchaType: string;
  siteKey: string;
  error: string;
}

const state = reactive<CaptchaRuntimeState>({
  visible: false,
  captchaType: "",
  siteKey: "",
  error: "",
});

let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let inflight: Promise<string> | null = null;

/** 拉起验证码弹窗并等待通行令牌；并发调用共享同一次验证 */
export function requestCaptchaPass(
  captchaType: string,
  siteKey: string,
): Promise<string> {
  if (inflight) return inflight;

  const promise = new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    state.captchaType = captchaType;
    state.siteKey = siteKey;
    state.error = "";
    state.visible = true;
  });

  inflight = promise;
  promise.finally(
    () => {
      inflight = null;
      pendingResolve = null;
      pendingReject = null;
      state.visible = false;
    },
    // 防止无人消费时产生 unhandled rejection（正常路径下调用方已处理）
  ).catch(() => {});

  return promise;
}

/** 用户主动关闭弹窗：终止本次验证 */
export function closeCaptcha(): void {
  pendingReject?.(new Error("已取消人机验证"));
}

/** 验证码组件完成后的凭证提交；成功返回 true 并 resolve 等待中的请求 */
export async function submitCaptchaToken(providerToken: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/captcha/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: providerToken }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data?.passToken) {
      storeCaptchaPass(data.passToken, data.expiresIn || 0);
      pendingResolve?.(data.passToken);
      return true;
    }
    state.error = data?.message || "人机验证失败，请重试";
    return false;
  } catch {
    state.error = "网络错误，请稍后重试";
    return false;
  }
}

export function useCaptcha() {
  return { captchaState: state, closeCaptcha, submitCaptchaToken };
}
