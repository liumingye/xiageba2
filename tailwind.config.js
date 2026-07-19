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
    plugin(function ({ addBase, theme }) {
      addBase({
        h1: { fontSize: theme("fontSize.3xl"), fontWeight: "bold" },
        h2: { fontSize: theme("fontSize.2xl"), fontWeight: "bold" },
        h3: { fontSize: theme("fontSize.xl"), fontWeight: "bold" },
        h4: { fontSize: theme("fontSize.lg"), fontWeight: "bold" },
        h5: { fontSize: theme("fontSize.sm"), fontWeight: "bold" },
        h6: { fontSize: theme("fontSize.xs"), fontWeight: "bold" },
      });
    }),
  ],
};
