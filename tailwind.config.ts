import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: "#0B1220",      // background
        surface: "#121B2E",    // cards
        surface2: "#1A2740",   // raised cards / hover
        ink: "#F4F6F8",        // primary text
        muted: "#8B99B0",      // secondary text
        brand: "#008751",      // Nigerian flag green — accent / CTA / wins
        "brand-light": "#00A85C", // hover/glow variant of brand
        win: "#3FA34D",
        loss: "#D9534F",
      },
      fontFamily: {
        display: ["'Bebas Neue'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;