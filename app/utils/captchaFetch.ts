import { getCaptchaPassToken } from "~/utils/captcha-pass";
import { requestCaptchaPass } from "~/composables/useCaptcha";

/**
 * 带人机验证兜底的 fetch（用于受保护接口）
 *
 * - 自动附加 x-captcha-pass 通行令牌（有效期内在 localStorage）
 * - 收到 403 且 code=CAPTCHA_REQUIRED 时自动拉起验证码弹窗，
 *   验证通过后自动重试一次原请求；取消 / 失败则原样返回 403 响应
 */
export async function captchaFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const storedToken = getCaptchaPassToken();
  let res = await doFetch(url, init, storedToken);

  if (res.status !== 403) return res;

  let body: any = null;
  try {
    body = await res.clone().json();
  } catch {
    body = null;
  }
  // h3 错误响应的 data 字段挂在 data 下，两个位置都兼容
  const errData = body?.data ?? body;
  if (errData?.code !== "CAPTCHA_REQUIRED") return res;

  let passToken: string | null = null;
  try {
    passToken = await requestCaptchaPass(
      errData.captchaType,
      errData.siteKey,
    );
  } catch {
    // 用户取消或验证异常：返回原始 403 响应
    return res;
  }
  if (!passToken) return res;

  return doFetch(url, init, passToken);
}

async function doFetch(
  url: string,
  init: RequestInit | undefined,
  passToken: string | null,
): Promise<Response> {
  const headers = new Headers(init?.headers || undefined);
  if (passToken) headers.set("x-captcha-pass", passToken);
  return fetch(url, { ...init, headers });
}
