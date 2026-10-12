import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { colors, radius } from "@/constants/theme";
import { tapFeedback } from "@/utils/haptics";

/**
 * Motion primitives.
 *
 * Everything here animates only `opacity` and `transform`, which the native
 * driver can run on the UI thread -- so a list still scrolls at full frame
 * rate while its rows are fading in. `LayoutAnimation` is deliberately not
 * used: this app runs on the New Architecture, where its behaviour is
 * inconsistent.
 *
 * Durations are kept short on purpose. This is a data-entry app someone uses
 * dozens of times a day; motion should confirm what happened, never make them
 * wait for it.
 */

/** Entrance animation timing. */
const ENTER_MS = 260;
/** Gap between staggered siblings. Capped so long lists never crawl. */
const STAGGER_MS = 45;
const MAX_STAGGER_STEPS = 8;

interface FadeInProps {
  /** Position in a list; later items start slightly later. */
  index?: number;
  /** Distance in px the content rises from. */
  offsetY?: number;
  delay?: number;
  style?: ViewStyle;
}

/** Fades and lifts content into place. */
export function FadeIn({
  children,
  index = 0,
  offsetY = 10,
  delay = 0,
  style,
}: PropsWithChildren<FadeInProps>) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const stagger = Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      delay: delay + stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [offsetY, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

interface PressableScaleProps extends PressableProps {
  /** How far it shrinks while held. */
  scaleTo?: number;
  /** Fires a light tap on press. Off for destructive or repeated actions. */
  haptic?: boolean;
  style?: ViewStyle | ViewStyle[];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that springs inward when held.
 *
 * The scale is subtle by design -- enough to register as a physical response,
 * not enough to make a list feel bouncy when scrolled past quickly.
 *
 * The press target *is* the styled box, rather than a bare Pressable wrapping a
 * styled inner view. That distinction matters: layout styles (`flex: 1`,
 * `width: "31%"`) have to land on the element the parent's flex row actually
 * measures. Nesting them one level deeper silently collapses every such card to
 * its intrinsic content width.
 */
export function PressableScale({
  children,
  scaleTo = 0.97,
  haptic = true,
  style,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PropsWithChildren<PressableScaleProps>) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();

  return (
    <AnimatedPressable
      onPressIn={(e) => {
        spring(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) tapFeedback();
        onPress?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Counts up to a number when it changes.
 *
 * Driven by a render loop rather than an Animated listener: the value has to
 * reach JavaScript to be formatted as text anyway, so there is nothing to gain
 * from the native driver here.
 */
export function useCountUp(value: number, durationMs = 650): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // A large jump on first load looks like a slot machine; ease it instead.
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / durationMs, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = to;
    };
  }, [value, durationMs]);

  return display;
}

/**
 * A progress bar that fills smoothly.
 *
 * Width cannot be driven natively, so this scales on the X axis instead and
 * pins the origin to the left edge -- React Native has no `transformOrigin`.
 */
export function AnimatedBar({
  fraction,
  color = colors.primary,
  track = colors.border,
  height = 6,
}: {
  fraction: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  const clamped = Math.min(Math.max(Number.isFinite(fraction) ? fraction : 0, 0), 1);
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: clamped,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [clamped, progress]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: track, height, borderRadius: height / 2 }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            height,
            borderRadius: height / 2,
            width: width || 1,
            transform: [
              { translateX: -(width || 1) / 2 },
              { scaleX: progress },
              { translateX: (width || 1) / 2 },
            ],
          },
        ]}
      />
    </View>
  );
}

/**
 * Placeholder block that breathes while data loads.
 *
 * Shown instead of a spinner on list screens: a shape roughly where the
 * content will be reads as "almost there" rather than "something is happening
 * somewhere".
 */
export function Skeleton({
  height = 16,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | string;
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          height,
          width: width as ViewStyle["width"],
          borderRadius: radius.sm,
          backgroundColor: colors.border,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** A card-shaped skeleton, matching the list rows it stands in for. */
export function SkeletonRow({ index = 0 }: { index?: number }) {
  return (
    <FadeIn index={index} style={styles.skeletonRow}>
      <Skeleton height={46} width={46} style={{ borderRadius: 23 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton height={14} width="60%" />
        <Skeleton height={11} width="40%" />
      </View>
    </FadeIn>
  );
}

export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View style={{ padding: 24, gap: 12 }}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonRow key={index} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0 },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
  },
});
