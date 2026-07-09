import { useDebounceFn } from "@vueuse/core";

export const debounce = (fn: () => void, delay: number): (() => void) => {
  return useDebounceFn(fn, delay);
};

export const getTypeName = (type: string) => {
  switch (type) {
    case "quark":
      return "夸克";
    case "baidu":
      return "百度";
    case "uc":
      return "UC";
    case "xunlei":
      return "迅雷";
    default:
      return "其他";
  }
};
