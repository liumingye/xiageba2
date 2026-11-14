import { getConfigValue, setConfigValue } from "#server/lib/configCache";

/**
 * APP 下载配置（后台「页面装修 → APP 下载配置」）
 *
 * 与既有配置体系保持一致：整份配置以 JSON 字符串存放在 Config 表，
 * 读写统一走 #server/lib/configCache，避免绕过缓存导致 24h 不生效。
 *
 * 字段：
 * - versionName   版本号（字符串版，如 1.2.0）
 * - versionCode   版本号（整数版，如 1020）
 * - apkUrl        APK 下载地址
 * - previewImageUrl 预览图地址，留空时前台回落到 /img/app/hero-phone.webp
 * - updateStrategy 更新策略：0 不更新 / 1 弹窗更新 / 2 强制更新 / 3 wgt 热更新
 * - wgtUrl        wgt 热更新包链接地址
 * - wgtMd5        wgt 热更新包 MD5
 * - updateDesc    更新描述
 */

export const APP_CONFIG_KEY = "app_download";

/** 更新策略枚举 */
export const AppUpdateStrategy = {
  /** 不更新 */
  NONE: 0,
  /** 弹窗更新 */
  DIALOG: 1,
  /** 强制更新 */
  FORCE: 2,
  /** wgt 热更新 */
  WGT: 3,
} as const;

export type AppUpdateStrategy =
  (typeof AppUpdateStrategy)[keyof typeof AppUpdateStrategy];

export interface AppDownloadConfig {
  /** 版本号（字符串版） */
  versionName: string;
  /** 版本号（整数版） */
  versionCode: number;
  /** APK 下载地址 */
  apkUrl: string;
  /** 下载页预览图地址，留空时前台回落到 /img/app/hero-phone.webp */
  previewImageUrl: string;
  /** 更新策略 */
  updateStrategy: AppUpdateStrategy;
  /** wgt 热更新包链接地址 */
  wgtUrl: string;
  /** wgt 热更新包 MD5 */
  wgtMd5: string;
  /** 更新描述 */
  updateDesc: string;
}

/** 空配置骨架 */
export const emptyAppConfig = (): AppDownloadConfig => ({
  versionName: "",
  versionCode: 0,
  apkUrl: "",
  previewImageUrl: "",
  updateStrategy: AppUpdateStrategy.NONE,
  wgtUrl: "",
  wgtMd5: "",
  updateDesc: "",
});

const str = (v: unknown, fallback = "") =>
  typeof v === "string"
    ? v.trim()
    : v === undefined || v === null
      ? fallback
      : String(v).trim();

/** 解析整数，非法值回落 fallback */
const int = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** 更新策略必须是 0-3 的整数，非法值回落 0（不更新） */
const strategy = (v: unknown): AppUpdateStrategy => {
  const n = int(v, AppUpdateStrategy.NONE);
  return n >= 0 && n <= 3 ? (n as AppUpdateStrategy) : AppUpdateStrategy.NONE;
};

/** 规范化任意输入，补齐缺失字段 */
export function normalizeAppConfig(raw: unknown): AppDownloadConfig {
  if (!raw || typeof raw !== "object") return emptyAppConfig();
  const input = raw as Record<string, any>;
  return {
    versionName: str(input.versionName),
    versionCode: Math.max(0, int(input.versionCode)),
    apkUrl: str(input.apkUrl),
    previewImageUrl: str(input.previewImageUrl),
    updateStrategy: strategy(input.updateStrategy),
    wgtUrl: str(input.wgtUrl),
    wgtMd5: str(input.wgtMd5),
    updateDesc: str(input.updateDesc),
  };
}

/** 读取 APP 下载配置（带缓存，与站点其它配置一致） */
export async function getAppDownloadConfig(): Promise<AppDownloadConfig> {
  const raw = await getConfigValue(APP_CONFIG_KEY);
  if (!raw) return emptyAppConfig();
  try {
    return normalizeAppConfig(JSON.parse(raw));
  } catch {
    return emptyAppConfig();
  }
}

/** 保存 APP 下载配置 */
export async function saveAppDownloadConfig(
  input: unknown,
): Promise<AppDownloadConfig> {
  const normalized = normalizeAppConfig(input);
  await setConfigValue(APP_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}
