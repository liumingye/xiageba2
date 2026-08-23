import { useDebounceFn } from "@vueuse/core";

export const debounce = (fn: () => void, delay: number): (() => void) => {
  return useDebounceFn(fn, delay);
};

export const extractPwd = (url: string): string => {
  try {
    const u = new URL(url);
    const pwd = u.searchParams.get("pwd");
    if (pwd) return pwd;

    const match = url.match(/[?&]pwd=([^&]+)/);
    if (match) return match[1] || "";
  } catch {
    // 忽略URL解析错误
  }
  return "";
};
