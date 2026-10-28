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
  guangya: "光鸭云盘",
  c139: "中国移动云盘",
};

/**
 * 后台展示顺序
 *
 * 与 PAN_TYPE_LABELS 的键一一对应；新增网盘只改这两处，
 * 账号管理里那个下拉框会自动跟着变。
 */
export const PAN_TYPE_ORDER = [
  "quark",
  "baidu",
  "uc",
  "xunlei",
  "guangya",
  "c139",
] as const;

/** 可用于 USelect 的网盘选项，顺序同 PAN_TYPE_ORDER */
export const PAN_TYPE_OPTIONS: { label: string; value: string }[] =
  PAN_TYPE_ORDER.map((type) => ({
    label: PAN_TYPE_LABELS[type] ?? type,
    value: type,
  }));

/**
 * 归一化网盘标识
 *
 * 同一类网盘在不同来源里写法不一致：AI 工具返回 `139`，数据库里存 `c139`。
 * 展示前统一过一道，避免每处各自 if-else。
 */
export function normalizePanType(type: string): string {
  return type === "139" ? "c139" : type;
}

/** 获取网盘类型的中文标签，未知类型回退为原始类型名 */
export const getPanTypeLabel = (type: string): string =>
  PAN_TYPE_LABELS[normalizePanType(type)] || type;
