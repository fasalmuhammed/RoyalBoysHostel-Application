import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

/**
 * Liquid motion: slow drifting light, and controls that arrive with a soft
 * spring instead of snapping into place.
 *
 * Like the rest of the app's motion this moves only position, size and
 * opacity, so it runs off the main thread on a phone. Someone who has asked
 * their phone to reduce motion gets everything in its resting place.
 */

/** True when the person has asked their device for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduced(value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** One soft pool of light that wanders slowly round its starting point. */
function Blob({
  size,
  opacity,
  drift,
  seconds,
  style,
  still,
}: {
  size: number;
  opacity: number;
  /** How far it wanders, in px. */
  drift: number;
  /** How long one lap takes. */
  seconds: number;
  style: ViewStyle;
  still: boolean;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: seconds * 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [still, seconds, t]);

  // A loose figure-of-eight, with a slow swell: liquid rather than mechanical.
  const translateX = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, drift, 0, -drift, 0] });
  const translateY = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -drift * 0.6, drift * 0.4, -drift * 0.3, 0] });
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        { width: size, height: size, borderRadius: size / 2, opacity, transform: [{ translateX }, { translateY }, { scale }] },
        style,
      ]}
    />
  );
}

/**
 * The drifting light behind a colour-wash header. Put it inside the header,
 * after the gradient and before the content.
 */
export function LiquidBlobs({ scale = 1 }: { scale?: number }) {
  const still = useReducedMotion();
  return (
    <>
      <Blob size={280 * scale} opacity={0.16} drift={26} seconds={19} still={still} style={{ top: -140 * scale, right: -80 * scale }} />
      <Blob size={220 * scale} opacity={0.11} drift={20} seconds={23} still={still} style={{ bottom: -120 * scale, left: -70 * scale }} />
      <Blob size={130 * scale} opacity={0.09} drift={34} seconds={15} still={still} style={{ top: 30 * scale, left: "38%" }} />
    </>
  );
}

/**
 * Brings its content in with a soft spring: a slight rise and swell, as if
 * surfacing. For menus, sheets and anything that appears over the page.
 */
export function Surface({
  children,
  from = "below",
  distance = 18,
  style,
}: PropsWithChildren<{
  /** Which way it arrives from. */
  from?: "below" | "above";
  distance?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const still = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) {
      progress.setValue(1);
      return;
    }
    Animated.spring(progress, { toValue: 1, damping: 18, stiffness: 240, mass: 0.9, useNativeDriver: true }).start();
  }, [progress, still]);

  const offset = from === "below" ? distance : -distance;
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blob: { position: "absolute", backgroundColor: "#FFFFFF" },
});
