import { useColorMode } from "@vueuse/core";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const useTheme = () => {
  const mode = useColorMode<ThemePreference>({
    selector: "html",
    attribute: "data-theme",
    storageKey: "data-theme",
    initialValue: "dark",
  });

  // 用户选择的偏好（"auto" 表示跟随系统）
  const preference = computed<ThemePreference>(() => mode.store.value);

  const setTheme = (value: ThemePreference) => {
    mode.value = value;
  };

  return {
    preference,
    setTheme,
  };
};
