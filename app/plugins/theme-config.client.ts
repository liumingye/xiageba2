import { useStyleTag } from "@vueuse/core";

export default defineNuxtPlugin(() => {
  const { load } = useThemeConfig();
  load();

  // 兼容低版本浏览器的 oklch 颜色空间
  const supportsOklch = CSS.supports("color", "oklch(50% 0.2 30)");
  if (!supportsOklch) {
    const { load } = useStyleTag(`:root,
:host {
  --ui-color-primary-50: var(--color-green-50, rgb(240, 253, 244));
  --ui-color-primary-100: var(--color-green-100, rgb(220, 252, 231));
  --ui-color-primary-200: var(--color-green-200, rgb(185, 248, 207));
  --ui-color-primary-300: var(--color-green-300, rgb(123, 241, 167));
  --ui-color-primary-400: var(--color-green-400, rgb(6, 223, 114));
  --ui-color-primary-500: var(--color-green-500, rgb(0, 201, 80));
  --ui-color-primary-600: var(--color-green-600, rgb(0, 166, 62));
  --ui-color-primary-700: var(--color-green-700, rgb(0, 130, 53));
  --ui-color-primary-800: var(--color-green-800, rgb(2, 102, 48));
  --ui-color-primary-900: var(--color-green-900, rgb(13, 84, 43));
  --ui-color-primary-950: var(--color-green-950, rgb(3, 46, 21));
  --ui-color-secondary-50: var(--color-blue-50, rgb(239, 246, 255));
  --ui-color-secondary-100: var(--color-blue-100, rgb(219, 234, 254));
  --ui-color-secondary-200: var(--color-blue-200, rgb(190, 219, 255));
  --ui-color-secondary-300: var(--color-blue-300, rgb(142, 197, 255));
  --ui-color-secondary-400: var(--color-blue-400, rgb(81, 162, 255));
  --ui-color-secondary-500: var(--color-blue-500, rgb(43, 127, 255));
  --ui-color-secondary-600: var(--color-blue-600, rgb(21, 93, 251));
  --ui-color-secondary-700: var(--color-blue-700, rgb(20, 71, 230));
  --ui-color-secondary-800: var(--color-blue-800, rgb(25, 60, 184));
  --ui-color-secondary-900: var(--color-blue-900, rgb(28, 57, 142));
  --ui-color-secondary-950: var(--color-blue-950, rgb(22, 37, 86));
  --ui-color-success-50: var(--color-green-50, rgb(240, 253, 244));
  --ui-color-success-100: var(--color-green-100, rgb(220, 252, 231));
  --ui-color-success-200: var(--color-green-200, rgb(185, 248, 207));
  --ui-color-success-300: var(--color-green-300, rgb(123, 241, 167));
  --ui-color-success-400: var(--color-green-400, rgb(6, 223, 114));
  --ui-color-success-500: var(--color-green-500, rgb(0, 201, 80));
  --ui-color-success-600: var(--color-green-600, rgb(0, 166, 62));
  --ui-color-success-700: var(--color-green-700, rgb(0, 130, 53));
  --ui-color-success-800: var(--color-green-800, rgb(2, 102, 48));
  --ui-color-success-900: var(--color-green-900, rgb(13, 84, 43));
  --ui-color-success-950: var(--color-green-950, rgb(3, 46, 21));
  --ui-color-info-50: var(--color-blue-50, rgb(239, 246, 255));
  --ui-color-info-100: var(--color-blue-100, rgb(219, 234, 254));
  --ui-color-info-200: var(--color-blue-200, rgb(190, 219, 255));
  --ui-color-info-300: var(--color-blue-300, rgb(142, 197, 255));
  --ui-color-info-400: var(--color-blue-400, rgb(81, 162, 255));
  --ui-color-info-500: var(--color-blue-500, rgb(43, 127, 255));
  --ui-color-info-600: var(--color-blue-600, rgb(21, 93, 251));
  --ui-color-info-700: var(--color-blue-700, rgb(20, 71, 230));
  --ui-color-info-800: var(--color-blue-800, rgb(25, 60, 184));
  --ui-color-info-900: var(--color-blue-900, rgb(28, 57, 142));
  --ui-color-info-950: var(--color-blue-950, rgb(22, 37, 86));
  --ui-color-warning-50: var(--color-yellow-50, rgb(254, 252, 232));
  --ui-color-warning-100: var(--color-yellow-100, rgb(254, 249, 194));
  --ui-color-warning-200: var(--color-yellow-200, rgb(255, 240, 133));
  --ui-color-warning-300: var(--color-yellow-300, rgb(255, 223, 32));
  --ui-color-warning-400: var(--color-yellow-400, rgb(253, 199, 0));
  --ui-color-warning-500: var(--color-yellow-500, rgb(240, 177, 0));
  --ui-color-warning-600: var(--color-yellow-600, rgb(208, 135, 0));
  --ui-color-warning-700: var(--color-yellow-700, rgb(166, 95, 0));
  --ui-color-warning-800: var(--color-yellow-800, rgb(137, 75, 0));
  --ui-color-warning-900: var(--color-yellow-900, rgb(115, 62, 10));
  --ui-color-warning-950: var(--color-yellow-950, rgb(67, 32, 4));
  --ui-color-error-50: var(--color-red-50, rgb(254, 242, 242));
  --ui-color-error-100: var(--color-red-100, rgb(255, 226, 226));
  --ui-color-error-200: var(--color-red-200, rgb(255, 201, 201));
  --ui-color-error-300: var(--color-red-300, rgb(255, 162, 162));
  --ui-color-error-400: var(--color-red-400, rgb(255, 100, 103));
  --ui-color-error-500: var(--color-red-500, rgb(251, 44, 54));
  --ui-color-error-600: var(--color-red-600, rgb(231, 0, 11));
  --ui-color-error-700: var(--color-red-700, rgb(193, 0, 7));
  --ui-color-error-800: var(--color-red-800, rgb(159, 7, 18));
  --ui-color-error-900: var(--color-red-900, rgb(130, 24, 26));
  --ui-color-error-950: var(--color-red-950, rgb(70, 8, 9));
  --ui-color-neutral-50: var(--color-zinc-50, rgb(250, 250, 250));
  --ui-color-neutral-100: var(--color-zinc-100, rgb(244, 244, 245));
  --ui-color-neutral-200: var(--color-zinc-200, rgb(228, 228, 231));
  --ui-color-neutral-300: var(--color-zinc-300, rgb(212, 212, 216));
  --ui-color-neutral-400: var(--color-zinc-400, rgb(159, 159, 169));
  --ui-color-neutral-500: var(--color-zinc-500, rgb(113, 113, 123));
  --ui-color-neutral-600: var(--color-zinc-600, rgb(82, 82, 92));
  --ui-color-neutral-700: var(--color-zinc-700, rgb(63, 63, 70));
  --ui-color-neutral-800: var(--color-zinc-800, rgb(39, 39, 42));
  --ui-color-neutral-900: var(--color-zinc-900, rgb(24, 24, 27));
  --ui-color-neutral-950: var(--color-zinc-950, rgb(9, 9, 11));
}

:root,
:host,
.light {
  --ui-primary: var(--ui-color-primary-500);
  --ui-secondary: var(--ui-color-secondary-500);
  --ui-success: var(--ui-color-success-500);
  --ui-info: var(--ui-color-info-500);
  --ui-warning: var(--ui-color-warning-500);
  --ui-error: var(--ui-color-error-500);
}

.dark {
  --ui-primary: var(--ui-color-primary-400);
  --ui-secondary: var(--ui-color-secondary-400);
  --ui-success: var(--ui-color-success-400);
  --ui-info: var(--ui-color-info-400);
  --ui-warning: var(--ui-color-warning-400);
  --ui-error: var(--ui-color-error-400);
}`);
    load();
  }
});
