import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import { WEB_FRAME_WIDTH } from "@/constants/theme";

/**
 * Width of the column the app is drawn in on a wide screen.
 *
 * The app is laid out for phones, so on a laptop it sits in a phone-width
 * column. The dashboard's "Both hostels" view is the exception: it lists every
 * record and asks for a wide column while it is on screen.
 */
export const WIDE_FRAME_WIDTH = 1180;

let wide = false;
const listeners = new Set<() => void>();

function setWide(next: boolean): void {
  if (wide === next) return;
  wide = next;
  listeners.forEach((listener) => listener());
}

/** The column width to draw the app at right now. */
export function useFrameWidth(): number {
  const [isWide, setIsWide] = useState(wide);
  useEffect(() => {
    const listener = () => setIsWide(wide);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return isWide ? WIDE_FRAME_WIDTH : WEB_FRAME_WIDTH;
}

/** Called by a screen that wants the wide column while it is focused and `on` is true. */
export function useWideFrame(on = true): void {
  useFocusEffect(
    useCallback(() => {
      setWide(on);
      return () => setWide(false);
    }, [on])
  );
}
