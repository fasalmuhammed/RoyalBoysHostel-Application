/**
 * `Alert.alert` for the artifact frame.
 *
 * The frame never shows browser dialogs, and react-native-web's Alert is a
 * no-op, so confirmations and error messages would silently vanish. This
 * keeps React Native's call signature -- every screen's `Alert.alert(...)`
 * works unchanged -- and queues each request for <DialogHost />, which draws
 * it in the app's own style.
 */

export interface DialogButton {
  text?: string;
  onPress?: (value?: string) => void;
  style?: "default" | "cancel" | "destructive";
  isPreferred?: boolean;
}

export interface DialogOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  cancelable: boolean;
  onDismiss?: () => void;
}

let nextId = 1;
let queue: DialogRequest[] = [];
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The dialog on screen now, or null. Later requests wait their turn. */
export function currentDialog(): DialogRequest | null {
  return queue[0] ?? null;
}

/** Closes a dialog, then runs the chosen button's handler (if any). */
export function closeDialog(id: number, button: DialogButton | null): void {
  const request = queue.find((item) => item.id === id);
  if (!request) return;
  queue = queue.filter((item) => item.id !== id);
  notify();
  const run = () => (button ? button.onPress?.() : request.onDismiss?.());
  // On a phone, let the dialog finish closing first: Android will not open
  // the camera, gallery or share sheet over a window that is still closing.
  if (typeof document !== "undefined") run();
  else setTimeout(run, 320);
}

export const Alert = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions): void {
    queue = [
      ...queue,
      {
        id: nextId++,
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }],
        // Matches Android: a dialog with buttons is dismissed by choosing one.
        cancelable: options?.cancelable ?? false,
        onDismiss: options?.onDismiss,
      },
    ];
    notify();
  },

  /** Not used by the app; shown as a plain message rather than lost. */
  prompt(title: string, message?: string): void {
    Alert.alert(title, message);
  },
};
