import React, { useCallback, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import Glass from "./Glass";
import { FadeIn } from "./Motion";
import { colors, spacing, type } from "@/constants/theme";

export interface MenuItem {
  key: string;
  label: string;
  sublabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Shown in red, for actions that remove something. */
  destructive?: boolean;
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_WIDTH = 264;
const EDGE = 12;

/**
 * A small glass menu that drops down from the control that opened it, the way
 * iOS menus do -- for a handful of choices, where a full sheet would be too much.
 *
 *   const menu = usePopoverMenu();
 *   <Pressable ref={menu.anchorRef} onPress={menu.open} />
 *   <PopoverMenu {...menu.props} items={...} onSelect={...} />
 */
export function usePopoverMenu() {
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, []);
  const close = useCallback(() => setAnchor(null), []);

  return { anchorRef, open, close, isOpen: anchor !== null, props: { anchor, onClose: close } };
}

export default function PopoverMenu({
  anchor,
  onClose,
  items,
  selectedKey,
  onSelect,
  title,
}: {
  anchor: Anchor | null;
  onClose: () => void;
  items: MenuItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  title?: string;
}) {
  if (!anchor) return null;

  const screen = Dimensions.get("window");
  // Lined up with the control's right edge, but never off the screen.
  const left = Math.min(Math.max(anchor.x + anchor.width - MENU_WIDTH, EDGE), screen.width - MENU_WIDTH - EDGE);
  const below = anchor.y + anchor.height + 8;
  // Opens upwards when there is no room underneath.
  const roomBelow = screen.height - below > items.length * 58 + (title ? 36 : 0) + 24;
  const position = roomBelow ? { top: below } : { bottom: screen.height - anchor.y + 8 };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <FadeIn offsetY={roomBelow ? -8 : 8} style={{ position: "absolute", width: MENU_WIDTH, left, ...position }}>
        <Glass radius={20} intensity={60} style={styles.menu}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {items.map((item, index) => {
            const tint = item.destructive ? colors.danger : colors.text;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  onClose();
                  onSelect(item.key);
                }}
                style={({ pressed }) => [styles.item, index > 0 && styles.itemBorder, pressed && styles.itemPressed]}
                accessibilityRole="menuitem"
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: tint }]} numberOfLines={1}>{item.label}</Text>
                  {item.sublabel ? <Text style={styles.sublabel} numberOfLines={2}>{item.sublabel}</Text> : null}
                </View>
                {selectedKey === item.key ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : item.icon ? (
                  <Ionicons name={item.icon} size={18} color={tint} />
                ) : null}
              </Pressable>
            );
          })}
        </Glass>
      </FadeIn>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: { overflow: "hidden" },
  title: {
    ...type.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs + 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    minHeight: 46,
  },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(60, 60, 67, 0.2)" },
  itemPressed: { backgroundColor: "rgba(0, 0, 0, 0.06)" },
  label: { ...type.body, fontFamily: type.bodyStrong.fontFamily },
  sublabel: { ...type.caption, color: colors.textMuted, marginTop: 1 },
});
