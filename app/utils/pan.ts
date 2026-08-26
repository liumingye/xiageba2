/**
 * 网盘类型相关工具
 * 统一网盘类型的中文展示标签，避免在多个组件中重复定义常量。
 */

/** 网盘类型 → 中文标签（用于账号管理、目录选择等后台场景） */
export const PAN_TYPE_LABELS: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  uc: "UC 网盘",
  xunlei: "迅雷云盘",
};

/** 获取网盘类型的中文标签，未知类型回退为原始类型名 */
export const getPanTypeLabel = (type: string): string =>
  PAN_TYPE_LABELS[type] || type;
