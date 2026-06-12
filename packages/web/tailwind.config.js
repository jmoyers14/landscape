/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        earth: "#14271F",
        "earth-mid": "#1C3328",
        concrete: "#213D2E",
        limestone: "#F7F4ED",
        "limestone-mid": "#EDE9DF",
        gold: "#C4A227",
        "gold-light": "#D4B840",
        sage: "#8BAF9A",
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        body: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "Consolas", "monospace"],
      },
      keyframes: {
        "scroll-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "scroll-left": "scroll-left 32s linear infinite",
      },
    },
  },
  plugins: [],
};
