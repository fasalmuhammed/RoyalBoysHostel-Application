/**
 * Turns an `expo export -p web` directory into a single artifact page.
 *
 * The claude.ai artifact frame admits fonts only as data: URIs and serves no
 * absolute paths, so the bundle is inlined into one HTML body and every asset
 * the app actually loads (the Inter faces, the Ionicons font, navigation
 * PNGs) is swapped from its `/assets/...` URL for a data: URI. Icon fonts the
 * app never renders keep their URL; nothing requests them.
 *
 * Usage: node scripts/build-artifact.mjs <export-dir> <out.html> "<Title>"
 */
import fs from "node:fs";
import path from "node:path";

const [, , exportDir, outFile, title = "Hostel Manager"] = process.argv;
if (!exportDir || !outFile) {
  console.error('Usage: node scripts/build-artifact.mjs <export-dir> <out.html> "<Title>"');
  process.exit(1);
}

const INLINE_FONT = /\/(Inter_\d+\w+|Ionicons)\.[0-9a-f]+\.ttf$/;
const MIME = { ttf: "font/ttf", png: "image/png" };
/** The artifact page must stay under 16 MB including data: URIs. */
const PAGE_LIMIT = 16 * 1024 * 1024;

const html = fs.readFileSync(path.join(exportDir, "index.html"), "utf8");
const scriptSrc = html.match(/<script src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/)?.[1];
if (!scriptSrc) throw new Error("No web bundle found in index.html.");

let inlined = 0;
const js = fs
  .readFileSync(path.join(exportDir, scriptSrc), "utf8")
  .replace(/"(\/assets\/[^"]+\.(ttf|png))"/g, (literal, url, ext) => {
    if (ext === "ttf" && !INLINE_FONT.test(url)) return literal;
    const file = path.join(exportDir, url);
    if (!fs.existsSync(file)) return literal;
    inlined += 1;
    return JSON.stringify(`data:${MIME[ext]};base64,${fs.readFileSync(file).toString("base64")}`);
  })
  // An inline script ends at the first "</script", wherever it appears.
  .replace(/<\/script/gi, "<\\/script");

const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Single light theme by choice: the app's palette is light-only, so the
// background is pinned rather than following the viewer's theme.
const page = `<title>${escapeHtml(title)}</title>
<style>
:root { --app-bg: #F6F6F9; color-scheme: light }
html, body { height: 100% }
body { margin: 0; overflow: hidden; background: var(--app-bg) }
#root { display: flex; height: 100%; flex: 1 }
</style>
<noscript>This app needs JavaScript.</noscript>
<div id="root"></div>
<script>${js}</script>
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, page);

const size = Buffer.byteLength(page);
console.log(`Wrote ${outFile}: ${(size / 1024 / 1024).toFixed(2)} MB, ${inlined} assets inlined.`);
if (size > PAGE_LIMIT) {
  console.error("Over the 16 MB artifact limit.");
  process.exit(1);
}
