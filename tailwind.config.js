/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#e8ecff",
          200: "#cdd7ff",
          300: "#aabaff",
          400: "#7f95ff",
          500: "#5a74ff",
          600: "#3e58f6",
          700: "#2e43d3",
          800: "#2435a8",
          900: "#1f2d86",
        },
      },
      spacing: {
        18: "4.5rem",
      },
      borderRadius: {
        xl: "1rem",
      },
      boxShadow: {
        "elev-1": "0 1px 2px rgba(0,0,0,0.05)",
        "elev-2": "0 2px 8px rgba(0,0,0,0.08)",
        "elev-3": "0 8px 24px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};

