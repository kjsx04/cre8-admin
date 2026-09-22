import type { Config } from "tailwindcss";

/**
 * CRE8 Admin — design tokens (UI refresh, Sep 2026)
 *
 * The admin is an internal tool, so it has its own calm, light token set
 * (separate from the dark public-site brand). Rules:
 *   - Neutrals do the work. One accent (CRE8 green) marks status / active / success only.
 *   - Primary buttons are near-black ("ink"), never green.
 *   - Cards use 1px borders, never shadows. Shadows exist only for floating layers.
 *   - Every size comes from the scale below — no arbitrary `text-[11px]` or hex colors in components.
 *
 * LEGACY block at the bottom: old token names still referenced by pages that haven't been
 * migrated yet. Each is deleted once `grep` shows zero uses.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        black: "#000000",
        white: "#FFFFFF",

        // ── Neutrals ──
        canvas: "#F7F7F8",                 // page background
        surface: { DEFAULT: "#FFFFFF", 2: "#F2F2F3" }, // cards / raised rows
        border: { DEFAULT: "#E6E6E8", strong: "#D3D3D6" },
        text: { DEFAULT: "#111113", 2: "#5C5C63", 3: "#8A8A92" }, // primary / secondary / muted
        ink: { DEFAULT: "#111113", hover: "#2A2A2E" }, // primary button

        // ── Accent (CRE8 green) — status, active, selected, success only ──
        accent: { DEFAULT: "#8CC644", strong: "#6B9A33", soft: "#EEF6E3" },

        // ── Semantic pairs (bg + fg) ──
        success: { bg: "#EEF6E3", fg: "#3F6E13" },
        warning: { bg: "#FFF4DB", fg: "#8A5A00" },
        danger: { DEFAULT: "#CC2E2E", bg: "#FDECEC", fg: "#B42323" },
        info: { bg: "#E8F1FA", fg: "#1F5F8B" },

        // ── LEGACY (delete when unused) ──
        green: "#8CC644",
        "green-dark": "#6B9A33",
        charcoal: "#1A1A1A",
        "dark-gray": "#2A2A2A",
        "medium-gray": "#666666",
        "light-gray": "#F5F5F5",
        "border-gray": "#333333",
        "muted-gray": "#999999",
        "subtle-gray": "#FAFAFA",
        "border-light": "#E5E5E5",
        "border-medium": "#D0D0D0",
      },

      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        // LEGACY — old class names, both Inter now (delete when unused)
        bebas: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        dm: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      },

      // Type scale — size / line-height. `label` is the only uppercase size (table headers).
      fontSize: {
        label: ["11px", { lineHeight: "14px", letterSpacing: "0.04em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["16px", { lineHeight: "24px" }],
        lg: ["20px", { lineHeight: "28px" }],
        xl: ["24px", { lineHeight: "32px" }],
      },

      borderRadius: {
        control: "6px",  // buttons, inputs, tabs
        card: "10px",    // cards, table wrappers
        modal: "12px",   // dialogs, slide-overs, popovers
        pill: "9999px",
        btn: "6px",      // LEGACY alias (delete when unused)
      },

      // Control heights: h-control-sm / h-control / h-control-lg
      spacing: {
        "control-sm": "32px",
        control: "36px",
        "control-lg": "40px",
      },

      boxShadow: {
        popover: "0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
        modal: "0 16px 48px rgba(0,0,0,0.16)",
      },

      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out both",
        "scale-in": "scale-in 150ms ease-out both",
        "slide-in-right": "slide-in-right 200ms ease-out both",
        "slide-up": "slide-up 180ms ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
