import React, { PropsWithChildren } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

/**
 * The app's "liquid glass" material: what floats above the content -- the tab
 * bar, menus, sheets, floating buttons -- is a pane of frosted glass that
 * blurs and brightens whatever passes underneath, with a bright rim where it
 * catches the light.
 *
 * Content itself (lists, cards, forms) stays solid; glass is for the layer
 * of controls on top of it.
 *
 *  - Browser: the browser's own backdrop blur.
 *  - Phone: the system blur where there is one, and otherwise a milky pane
 *    that reads the same.
 */
export type GlassTone = "light" | "dark" | "tinted";

const FILL: Record<GlassTone, string> = {
  light: "rgba(255, 255, 255, 0.62)",
  dark: "rgba(255, 255, 255, 0.14)",
  tinted: "rgba(0, 122, 255, 0.78)",
};
/** Without any blur behind it, the pane has to carry itself. */
const FILL_SOLID: Record<GlassTone, string> = {
  light: "rgba(255, 255, 255, 0.9)",
  dark: "rgba(255, 255, 255, 0.2)",
  tinted: "rgba(0, 122, 255, 0.94)",
};
const RIM: Record<GlassTone, string> = {
  light: "rgba(255, 255, 255, 0.85)",
  dark: "rgba(255, 255, 255, 0.28)",
  tinted: "rgba(255, 255, 255, 0.38)",
};

export default function Glass({
  children,
  tone = "light",
  radius = 24,
  intensity = 40,
  style,
  pointerEvents,
}: PropsWithChildren<{
  tone?: GlassTone;
  radius?: number;
  /** How strongly it blurs what is behind it. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}>) {
  const shape: ViewStyle = { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: RIM[tone] };

  if (Platform.OS === "web") {
    const blur = `blur(${Math.round(intensity * 0.6)}px) saturate(180%)`;
    return (
      <View
        pointerEvents={pointerEvents}
        style={[
          shape,
          {
            backgroundColor: FILL[tone],
            // The rim light: brighter along the top edge, a faint shade below.
            ...({
              backdropFilter: blur,
              WebkitBackdropFilter: blur,
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(0,0,0,0.04), 0 8px 32px rgba(15,23,42,0.14)",
            } as object),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // iOS has a real system blur; Android's is costly and uneven across
  // phones, so there the pane is simply more opaque.
  const blurred = Platform.OS === "ios";
  return (
    <View pointerEvents={pointerEvents} style={[shape, styles.native, { backgroundColor: blurred ? FILL[tone] : FILL_SOLID[tone] }, style]}>
      {blurred ? (
        <BlurView
          intensity={intensity}
          tint={tone === "light" ? "systemChromeMaterialLight" : "systemUltraThinMaterialDark"}
          style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  native: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
