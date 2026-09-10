import { reactive, watch, computed, readonly, ref, type Ref } from "vue";
import { useStorage } from "@vueuse/core";

export const primaryColors = [
  "black",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

export const neutralColors = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "taupe",
  "mauve",
  "mist",
  "olive",
];

export const radiusValues = [0, 0.125, 0.25, 0.375, 0.5];
export const colorModes = ["light", "dark", "system"];
export const fontSizes = [15, 16, 17, 18, 20];

export type PrimaryColor = (typeof primaryColors)[number];
export type NeutralColor = (typeof neutralColors)[number];
export type RadiusValue = (typeof radiusValues)[number];
export type ColorModeValue = (typeof colorModes)[number];
export type FontSizeValue = (typeof fontSizes)[number];

export interface ThemeSettings {
  primary: PrimaryColor;
  neutral: NeutralColor;
  radius: RadiusValue;
  colorMode: ColorModeValue;
  fontSize: FontSizeValue;
}

const defaults: ThemeSettings = {
  primary: "green",
  neutral: "zinc",
  radius: 0.25,
  colorMode: "dark",
  fontSize: 16,
};

const settings = reactive<ThemeSettings>({ ...defaults });

type StoredTheme = Partial<ThemeSettings> | null;
let storedThemeRef: Ref<StoredTheme> | null = null;
let isColorModeWatched = false;

const jsonStorageSerializer = {
  read: (value: string): StoredTheme => {
    try {
      return value ? (JSON.parse(value) as StoredTheme) : null;
    } catch {
      return null;
    }
  },
  write: (value: StoredTheme): string => JSON.stringify(value),
};

function getStoredTheme() {
  if (!storedThemeRef && import.meta.client) {
    storedThemeRef = useStorage<StoredTheme>(
      "nuxt-ui-theme-config",
      null,
      undefined,
      {
        serializer: jsonStorageSerializer,
        onError: () => {},
      },
    );

    watch(storedThemeRef, (stored) => {
      if (!stored || typeof stored !== "object") return;
      const changed = (Object.keys(stored) as (keyof ThemeSettings)[]).some(
        (key) => stored[key] !== settings[key],
      );
      if (changed) applyThemeSettings(stored, false);
    });
  }
  return storedThemeRef || ref(null);
}

// 直接操作 <html> style 避免创建额外的 <style> DOM 节点
function applyRootFontSize() {
  if (!import.meta.client) return;
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
}

function isPrimaryColor(v: string): v is PrimaryColor {
  return (primaryColors as readonly string[]).includes(v);
}

function isNeutralColor(v: string): v is NeutralColor {
  return (neutralColors as readonly string[]).includes(v);
}

function isRadiusValue(v: number): v is RadiusValue {
  return (radiusValues as readonly number[]).includes(v);
}

function isColorModeValue(v: string): v is ColorModeValue {
  return (colorModes as readonly string[]).includes(v);
}

function isFontSizeValue(v: number): v is FontSizeValue {
  return (fontSizes as readonly number[]).includes(v);
}

function applyPrimaryOverride(colorMode: ReturnType<typeof useColorMode>) {
  if (!import.meta.client) return;
  if (settings.primary === "black") {
    const isDark = colorMode.value === "dark";
    document.documentElement.style.setProperty(
      "--ui-primary",
      isDark ? "white" : "black",
    );
  } else {
    document.documentElement.style.removeProperty("--ui-primary");
  }
}

export function applyThemeSettings(
  patch: Partial<ThemeSettings>,
  persist = true,
) {
  const appConfig = useAppConfig();
  const colorMode = useColorMode();

  if (patch.primary && isPrimaryColor(patch.primary)) {
    settings.primary = patch.primary;
  }
  if (patch.neutral && isNeutralColor(patch.neutral)) {
    settings.neutral = patch.neutral;
  }
  if (typeof patch.radius === "number" && isRadiusValue(patch.radius)) {
    settings.radius = patch.radius;
  }
  if (patch.colorMode && isColorModeValue(patch.colorMode)) {
    settings.colorMode = patch.colorMode;
  }
  if (typeof patch.fontSize === "number" && isFontSizeValue(patch.fontSize)) {
    settings.fontSize = patch.fontSize;
  }

  appConfig.ui.colors.primary =
    settings.primary === "black" ? "neutral" : settings.primary;
  appConfig.ui.colors.neutral = settings.neutral;
  (appConfig.ui as { radius?: number }).radius = settings.radius;

  if (import.meta.client) {
    document.documentElement.style.setProperty(
      "--ui-radius",
      `${settings.radius}rem`,
    );
    applyRootFontSize();
  }

  applyPrimaryOverride(colorMode);
  colorMode.preference = settings.colorMode;

  if (persist && import.meta.client) {
    getStoredTheme().value = { ...settings };
  }
}

export function loadThemeSettings() {
  if (!import.meta.client) return;
  const stored = getStoredTheme().value;
  if (!stored || typeof stored !== "object") return;
  applyThemeSettings(stored, false);
}

export function resetThemeSettings() {
  applyThemeSettings(
    {
      primary: defaults.primary,
      neutral: defaults.neutral,
      radius: defaults.radius,
      fontSize: defaults.fontSize,
    },
    true,
  );
}

export function useThemeConfig() {
  const colorMode = useColorMode();

  // 单例监听，防止在多个组件重复调用 useThemeConfig 时重复绑定 watch
  if (import.meta.client && !isColorModeWatched) {
    isColorModeWatched = true;
    watch(
      () => colorMode.value,
      () => applyPrimaryOverride(colorMode),
    );
  }

  return {
    settings: readonly(settings),
    primaryColors,
    neutralColors,
    radiusValues,
    colorModes,
    fontSizes,
    apply: applyThemeSettings,
    load: loadThemeSettings,
    reset: resetThemeSettings,
    isDefaultTheme: computed(
      () =>
        settings.primary === defaults.primary &&
        settings.neutral === defaults.neutral &&
        settings.radius === defaults.radius &&
        settings.fontSize === defaults.fontSize,
    ),
  };
}
