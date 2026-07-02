export const getStorageType = (url: string) => {
  console.log("url", url);
  url = url || "";
  if (url.includes("pan.quark.cn")) return "quark";
  if (url.includes("pan.baidu.com")) return "baidu";
  if (url.includes("pan.uc.cn")) return "uc";
  if (url.includes("pan.xunlei.com")) return "xunlei";
  return "other";
};
