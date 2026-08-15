export type PanFilter =
  | "all"
  | "quark"
  | "baidu"
  | "xunlei"
  | "uc"
  | "ali"
  | "189"
  | "139"
  | "123"
  | "115"
  | "pikpak"
  | "other";
export type PanFilterFriend =
  | "夸克"
  | "百度"
  | "迅雷"
  | "UC"
  | "阿里"
  | "天翼"
  | "移动"
  | "123"
  | "115"
  | "PikPak"
  | "其他";

// 将映射关系抽离到静态对象中，查询时间复杂度为 O(1) 且更易维护
const STORAGE_HOST_MAP: Record<string, PanFilter> = {
  "pan.quark.cn": "quark",
  "pan.baidu.com": "baidu",
  "pan.xunlei.com": "xunlei",
  "fast.uc.cn": "uc",
  "drive.uc.cn": "uc",
  "alipan.com": "ali",
  "aliyundrive.com": "ali",
  "cloud.189.cn": "189",
  "ecloud.189.cn": "189",
  "yun.139.com": "139",
  "123684.com": "123",
  "123865.com": "123",
  "123912.com": "123",
  "123pan.com": "123",
  "123pan.cn": "123",
  "115.com": "115",
  "115cdn.com": "115",
  "toapp.mypikpak.com": "pikpak",
};

export const getStorageType = (url: string): PanFilter => {
  if (!url) return "other";

  url = url.replace("www.", "");

  try {
    // 1. trim() 去除前后空格
    const urlObj = new URL(url.trim());

    // 2. hostname 统一转为小写，杜绝大小写绕过或不匹配隐患
    const host = urlObj.hostname.toLowerCase();

    // 3. 精准匹配
    if (host in STORAGE_HOST_MAP) {
      return STORAGE_HOST_MAP[host] ?? "other";
    }

    return "other";
  } catch {
    // 捕获 new URL() 在传入非法字符串时的解析错误
    return "other";
  }
};

const map: Partial<Record<PanFilter, PanFilterFriend>> = {
  quark: "夸克",
  baidu: "百度",
  xunlei: "迅雷",
  uc: "UC",
  ali: "阿里",
  189: "天翼",
  139: "移动",
  123: "123",
  115: "115",
  pikpak: "PikPak",
  other: "其他",
};

export const getStorageTypeFriend = (url: string): PanFilterFriend => {
  return map[getStorageType(url)] || "其他";
};

export const getStorageTypeFriendFromFilter = (
  pan: PanFilter,
): PanFilterFriend => {
  return map[pan] || "其他";
};
