export const getStorageType = (url: string) => {
  try {
    const urlObj = new URL(url || "");
    if (urlObj.hostname === "pan.quark.cn") return "quark";
    if (urlObj.hostname === "pan.baidu.com") return "baidu";
    if (urlObj.hostname === "pan.uc.cn" || urlObj.hostname === "drive.uc.cn")
      return "uc";
    if (urlObj.hostname === "pan.xunlei.com") return "xunlei";
    return "other";
  } catch (error) {
    return "other";
  }
};
