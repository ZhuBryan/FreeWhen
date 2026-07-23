import type { Config } from "tailwindcss";

// Design tokens. `stone` is remapped to a cool neutral (zinc) scale; `gold` is
// the accent ramp, remapped to a deep emerald green — the product's identity is
// the green of "free time", so primary actions and key accents carry it. The
// availability heatmap keeps Tailwind's default `green` scale for its data.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stone: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
        },
        gold: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#047857",
          600: "#065f46",
          700: "#064e3b",
        },
        ink: {
          DEFAULT: "#18181b",
          soft: "#52525b",
          faint: "#71717a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
