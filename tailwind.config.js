/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
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
