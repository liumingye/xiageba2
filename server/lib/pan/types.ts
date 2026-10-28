/**
 * 网盘领域的共享类型。
 *
 * 这一层只描述「网盘无关」的契约：任何厂商都要能表达成这些形状，
 * 上层（api handler、树渲染、广告清理）只依赖这里，不直接依赖具体 SDK 类型。
 */

/** 系统支持的网盘类型，unknown 表示链接无法识别 */
export type PanType =
  | "quark"
  | "uc"
  | "baidu"
  | "xunlei"
  | "guangya"
  | "c139"
  | "unknown";

/** 从分享链接解析出的定位信息 */
export interface ParsedShare {
  type: PanType;
  /** 各网盘含义不同：夸克/UC 是 pwdId，百度是 surl，迅雷是 shareId，139 是 linkId */
  fid: string;
  passcode: string;
  url: string;
}

/** 统一的文件/目录描述，屏蔽各 SDK 的字段差异（fid/path/id、file_name/name/fileName…） */
export interface PanFile {
  id: string;
  name: string;
  isDir: boolean;
}

/** 转存结果 */
export interface TransferResult {
  shareUrl: string;
  fids: string[];
}
