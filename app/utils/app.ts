/**
 * APP 下载配置 前端类型与常量
 *
 * 与服务端 server/lib/appConfig.ts 保持字段一致（项目既有约定：
 * 前端类型手抄一份，不直接引用服务端模块）。
 */

/** 更新策略：0 不更新 / 1 弹窗更新 / 2 强制更新 / 3 wgt 热更新 */
export type AppUpdateStrategy = 0 | 1 | 2 | 3;

export interface AppDownloadConfig {
  /** 版本号（字符串版） */
  versionName: string;
  /** 版本号（整数版） */
  versionCode: number;
  /** APK 下载地址 */
  apkUrl: string;
  /** 下载页预览图地址，留空时回落到 DEFAULT_APP_PREVIEW_IMAGE */
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

/** 下载页默认预览图（预览图地址留空时使用） */
export const DEFAULT_APP_PREVIEW_IMAGE = "/img/app/hero-phone.webp";

/** 更新策略下拉选项（后台装修页使用） */
export const APP_UPDATE_STRATEGY_OPTIONS: {
  label: string;
  value: AppUpdateStrategy;
}[] = [
  { label: "不更新", value: 0 },
  { label: "弹窗更新", value: 1 },
  { label: "强制更新", value: 2 },
  { label: "WGT 热更新", value: 3 },
];

/** 更新策略文案（前台展示用） */
export const appUpdateStrategyLabel = (strategy: AppUpdateStrategy): string =>
  APP_UPDATE_STRATEGY_OPTIONS.find((o) => o.value === strategy)?.label ||
  "不更新";

/** 空配置骨架 */
export const emptyAppConfig = (): AppDownloadConfig => ({
  versionName: "",
  versionCode: 0,
  apkUrl: "",
  previewImageUrl: "",
  updateStrategy: 0,
  wgtUrl: "",
  wgtMd5: "",
  updateDesc: "",
});
