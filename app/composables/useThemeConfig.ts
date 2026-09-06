const STORAGE_KEY = "nuxt-ui-theme-config";

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
] as const;

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
] as const;

export const radiusValues = [0, 0.125, 0.25, 0.375, 0.5] as const;
export const colorModes = ["light", "dark", "system"] as const;

export type PrimaryColor = (typeof primaryColors)[number];
export type NeutralColor = (typeof neutralColors)[number];
export type RadiusValue = (typeof radiusValues)[number];
export type ColorModeValue = (typeof colorModes)[number];

export interface ThemeSettings {
  primary: PrimaryColor;
  neutral: NeutralColor;
  radius: RadiusValue;
  colorMode: ColorModeValue;
}

const defaults: ThemeSettings = {
  primary: "green",
  neutral: "zinc",
  radius: 0.25,
  colorMode: "system",
};

const settings = reactive<ThemeSettings>({ ...defaults });

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

  // Primary color: "black" is not a valid Tailwind scale color in Nuxt UI,
  // so we fall back to "neutral" and override --ui-primary manually.
  appConfig.ui.colors.primary =
    settings.primary === "black" ? "neutral" : settings.primary;
  appConfig.ui.colors.neutral = settings.neutral;
  (appConfig.ui as { radius?: number }).radius = settings.radius;

  if (import.meta.client) {
    document.documentElement.style.setProperty(
      "--ui-radius",
      `${settings.radius}rem`,
    );
  }

  applyPrimaryOverride(colorMode);
  colorMode.preference = settings.colorMode;

  if (persist && import.meta.client) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings }));
  }
}

export function loadThemeSettings() {
  if (!import.meta.client) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    applyThemeSettings(parsed, false);
  } catch {
    // ignore corrupted storage
  }
}

export function resetThemeSettings() {
  applyThemeSettings({ ...defaults }, true);
}

export function useThemeConfig() {
  const colorMode = useColorMode();

  watch(
    () => colorMode.value,
    () => applyPrimaryOverride(colorMode),
  );

  return {
    settings: readonly(settings),
    primaryColors,
    neutralColors,
    radiusValues,
    colorModes,
    apply: applyThemeSettings,
    load: loadThemeSettings,
    reset: resetThemeSettings,
  };
}
