// 通用工具函数测试：覆盖 extractPwd / isWithinDays / debounce
// 对应源码：app/utils/index.ts（isMobileOrTablet 依赖 Nuxt SSR 上下文，本文件不测）

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { extractPwd, isWithinDays, debounce } from "./index";

describe("extractPwd", () => {
  it("从 query 参数提取 pwd", () => {
    expect(extractPwd("https://pan.baidu.com/share/abc?pwd=1234")).toBe("1234");
  });

  it("pwd 在 & 之后也能提取", () => {
    expect(
      extractPwd("https://pan.quark.cn/s/abc?foo=bar&pwd=abcd"),
    ).toBe("abcd");
  });

  it("pwd 作为首参数也能提取", () => {
    expect(extractPwd("https://example.com/?pwd=xyz&foo=bar")).toBe("xyz");
  });

  it("无 pwd 参数返回空串", () => {
    expect(extractPwd("https://pan.baidu.com/share/abc")).toBe("");
  });

  it("非 URL 字符串返回空串（不抛错）", () => {
    expect(extractPwd("not-a-url")).toBe("");
  });

  it("空字符串返回空串", () => {
    expect(extractPwd("")).toBe("");
  });

  it("pwd 值包含普通字符", () => {
    expect(extractPwd("https://example.com/?pwd=abc123")).toBe("abc123");
  });

  it("非 URL 字符串（new URL 抛错）返回空串（正则兜底位于 try 内不会执行）", () => {
    // 源码中正则兜底在 try 块内，new URL 抛错时直接进 catch 返回 ""
    expect(extractPwd("pan.baidu.com/s/abc?pwd=9999")).toBe("");
  });
});

describe("isWithinDays", () => {
  beforeEach(() => {
    // 固定当前时间，避免测试受运行时间影响
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z").getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("未来日期在窗口内返回 true", () => {
    expect(isWithinDays("2026-09-25T00:00:00Z", 90)).toBe(true);
  });

  it("过去日期在窗口内返回 true", () => {
    expect(isWithinDays("2026-08-20T00:00:00Z", 90)).toBe(true);
  });

  it("刚好在窗口边界内（小于 90 天）返回 true", () => {
    // 89 天前
    const d = new Date("2026-09-20T12:00:00Z").getTime();
    const target = new Date(d - 89 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDays(target, 90)).toBe(true);
  });

  it("超出窗口边界返回 false", () => {
    // 100 天前
    const d = new Date("2026-09-20T12:00:00Z").getTime();
    const target = new Date(d - 100 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDays(target, 90)).toBe(false);
  });

  it("默认 days=90", () => {
    // 50 天前应在默认窗口内
    const d = new Date("2026-09-20T12:00:00Z").getTime();
    const target = new Date(d - 50 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDays(target)).toBe(true);

    // 100 天前应超出默认窗口
    const far = new Date(d - 100 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDays(far)).toBe(false);
  });

  it("自定义 days 窗口生效", () => {
    const d = new Date("2026-09-20T12:00:00Z").getTime();
    // 30 天前 → 在 30 天窗口边界外（严格小于判定为 true，等于判定为 false）
    const target = new Date(d - 30 * 24 * 60 * 60 * 1000 - 1).toISOString();
    expect(isWithinDays(target, 30)).toBe(false);
    // 10 天前在 30 天窗口内
    const within = new Date(d - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDays(within, 30)).toBe(true);
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("在 delay 内多次调用只执行一次", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("delay 后再次调用应重新计时", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
