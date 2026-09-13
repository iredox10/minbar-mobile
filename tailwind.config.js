/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#d4a853",
          dark: "#b8943f",
          light: "#e8c070",
        },
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        light: ["Inter_300Light"],
        medium: ["Inter_500Medium"],
        semibold: ["Inter_600SemiBold"],
        bold: ["Inter_700Bold"],
        arabic: ["Amiri_400Regular"],
        "arabic-bold": ["Amiri_700Bold"],
      },
    },
  },
  plugins: [],
};