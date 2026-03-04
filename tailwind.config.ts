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
        bebas: ['"Bebas Neue"', "sans-serif"],
        dm: ['"DM Sans"', "sans-serif"],
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
