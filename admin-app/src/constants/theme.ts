/**
 * Design tokens. Palette follows the approved mockup: a violet primary on a
 * near-white canvas, with semantic tones reused for every status pill so a
 * colour always means the same thing across Students / Rooms / Fees.
 */
export const colors = {
  /** Interactive navy: buttons, links, active tabs. */
  primary: "#123F86",
  /** The brand navy sampled from the app icon: headers, splash, hero panels. */
  primaryDark: "#062962",
  /** Tint behind icons and chips. */
  primaryLight: "#E9EEF8",
  primaryOn: "#FFFFFF",

  /** Brand gold. The raw icon gold is too light for text on white, so the
   *  darker `gold` is used for type and the lighter one only on navy. */
  gold: "#B98A32",
  goldLight: "#E7BF75",
  goldBg: "#FBF2E0",

  background: "#F5F6F9",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFBFD",

  text: "#10203A",
  textMuted: "#5D6B85",
  textFaint: "#93A0B5",
  border: "#E4E8F0",
  borderStrong: "#CBD3E1",

  success: "#16A34A",
  successBg: "#E8F7EE",
  warning: "#B45309",
  warningBg: "#FBF2E0",
  danger: "#DC2626",
  dangerBg: "#FDECEC",
  /** Teal rather than blue: a blue "info" would be indistinguishable from the
   *  navy primary on a badge. */
  info: "#0F766E",
  infoBg: "#E4F2F0",

  overlay: "rgba(6, 41, 98, 0.45)",
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
    shadowColor: "#0B1F3F",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#0B1F3F",
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
