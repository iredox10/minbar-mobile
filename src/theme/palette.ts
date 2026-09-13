/**
 * Brand palette — mirrors the web app's design tokens (src/index.css).
 * Used for anything needing raw hex values (StatusBar, gradients, inline styles).
 * Utility classes (bg-primary, text-slate-*, ...) come from tailwind.config.js.
 */

export const palette = {
  primary: "#d4a853",
  primaryDark: "#b8943f",
  primaryLight: "#e8c070",
  primaryGlow: "rgba(212, 168, 83, 0.3)",

  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },

  emerald: {
    400: "#34d399",
    500: "#10b981",
  },

  rose: {
    400: "#fb7185",
  },
} as const;

export type Palette = typeof palette;

/** Only keys we reference directly in JSX. */
export const colors = {
  primary: palette.primary,
  bgDark: palette.slate[900],
  bgLight: palette.slate[100],
} as const;