import { useDebounceFn } from "@vueuse/core";

export const debounce = (fn: () => void, delay: number): (() => void) => {
  return useDebounceFn(fn, delay);
};

export const getTypeName = (type: string) => {
  switch (type) {
    case "quark":
      return "夸克网盘";
    case "baidu":
      return "百度网盘";
    case "uc":
      return "UC网盘";
    case "xunlei":
      return "迅雷网盘";
    default:
      return "其他网盘";
  }
};


