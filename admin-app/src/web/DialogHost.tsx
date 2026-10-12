import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import Button from "@/components/Button";
import { colors, fontSize, radius, shadow, spacing, type } from "@/constants/theme";
import { DialogButton, DialogRequest, closeDialog, currentDialog, subscribeDialogs } from "./dialog";

/**
 * Draws the dialog requested through `Alert.alert`, one at a time.
 *
 * Laid out like the Android alert it replaces: up to two buttons sit in a row
 * on the right; three or more stack, so a choice like "Take photo / Choose
 * from gallery / Remove photo" stays readable at phone width.
 */
export default function DialogHost() {
  const [dialog, setDialog] = useState<DialogRequest | null>(currentDialog());

  useEffect(() => subscribeDialogs(() => setDialog(currentDialog())), []);

  if (!dialog) return null;

  const dismiss = () => {
    if (dialog.cancelable) closeDialog(dialog.id, null);
  };
  const stacked = dialog.buttons.length > 2;
  const choices = dialog.buttons.filter((button) => button.style !== "cancel").length;

  const variantFor = (button: DialogButton) => {
    if (button.style === "cancel") return "ghost" as const;
    if (button.style === "destructive") return "danger" as const;
    return choices > 1 ? ("secondary" as const) : ("primary" as const);
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.scrim} onPress={dismiss} accessibilityLabel="Close dialog">
        <Pressable style={styles.card} onPress={() => undefined} accessibilityRole="alert">
          <Text style={styles.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          <View style={stacked ? styles.stack : styles.row}>
            {dialog.buttons.map((button, index) => (
              <Button
                key={`${dialog.id}-${index}`}
                title={button.text ?? "OK"}
                variant={variantFor(button)}
                compact={!stacked}
                onPress={() => closeDialog(dialog.id, button)}
                style={stacked ? styles.stackButton : undefined}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.raised,
  },
  title: { ...type.section, color: colors.text },
  message: {
    ...type.body,
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  stack: { gap: spacing.sm, marginTop: spacing.lg },
  stackButton: { width: "100%" },
});
