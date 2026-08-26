/**
 * 公告相关类型与展示配置
 * 统一公告图标映射与类型定义，避免在列表/详情/展示等组件中重复实现。
 */
import {
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Megaphone,
} from "@lucide/vue";
import type { Component, FunctionalComponent } from "vue";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  displayType?: "NORMAL" | "BANNER" | "DIALOG";
  icon: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  status?: "ACTIVE" | "ARCHIVED";
  sort?: number;
  createdAt: string;
  updatedAt?: string;
}

type AnnouncementIcon = Announcement["icon"];

interface IconConfig {
  class: string;
  component: Component | FunctionalComponent;
}

/** 公告类型图标与配色映射 */
const iconConfigMap: Record<AnnouncementIcon, IconConfig> = {
  INFO: { class: "bg-blue-500/20 text-blue-400", component: Info },
  WARN: {
    class: "bg-yellow-500/20 text-yellow-400",
    component: AlertTriangle,
  },
  ERROR: {
    class: "bg-red-500/20 text-red-400",
    component: AlertCircle,
  },
  SUCCESS: {
    class: "bg-green-500/20 text-green-400",
    component: CheckCircle,
  },
};

/** 未知/默认图标配置 */
const DEFAULT_ICON_CONFIG: IconConfig = {
  class: "bg-zinc-500/20 text-zinc-400",
  component: Megaphone,
};

/**
 * 根据公告图标类型获取对应的图标组件与配色，未知类型回退到默认（扩音器）。
 */
export const getIconConfig = (icon: AnnouncementIcon): IconConfig =>
  iconConfigMap[icon] || DEFAULT_ICON_CONFIG;
