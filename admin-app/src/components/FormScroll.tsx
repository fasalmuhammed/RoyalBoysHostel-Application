import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  TextInput,
} from "react-native";

/**
 * A form's scrolling page that keeps out of the keyboard's way.
 *
 * Android (edge to edge, as Expo 54 draws it) no longer shrinks the screen
 * when the keyboard opens, so a plain ScrollView leaves the lower half of a
 * form under the keyboard with no way to scroll to it. This page:
 *   - adds room at the bottom the height of the keyboard, so everything below
 *     can still be scrolled to;
 *   - scrolls the box being typed in to just above the keyboard;
 *   - gives every box a "Next" key that moves on to the box below (see Input).
 */

const GAP = 24;

interface FormScrollApi {
  /** Brings the focused box into view. */
  reveal: () => void;
  /** Lets a text box take part in "Next". Returns the unregister function. */
  register: (input: TextInput) => () => void;
  /** Moves the cursor to the box below this one; closes the keyboard after the last. */
  focusNext: (from: TextInput) => void;
}

const FormScrollContext = createContext<FormScrollApi | null>(null);

export function useFormScroll(): FormScrollApi | null {
  return useContext(FormScrollContext);
}

function measure(input: TextInput): Promise<{ x: number; y: number; height: number } | null> {
  return new Promise((resolve) => {
    try {
      input.measureInWindow((x, y, _width, height) => resolve(height > 0 ? { x, y, height } : null));
    } catch {
      resolve(null);
    }
  });
}

export default function FormScroll({ children, contentContainerStyle, onScroll, ...rest }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputs = useRef(new Set<TextInput>());

  const reveal = useCallback(() => {
    // Phones only: a browser scrolls a focused box into view by itself.
    if (Platform.OS === "web" || keyboardTop.current === null) return;
    const focused = (TextInput.State?.currentlyFocusedInput?.() ?? null) as TextInput | null;
    if (!focused) return;
    void measure(focused).then((box) => {
      if (!box || keyboardTop.current === null) return;
      const bottom = box.y + box.height + GAP;
      const top = box.y - GAP * 3;
      let delta = 0;
      if (bottom > keyboardTop.current) delta = bottom - keyboardTop.current;
      else if (top < 0) delta = top;
      if (delta !== 0) scrollRef.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
    });
  }, []);

  useEffect(() => {
    // Android only reports the keyboard once it is up; iOS tells us just before.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates.height;
      keyboardTop.current = event.endCoordinates.screenY || Dimensions.get("window").height - height;
      setKeyboardHeight(height);
      // Once the extra room is laid out, scroll the box into view.
      setTimeout(reveal, Platform.OS === "ios" ? 250 : 60);
    };
    const onHide = () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    };
    const shown = Keyboard.addListener(showEvent, onShow);
    const hidden = Keyboard.addListener(hideEvent, onHide);
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [reveal]);

  const api = useMemo<FormScrollApi>(
    () => ({
      reveal: () => setTimeout(reveal, 80),
      register: (input) => {
        inputs.current.add(input);
        return () => inputs.current.delete(input);
      },
      focusNext: (from) => {
        // The next box is the nearest one below on the page as it is now, so
        // fields that appear or hide (college / company) are handled too.
        void Promise.all([...inputs.current].map(async (input) => ({ input, box: await measure(input) }))).then((all) => {
          const here = all.find((item) => item.input === from)?.box;
          if (!here) return Keyboard.dismiss();
          const next = all
            .filter((item) => item.input !== from && item.box)
            .filter(({ box }) => box!.y > here.y + 4 || (Math.abs(box!.y - here.y) <= 4 && box!.x > here.x))
            .sort((a, b) => a.box!.y - b.box!.y || a.box!.x - b.box!.x)[0];
          if (next) next.input.focus();
          else Keyboard.dismiss();
        });
      },
    }),
    [reveal]
  );

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  // Room for the keyboard on top of whatever space the page already keeps.
  const basePadding = Number(StyleSheet.flatten(contentContainerStyle)?.paddingBottom ?? 0) || 0;

  return (
    <FormScrollContext.Provider value={api}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        {...rest}
        onScroll={handleScroll}
        contentContainerStyle={[contentContainerStyle, keyboardHeight > 0 && { paddingBottom: basePadding + keyboardHeight }]}
      >
        {children}
      </ScrollView>
    </FormScrollContext.Provider>
  );
}
