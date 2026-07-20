import type { Config } from "tailwindcss";

// Design tokens. `stone` is remapped to a cool neutral (zinc) scale and `gold`
// to a monochrome accent scale so the primary actions read near-black — the
// only saturated colour in the UI is the green availability data itself.
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
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#a1a1aa",
          400: "#52525b",
          500: "#18181b",
          600: "#000000",
          700: "#27272a",
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
