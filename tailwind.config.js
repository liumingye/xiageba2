const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,vue,ts}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        error: {
          50: "#fdf2f2",
          100: "#fde6e6",
          200: "#fcd5d5",
          300: "#fee2e2",
          400: "#f97364",
          500: "#f96354",
          600: "#f9524d",
          700: "#f94244",
          800: "#f9323c",
          900: "#f92233",
        },
        dark: {
          100: "#1a1a1a",
          200: "#121212",
          300: "#0a0a0a",
        },
      },
    },
  },
  plugins: [
    plugin(function ({ addBase, theme, addUtilities }) {
      addBase({
        h1: { fontSize: theme("fontSize.3xl"), fontWeight: "bold" },
        h2: { fontSize: theme("fontSize.2xl"), fontWeight: "bold" },
        h3: { fontSize: theme("fontSize.xl"), fontWeight: "bold" },
        h4: { fontSize: theme("fontSize.lg"), fontWeight: "bold" },
        h5: { fontSize: theme("fontSize.sm"), fontWeight: "bold" },
        h6: { fontSize: theme("fontSize.xs"), fontWeight: "bold" },
      });
      addUtilities({
        ".text-color-100": {
          "@apply text-zinc-950 dark:text-zinc-100": {},
        },
        ".text-color-200": {
          "@apply text-zinc-900 dark:text-zinc-200": {},
        },
        ".text-color-300": {
          "@apply text-zinc-800 dark:text-zinc-300": {},
        },
        ".text-color-400": {
          "@apply text-zinc-700 dark:text-zinc-400": {},
        },
        ".text-color-500": {
          "@apply text-zinc-600 dark:text-zinc-500": {},
        },
        ".border-color-100": {
          "@apply border-zinc-100 dark:border-zinc-950": {},
        },
        ".border-color-200": {
          "@apply border-zinc-200 dark:border-zinc-900": {},
        },
        ".border-color-300": {
          "@apply border-zinc-300 dark:border-zinc-800": {},
        },
        ".border-color-400": {
          "@apply border-zinc-400 dark:border-zinc-700": {},
        },
        ".border-color-500": {
          "@apply border-zinc-500 dark:border-zinc-600": {},
        },
        ".bg-color-100": {
          "@apply bg-white dark:bg-zinc-900": {},
        },
        ".bg-color-200": {
          "@apply bg-zinc-100 dark:bg-zinc-900": {},
        },
        ".bg-color-300": {
          "@apply bg-zinc-100 dark:bg-zinc-800": {},
        },
        ".bg-color-400": {
          "@apply bg-zinc-200 dark:bg-zinc-700": {},
        },
        ".bg-color-500": {
          "@apply bg-zinc-300 dark:bg-zinc-600": {},
        },
        ".bg-color-600": {
          "@apply bg-zinc-400 dark:bg-zinc-400": {},
        },
        ".bg-color-700": {
          "@apply bg-zinc-500 dark:bg-zinc-300": {},
        },
        ".bg-color-800": {
          "@apply bg-zinc-600 dark:bg-zinc-200": {},
        },
        ".bg-color-900": {
          "@apply bg-zinc-700 dark:bg-zinc-100": {},
        },
      });
    }),
  ],
};
