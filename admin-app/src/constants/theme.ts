import { Dimensions, PixelRatio } from "react-native";

/**
 * Design tokens. Palette follows the approved mockup: a violet primary on a
 * near-white canvas, with semantic tones reused for every status pill so a
 * colour always means the same thing across Students / Rooms / Fees.
 *
 * Sizes adapt to the device. Everything below is derived from the screen's
 * shortest edge against a 390dp baseline (a standard modern handset), so the
 * same layout reads correctly on a 320dp budget phone, a 430dp flagship and a
 * tablet -- rather than being pixel-tuned for one device and cramped or
 * stranded on the rest.
 *
 * Read once at module load rather than through a hook: the app is locked to
 * portrait (see app.json), so the width cannot change under a running screen,
 * and a static token table keeps every StyleSheet cheap to create.
 */
const BASELINE_WIDTH = 390;
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

/** Shortest edge, so a tablet in portrait is still measured by its width. */
const shortEdge = Math.min(screenWidth, screenHeight);

export const layout = {
  width: screenWidth,
  height: screenHeight,
  /** Roughly iPhone SE / Android Go territory: tighten padding, never text. */
  isSmall: shortEdge < 360,
  isLarge: shortEdge >= 414,
  isTablet: shortEdge >= 600,
} as const;

/**
 * Clamped so text stays proportionate: a tablet gets a slightly roomier
 * layout, not a comically large one, and a small phone shrinks padding well
 * before it shrinks anything readable.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const fontFactor = clamp(shortEdge / BASELINE_WIDTH, 0.9, 1.12);
const spaceFactor = clamp(shortEdge / BASELINE_WIDTH, 0.86, 1.3);

/** Scales a type size, rounded to the device's pixel grid to stay crisp. */
export function scaleFont(size: number): number {
  return PixelRatio.roundToNearestPixel(size * fontFactor);
}

/** Scales a spacing/sizing value. */
export function scaleSpace(size: number): number {
  return PixelRatio.roundToNearestPixel(size * spaceFactor);
}
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
  xs: scaleSpace(4),
  sm: scaleSpace(8),
  md: scaleSpace(16),
  lg: scaleSpace(24),
  xl: scaleSpace(32),
} as const;

export const radius = {
  sm: scaleSpace(8),
  md: scaleSpace(12),
  lg: scaleSpace(16),
  xl: scaleSpace(22),
  pill: 999,
} as const;

/**
 * Minimum comfortable tap target. Anything interactive should reach this in at
 * least one dimension -- below roughly 44dp, misses climb sharply on a phone
 * held one-handed.
 */
export const HIT_TARGET = 44;

/**
 * Inter, loaded at start-up.
 *
 * Weight is chosen by picking the right family rather than by `fontWeight`:
 * Android ignores numeric weights for custom fonts and would silently render
 * everything at regular.
 */
export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
} as const;

export const fontSize = {
  xs: scaleFont(11),
  sm: scaleFont(13),
  md: scaleFont(15),
  lg: scaleFont(18),
  xl: scaleFont(22),
  xxl: scaleFont(28),
} as const;

/**
 * Semantic type scale.
 *
 * Hierarchy comes from size and colour weighting rather than bolding
 * everything: a screen where four things are extrabold has no hierarchy at
 * all. Line heights are set explicitly so multi-line names and addresses stay
 * evenly spaced instead of inheriting the platform default.
 */
export const type = {
  /** One per screen at most: a page title or a headline figure. */
  display: {
    fontFamily: font.extrabold,
    fontSize: scaleFont(30),
    lineHeight: scaleFont(36),
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: font.extrabold,
    fontSize: scaleFont(22),
    lineHeight: scaleFont(28),
    letterSpacing: -0.3,
  },
  section: {
    fontFamily: font.bold,
    fontSize: scaleFont(17),
    lineHeight: scaleFont(22),
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: font.regular,
    fontSize: scaleFont(15),
    lineHeight: scaleFont(21),
  },
  bodyStrong: {
    fontFamily: font.semibold,
    fontSize: scaleFont(15),
    lineHeight: scaleFont(21),
  },
  support: {
    fontFamily: font.regular,
    fontSize: scaleFont(13),
    lineHeight: scaleFont(18),
  },
  caption: {
    fontFamily: font.medium,
    fontSize: scaleFont(11),
    lineHeight: scaleFont(15),
  },
  /** Uppercase micro-label above a value or section. */
  label: {
    fontFamily: font.semibold,
    fontSize: scaleFont(11),
    lineHeight: scaleFont(14),
    letterSpacing: 0.6,
  },
  /** Tabular figures: money, counts, anything scanned in a column. */
  metric: {
    fontFamily: font.extrabold,
    fontSize: scaleFont(24),
    lineHeight: scaleFont(29),
    letterSpacing: -0.6,
  },
  metricSmall: {
    fontFamily: font.bold,
    fontSize: scaleFont(17),
    lineHeight: scaleFont(21),
    letterSpacing: -0.3,
  },
} as const;

/**
 * Elevation scale. Kept deliberately shallow -- depth here separates layers,
 * it is not decoration, and heavy drop shadows are the fastest way to make an
 * interface look cheap.
 */
export const shadow = {
  /** Barely-there lift for list rows and inline surfaces. */
  subtle: {
    shadowColor: "#14142B",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
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
