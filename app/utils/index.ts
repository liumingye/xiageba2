import { useDebounceFn } from "@vueuse/core";

/**
 * 防抖函数
 * @param fn 函数
 * @param delay 延迟时间
 * @returns 响应函数
 */
export const debounce = (fn: () => void, delay: number): (() => void) => {
  return useDebounceFn(fn, delay);
};

/**
 * 从URL中提取密码
 * @param url URL字符串
 * @returns 密码字符串
 */
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

/**
 * 判断日期是否在最近days天内
 * @param date 日期字符串
 * @param days 天数
 * @returns 是否在最近days天内
 */
export const isWithinDays = (date: string, days = 90) => {
  const targetTime = new Date(date).getTime();
  const oneYearInMs = days * 24 * 60 * 60 * 1000;
  return Math.abs(Date.now() - targetTime) < oneYearInMs;
};
