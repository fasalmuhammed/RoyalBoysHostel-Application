/**
 * Browser stand-in for `expo-print`.
 *
 * `printToFileAsync({ html })` renders the receipt HTML to a PDF with jsPDF,
 * whose html() renderer writes real (selectable) text, and stores it in the
 * in-memory file system so the share shim can offer it as a download. The
 * artifact frame cannot open a print dialog, so `printAsync` is not offered.
 */
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import { writeVirtualFile } from "./file-system";

const ROOT = "rcpt-print-root";
/** A4 at 96 dpi, the width the receipt layout is drawn at. */
const PAGE_WIDTH_PX = 794;

let counter = 0;

/**
 * Scopes the document's CSS to the render container, so rules written for a
 * standalone page (`body`, `table`, `*`) never touch the app around it.
 */
function scopeCss(css: string): string {
  return css.replace(/([^{}]+)\{/g, (_match, selectors: string) => {
    const scoped = selectors
      .split(",")
      .map((selector) => {
        const s = selector.trim();
        if (!s) return s;
        if (s === "body" || s === "html") return `.${ROOT}`;
        return `.${ROOT} ${s.replace(/^(html|body)\s+/, "")}`;
      })
      .join(", ");
    return `${scoped} {`;
  });
}

function mount(html: string): HTMLElement {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const css = Array.from(parsed.querySelectorAll("style")).map((style) => style.textContent ?? "").join("\n");

  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH_PX}px;background:#fff;`;
  const style = document.createElement("style");
  style.textContent = scopeCss(css);
  const root = document.createElement("div");
  root.className = ROOT;
  root.innerHTML = parsed.body.innerHTML;
  host.append(style, root);
  document.body.appendChild(host);
  return host;
}

export async function printToFileAsync({ html }: { html: string; base64?: boolean }): Promise<{
  uri: string;
  numberOfPages: number;
}> {
  // jsPDF looks for html2canvas on the global before trying to load it itself.
  (globalThis as { html2canvas?: typeof html2canvas }).html2canvas = html2canvas;

  const host = mount(html);
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    await doc.html(host.querySelector(`.${ROOT}`) as HTMLElement, {
      x: 0,
      y: 0,
      width: pageWidth,
      windowWidth: PAGE_WIDTH_PX,
      autoPaging: "text",
      html2canvas: { backgroundColor: "#ffffff" },
    });
    counter += 1;
    const uri = `file:///cache/print/receipt-${counter}.pdf`;
    writeVirtualFile(uri, new Uint8Array(doc.output("arraybuffer")));
    return { uri, numberOfPages: doc.getNumberOfPages() };
  } finally {
    host.remove();
  }
}

export async function printAsync(): Promise<void> {
  throw new Error("Printing is not available here. Save the receipt as a PDF instead.");
}
