/**
 * 后台资源管理里「分类下拉」的哨兵值语义
 *
 * USelect 不接受空字符串作为 value（空串在 Nuxt UI 里表示"未选择"，
 * 会显示 placeholder），所以「全部分类 / 无分类」这两件事各用一个哨兵值表示，
 * 只在传给 API 或写进 URL 时才归一化成空串。
 *
 * 这套语义原本散在 resource.vue 里，现在导入弹窗、批量分类弹窗都要用，
 * 收拢到这里，避免各处自己拼 `__all__`。
 */

/** 列表筛选：全部分类 */
export const FILTER_ALL = "__all__";

/** 表单选择：不归属任何分类 */
export const NO_CATEGORY = "__none__";

/** 筛选值 → URL query 参数（全部 = 不传） */
export function cidParam(value: string): string {
  return value && value !== FILTER_ALL ? value : "";
}

/** 选择值 → 接口参数（无分类 = 传空） */
export function toApiCid(value: string): string {
  return value && value !== NO_CATEGORY ? value : "";
}
