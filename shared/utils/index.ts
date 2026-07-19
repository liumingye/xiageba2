type PanFilter = "quark" | "baidu" | "xunlei" | "uc" | "other";
type PanFilterFriend = "夸克" | "百度" | "迅雷" | "UC" | "其他";

// 将映射关系抽离到静态对象中，查询时间复杂度为 O(1) 且更易维护
const STORAGE_HOST_MAP: Record<string, PanFilter> = {
  "pan.quark.cn": "quark",
  "pan.baidu.com": "baidu",
  "pan.xunlei.com": "xunlei",
  "pan.uc.cn": "uc",
  "drive.uc.cn": "uc",
};

export const getStorageType = (url: string): PanFilter => {
  if (!url) return "other";

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

export const getStorageTypeFriend = (url: string): PanFilterFriend => {
  const map: Record<PanFilter, PanFilterFriend> = {
    quark: "夸克",
    baidu: "百度",
    xunlei: "迅雷",
    uc: "UC",
    other: "其他",
  };
  return map[getStorageType(url)] || "其他";
};
