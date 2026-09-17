import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CRE8 Design System
        black: "#000000",
        white: "#FFFFFF",
        green: "#8CC644",
        "green-dark": "#6B9A33",
        charcoal: "#1A1A1A",
        "dark-gray": "#2A2A2A",
        "medium-gray": "#666666",
        "light-gray": "#F5F5F5",
        "border-gray": "#333333",
        // Flow component colors
        "muted-gray": "#999999",
        "subtle-gray": "#FAFAFA",
        "border-light": "#E5E5E5",
        "border-medium": "#D0D0D0",
      },
      fontFamily: {
        // Sep 2026 font trial: everything is Inter (same stack Grok Bot uses).
        // `font-bebas` is kept as the class name for headings so nothing in the components changed;
        // globals.css turns those headings into Inter semibold. Revert = put Bebas Neue / DM Sans back here.
        bebas: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        dm: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        card: "8px",
        btn: "4px",
      },
    },
  },
  plugins: [],
};
export default config;
