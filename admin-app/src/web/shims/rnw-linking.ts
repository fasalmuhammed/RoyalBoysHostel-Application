/**
 * `Linking` for the artifact frame.
 *
 * The frame reliably follows real links only, and custom schemes such as
 * `whatsapp://` mean nothing to a browser. WhatsApp links become https://wa.me
 * links, and every URL is opened through an anchor element.
 */
// @ts-ignore -- react-native-web ships no type declarations.
import WebLinking from "react-native-web/dist/exports/Linking";

/** `whatsapp://send?phone=X&text=Y` -> `https://wa.me/X?text=Y`. */
export function toWebUrl(url: string): string {
  if (!url.startsWith("whatsapp://")) return url;
  const query = new URLSearchParams(url.split("?")[1] ?? "");
  const phone = (query.get("phone") ?? "").replace(/\D/g, "");
  const text = query.get("text");
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function follow(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const Linking = {
  addEventListener: (...args: unknown[]) => WebLinking.addEventListener(...args),
  getInitialURL: (): Promise<string | null> => WebLinking.getInitialURL(),
  /** Any link can be attempted from a browser; what follows is up to the viewer's device. */
  canOpenURL: async (_url: string): Promise<boolean> => true,
  openURL: async (url: string): Promise<void> => {
    follow(toWebUrl(url));
  },
  openSettings: async (): Promise<void> => undefined,
  sendIntent: async (): Promise<void> => undefined,
};

export default Linking;
