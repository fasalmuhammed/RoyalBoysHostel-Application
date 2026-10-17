import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import Glass from "@/components/Glass";
import { useReducedMotion } from "@/components/Liquid";
import { colors, font, fontSize, spacing, type } from "@/constants/theme";
import { DialogButton, DialogRequest, closeDialog, currentDialog, subscribeDialogs } from "./dialog";

/**
 * Draws the dialog requested through `Alert.alert`, one at a time, on every
 * platform -- the phone never falls back to the plain system dialog.
 *
 * Laid out like an iOS alert on a pane of frosted glass: centred title and
 * message, then full-width buttons split by hairlines. Two buttons sit side
 * by side; three or more stack, with "Cancel" always last. The pane springs
 * in from slightly larger, as iOS does.
 */
export default function DialogHost() {
  const [dialog, setDialog] = useState<DialogRequest | null>(currentDialog());
  const reduced = useReducedMotion();
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeDialogs(() => setDialog(currentDialog())), []);

  useEffect(() => {
    if (!dialog) return;
    appear.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.timing(appear, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }).start();
    }
  }, [dialog?.id, reduced, appear]);

  if (!dialog) return null;

  const dismiss = () => {
    if (dialog.cancelable) closeDialog(dialog.id, null);
  };

  // "Cancel" goes last when stacked and first (left) when side by side, as on iOS.
  const cancel = dialog.buttons.filter((button) => button.style === "cancel");
  const others = dialog.buttons.filter((button) => button.style !== "cancel");
  const stacked = dialog.buttons.length > 2 || dialog.buttons.some((button) => (button.text ?? "").length > 16);
  const ordered = stacked ? [...others, ...cancel] : [...cancel, ...others];

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={styles.scrim} onPress={dismiss} accessibilityLabel="Close dialog">
        <Animated.View
          style={[
            styles.wrap,
            {
              opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
              transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }],
            },
          ]}
        >
          <Pressable onPress={() => undefined} accessibilityRole="alert">
            <Glass thick radius={22} intensity={60} style={styles.card}>
              <View style={styles.text}>
                <Text style={styles.title}>{dialog.title}</Text>
                {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
              </View>
              <View style={stacked ? undefined : styles.row}>
                {ordered.map((button, index) => (
                  <DialogAction
                    key={`${dialog.id}-${index}`}
                    button={button}
                    // The one action the dialog is asking for reads bold.
                    strong={button.isPreferred || (others.length === 1 && button === others[0])}
                    divider={!stacked && index > 0}
                    onPress={() => closeDialog(dialog.id, button)}
                  />
                ))}
              </View>
            </Glass>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function DialogAction({
  button,
  strong,
  divider,
  onPress,
}: {
  button: DialogButton;
  strong: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const destructive = button.style === "destructive";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        divider && styles.actionDivider,
        pressed && { backgroundColor: "rgba(120, 120, 128, 0.16)" },
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: destructive ? colors.danger : colors.primary },
          strong && { fontFamily: font.semibold },
        ]}
        numberOfLines={2}
      >
        {button.text ?? "OK"}
      </Text>
    </Pressable>
  );
}

const HAIRLINE = "rgba(60, 60, 67, 0.22)";

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  wrap: { width: "100%", maxWidth: 300 },
  card: { overflow: "hidden" },
  text: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg + 2,
    paddingBottom: spacing.md + 4,
    gap: 6,
  },
  title: { ...type.section, color: colors.text, textAlign: "center" },
  message: {
    ...type.body,
    fontSize: fontSize.sm,
    lineHeight: 19,
    color: colors.text,
    opacity: 0.8,
    textAlign: "center",
  },
  row: { flexDirection: "row" },
  action: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: HAIRLINE,
  },
  actionDivider: { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: HAIRLINE },
  actionText: { fontFamily: font.regular, fontSize: scaleText(17), textAlign: "center" },
});

function scaleText(size: number): number {
  return Math.round(size * (fontSize.md / 15));
}
