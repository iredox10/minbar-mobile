/**
 * Brand palette — mirrors the web app's design tokens (src/index.css).
 * Used for anything needing raw hex values (StatusBar, gradients, inline styles).
 * Utility classes (bg-primary, text-slate-*, ...) come from tailwind.config.js.
 *
 * NOTE: `primary` must stay #d4a853 to match web. tailwind.config.js uses the
 * same token (colors.primary.DEFAULT), so keep both in sync.
 *
 * Light-mode contrast: primary (#d4a853) on white passes for large text/icons
 * but is low-contrast for small body text — prefer slate-900 text on primary
 * fills (e.g. active buttons use `text-slate-900` on `bg-primary`). In dark
 * mode, primary on slate-900 is the high-contrast pairing; avoid primary text
 * directly on slate-800 without bumping to primaryLight (#e8c070).
 */

/** Translucent surfaces for cards/overlays over imagery. */
export const glass = {
  dark: "rgba(15, 23, 42, 0.6)",
  light: "rgba(255, 255, 255, 0.7)",
} as const;

/** Skeleton shimmer tones per color scheme. */
export const skeleton = {
  dark: { base: "#1e293b", highlight: "#334155" },
  light: { base: "#e2e8f0", highlight: "#f1f5f9" },
} as const;

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