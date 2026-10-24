import { getConfigValue, setConfigValue } from "#server/lib/configCache";
import {
  findLayoutPreset,
  findLayoutPresetByTo,
  type LayoutPresetKey,
} from "#server/lib/layoutPresets";

/**
 * default 布局装修配置（后台「页面装修」）
 *
 * 与既有配置体系保持一致：整份配置以 JSON 字符串存放在 Config 表，
 * 读写统一走 #server/lib/configCache，避免绕过缓存导致 24h 不生效。
 *
 * 只有两组配置：
 * - menuItems  顶部导航菜单
 * - footerLinks 底部链接
 *
 * 每组条目的来源有三种（source）：
 * - manual 手填文案 + 链接
 * - preset 系统预设（公告列表 / 百度小说 / 屏蔽词列表），选择后自动填写文案与链接
 * - page   关联「页面管理」中已创建的页面，链接在读取时解析为 /page/<slug>
 */

export const LAYOUT_DEFAULT_KEY = "layout_default";

/** 条目来源 */
export type LayoutLinkSource = "manual" | "preset" | "page";

export interface LayoutLinkItem {
  id: string;
  /** 显示文案；page 来源留空则用页面标题 */
  label: string;
  /** 站内路径或外链；page 来源留空，读取时解析为 /page/<slug> */
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

export interface LayoutDefaultConfig {
  /** 顶部导航菜单 */
  menuItems: LayoutLinkItem[];
  /** 底部链接 */
  footerLinks: LayoutLinkItem[];
}

let seq = 0;
const uid = () => {
  seq = (seq + 1) % 100000;
  return `${Date.now().toString(36)}${seq.toString(36).padStart(3, "0")}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
};

const str = (v: unknown, fallback = "") =>
  typeof v === "string" ? v.trim() : v === undefined || v === null ? fallback : String(v).trim();

const bool = (v: unknown, fallback = true) =>
  typeof v === "boolean" ? v : fallback;

type LinkSeed = Omit<LayoutLinkItem, "id">;

/** 由预设生成条目种子 */
function presetSeed(
  key: LayoutPresetKey,
  enabled = true,
): LinkSeed {
  const preset = findLayoutPreset(key)!;
  return {
    label: preset.label,
    to: preset.to,
    icon: preset.icon,
    enabled,
    source: "preset",
    ref: preset.key,
    slug: "",
  };
}

const EMPTY_SEED: LinkSeed = {
  label: "",
  to: "",
  icon: "",
  enabled: true,
  source: "manual",
  ref: "",
  slug: "",
};

function normalizeLink(raw: any, seed?: LinkSeed): LayoutLinkItem {
  // 无输入时直接以默认种子生成（默认配置）
  if (raw === undefined || raw === null) {
    return { id: uid(), ...(seed ?? EMPTY_SEED) };
  }

  const rawSource = str(raw?.source);
  const source: LayoutLinkSource =
    rawSource === "preset" || rawSource === "page" ? rawSource : "manual";

  // 预设：优先按 ref 命中，旧数据没有 ref 时按链接地址反查
  const preset =
    source === "preset" ? findLayoutPreset(raw?.ref) : findLayoutPresetByTo(raw?.to);

  // 条目自身的值优先；为空时依次回退到预设、默认种子
  const pick = (
    rawValue: unknown,
    presetValue?: string,
    seedValue?: string,
  ) => str(rawValue) || presetValue || seedValue || "";

  return {
    id: str(raw?.id) || uid(),
    label: pick(raw?.label, preset?.label, seed?.label),
    to: pick(raw?.to, preset?.to, seed?.to),
    // 图标选填：完全以条目自身配置为准，留空即不配置（前台不展示）。
    // 不能用预设/默认种子兜底，否则会把用户没配过的图标又显示出来
    icon: str(raw?.icon),
    enabled: bool(raw?.enabled, seed?.enabled ?? true),
    source: preset ? "preset" : source,
    ref: preset ? preset.key : str(raw?.ref, seed?.ref ?? ""),
    // slug 只对 page 来源有意义，避免预设条目误带上默认种子的 slug
    slug: source === "page" ? str(raw?.slug, seed?.slug ?? "") : str(raw?.slug),
  };
}

function normalizeLinks(raw: unknown, fallbacks: LinkSeed[]): LayoutLinkItem[] {
  if (!Array.isArray(raw)) {
    return fallbacks.map((f) => normalizeLink(undefined, f));
  }
  return raw.map((item, i) => normalizeLink(item, fallbacks[i]));
}

/** 默认导航菜单：公告列表 + 百度小说（与改造前的顶部导航一致） */
const DEFAULT_MENU: LinkSeed[] = [
  presetSeed("announcement"),
  presetSeed("novel"),
];

/**
 * 默认底部链接：四个迁移页面 + 屏蔽词列表
 * 页面默认只带 slug（不写死 id），读取时按 slug 解析
 */
const DEFAULT_LEGAL: LinkSeed[] = [
  {
    label: "免责声明",
    to: "",
    icon: "shield-alert",
    enabled: true,
    source: "page",
    ref: "",
    slug: "policy",
  },
  {
    label: "服务协议",
    to: "",
    icon: "file-signature",
    enabled: true,
    source: "page",
    ref: "",
    slug: "agree",
  },
  {
    label: "隐私政策",
    to: "",
    icon: "lock",
    enabled: true,
    source: "page",
    ref: "",
    slug: "privacy-policy",
  },
  {
    label: "版权说明",
    to: "",
    icon: "copyright",
    enabled: true,
    source: "page",
    ref: "",
    slug: "version",
  },
  presetSeed("forbidden"),
];

/**
 * 兼容旧结构：历史上曾有 announcements / novels / customPages 三个分组，
 * 若库里仍是旧数据，则并入对应的新分组后再规范化（保存后即为新结构）。
 */
function migrateLegacy(input: Record<string, any>): {
  menuItems: unknown;
  footerLinks: unknown;
} {
  let menuRaw = input.menuItems;
  let legalRaw = input.footerLinks;

  const legacyMenu = [
    ...(Array.isArray(input.announcements) ? input.announcements : []),
    ...(Array.isArray(input.novels) ? input.novels : []),
  ];
  if (legacyMenu.length) {
    menuRaw = [...(Array.isArray(menuRaw) ? menuRaw : []), ...legacyMenu];
  }

  if (Array.isArray(input.customPages) && input.customPages.length) {
    const asLinks = input.customPages.map((cp: any) => ({
      id: cp?.id,
      label: cp?.label,
      to: "",
      icon: cp?.icon,
      enabled: cp?.enabled,
      source: "page",
      ref: cp?.pageId || "",
      slug: cp?.slug || "",
    }));
    legalRaw = [...(Array.isArray(legalRaw) ? legalRaw : []), ...asLinks];
  }

  return { menuItems: menuRaw, footerLinks: legalRaw };
}

/** 规范化任意输入，补齐缺失字段与 id */
export function normalizeLayoutConfig(raw: unknown): LayoutDefaultConfig {
  if (!raw || typeof raw !== "object") {
    return {
      menuItems: DEFAULT_MENU.map((f) => normalizeLink(undefined, f)),
      footerLinks: DEFAULT_LEGAL.map((f) => normalizeLink(undefined, f)),
    };
  }

  const input = raw as Record<string, any>;
  const { menuItems, footerLinks } = migrateLegacy(input);

  return {
    menuItems: normalizeLinks(menuItems, DEFAULT_MENU),
    footerLinks: normalizeLinks(footerLinks, DEFAULT_LEGAL),
  };
}

/** 读取装修配置（带缓存，与站点其它配置一致） */
export async function getLayoutDefaultConfig(): Promise<LayoutDefaultConfig> {
  const raw = await getConfigValue(LAYOUT_DEFAULT_KEY);
  if (!raw) return normalizeLayoutConfig(null);
  try {
    return normalizeLayoutConfig(JSON.parse(raw));
  } catch {
    return normalizeLayoutConfig(null);
  }
}

/** 保存装修配置 */
export async function saveLayoutDefaultConfig(
  input: unknown,
): Promise<LayoutDefaultConfig> {
  const normalized = normalizeLayoutConfig(input);
  await setConfigValue(LAYOUT_DEFAULT_KEY, JSON.stringify(normalized));
  return normalized;
}
