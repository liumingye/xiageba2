/**
 * 页面管理 / 页面装修 前端类型与常量
 *
 * 与服务端 server/lib/layoutConfig.ts 保持字段一致（项目既有约定：
 * 前端类型手抄一份，不直接引用 Prisma 生成类型）。
 */

export type PageStatus = "DRAFT" | "PUBLISHED";

export interface AdminPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  icon: string;
  status: PageStatus;
  sort: number;
  createdAt: string;
  updatedAt?: string;
}

/** 条目来源：manual 手填 / preset 系统预设 / page 页面管理中的页面 */
export type LayoutLinkSource = "manual" | "preset" | "page";

/** 通用链接型配置（导航菜单 / 底部链接） */
export interface LayoutLinkItem {
  id: string;
  /** 显示文案；page 来源留空则用页面标题 */
  label: string;
  /** 站内路径或外链；page 来源留空，运行时解析为 /page/<slug> */
  to: string;
  /** 选填：lucide 图标名，不含 i-lucide- 前缀；留空表示不配置图标 */
  icon: string;
  enabled: boolean;
  source: LayoutLinkSource;
  /** preset → 预设 key；page → 页面 ID；manual → 空 */
  ref: string;
  /** page 来源冗余保存 slug，页面 ID 失效时按 slug 兜底 */
  slug: string;
}

/** 页面下拉选项（页面装修 → 关联页面） */
export interface PageOption {
  id: string;
  slug: string;
  title: string;
  icon: string;
  status: PageStatus;
}

/**
 * 预设入口（公告列表 / 百度小说 / 屏蔽词列表）
 *
 * 由后台接口 GET /api/admin/config/layout-default 的 presets 字段下发，
 * 前端不内置这份数据，避免它出现在客户端产物里。
 */
export interface LayoutPreset {
  key: string;
  label: string;
  to: string;
  icon: string;
}

export interface LayoutDefaultConfig {
  menuItems: LayoutLinkItem[];
  footerLinks: LayoutLinkItem[];
}

/** 前台解析后的链接 */
export interface PublicLayoutLink {
  label: string;
  to: string;
  /** lucide 图标名；空串表示未配置图标，前台不展示 */
  icon: string;
}

export interface PublicLayoutConfig {
  menuItems: PublicLayoutLink[];
  footerLinks: PublicLayoutLink[];
}

/** slug 规范：小写字母/数字，短横线分隔 */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 系统保留 slug，禁止在页面管理中占用 */
export const RESERVED_SLUGS = ["forbidden-keywords"];

/** 校验 slug，返回错误文案；合法时返回空字符串 */
export function validateSlug(value: string): string {
  const slug = String(value ?? "").trim();
  if (!slug) return "URL 缩略名不能为空";
  if (slug.length > 100) return "URL 缩略名不能超过 100 个字符";
  if (!SLUG_REGEX.test(slug))
    return "只能包含小写字母、数字和短横线，且不能以短横线开头或结尾";
  if (RESERVED_SLUGS.includes(slug)) return `「${slug}」为系统保留，请更换`;
  return "";
}

/** 由标题推导一个合法的 slug 建议值（中文等非法字符会被剔除） */
export function slugifyTitle(title: string): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** 生成本地唯一 id（保存时服务端会再次兜底） */
export function newItemId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 空配置骨架 */
export const emptyLayoutConfig = (): LayoutDefaultConfig => ({
  menuItems: [],
  footerLinks: [],
});
