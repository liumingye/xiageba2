/**
 * 人机验证通行令牌的本地存储（localStorage）
 * { token, exp }，过期自动清理
 */
const STORAGE_KEY = "captcha-pass";

interface StoredCaptchaPass {
  token: string;
  /** 过期时间戳（毫秒） */
  exp: number;
}

export function getCaptchaPassToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCaptchaPass;
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function storeCaptchaPass(token: string, expiresIn: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token, exp: Date.now() + expiresIn * 1000 }),
  );
}

export function clearCaptchaPass(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
