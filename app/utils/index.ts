import { useDebounceFn } from "@vueuse/core";

export const debounce = (fn: () => void, delay: number): (() => void) => {
  return useDebounceFn(fn, delay);
};
