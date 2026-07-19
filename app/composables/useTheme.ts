export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "xiageba-theme";

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

let mediaQuery: MediaQueryList | null = null;
let initialized = false;

export const useTheme = () => {
  const preference = useState<ThemePreference>(
    "theme-preference",
    () => "system",
  );
  const resolvedTheme = useState<ResolvedTheme>(
    "resolved-theme",
    () => "dark",
  );

  const applyTheme = () => {
    if (!import.meta.client) return;

    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved: ResolvedTheme =
      preference.value === "system"
        ? systemDark
          ? "dark"
          : "light"
        : preference.value;
    const root = document.documentElement;

    resolvedTheme.value = resolved;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference.value;
    root.style.colorScheme = resolved;

    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeColor?.setAttribute(
      "content",
      resolved === "dark" ? "#0f172a" : "#f8fafc",
    );
  };

  const initializeTheme = () => {
    if (!import.meta.client) return;

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in strict privacy modes.
    }
    preference.value = isThemePreference(saved) ? saved : "dark";

    if (!initialized) {
      initialized = true;
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", () => {
        if (preference.value === "system") applyTheme();
      });
    }

    applyTheme();
  };

  const setTheme = (value: ThemePreference) => {
    preference.value = value;
    if (import.meta.client) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, value);
      } catch {
        // The in-memory preference still works for the current session.
      }
      applyTheme();
    }
  };

  return {
    preference: readonly(preference),
    resolvedTheme: readonly(resolvedTheme),
    initializeTheme,
    setTheme,
  };
};
