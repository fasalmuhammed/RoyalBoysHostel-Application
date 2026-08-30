/**
 * Design tokens. Palette follows the approved mockup: a violet primary on a
 * near-white canvas, with semantic tones reused for every status pill so a
 * colour always means the same thing across Students / Rooms / Fees.
 */
export const colors = {
  /** Violet from the approved mockup: buttons, links, active tabs. */
  primary: "#6D4AFC",
  /** Deeper violet for hero panels, the greeting banner and the splash. */
  primaryDark: "#5433E0",
  /** Tint behind icons and chips. */
  primaryLight: "#EEE9FF",
  primaryOn: "#FFFFFF",

  /** Gold from the app icon, kept for branch badges and other brand accents. */
  gold: "#B98A32",
  goldLight: "#E7BF75",
  goldBg: "#FBF2E0",

  background: "#F6F6F9",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFAFD",

  text: "#14142B",
  textMuted: "#6E6D8A",
  textFaint: "#9B9AB0",
  border: "#E9E8F0",
  borderStrong: "#D8D6E4",

  success: "#16A34A",
  successBg: "#E8F7EE",
  warning: "#D97706",
  warningBg: "#FDF3E3",
  danger: "#DC2626",
  dangerBg: "#FDECEC",
  /** Blue reads clearly again now the primary is violet rather than navy. */
  info: "#2563EB",
  infoBg: "#E8F0FE",

  overlay: "rgba(20, 20, 43, 0.45)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const shadow = {
  card: {
    shadowColor: "#14142B",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#14142B",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/** Semantic tone used by Badge, StatCard and status text. */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const toneColor: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  info: { fg: colors.info, bg: colors.infoBg },
  neutral: { fg: colors.textMuted, bg: "#F0EFF5" },
};
