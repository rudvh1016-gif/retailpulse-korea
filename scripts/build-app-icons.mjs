/**
 * Regenerates the PWA home-screen icons from `public/favicon.svg`.
 *
 * One-off generator, not part of build/test/CI — the PNGs it writes are
 * committed. Run it only when the mark changes:
 *
 *   node scripts/build-app-icons.mjs
 *
 * Android needs a raster icon of at least 192px before it will install a
 * real app (a WebAPK) rather than a browser shortcut, and a `maskable` icon
 * before the launcher will crop the mark to the device's icon shape instead
 * of letterboxing it inside a white square. Both are rendered onto opaque
 * #FFFFFF so the icon matches the product's pure-white surface.
 *
 * `sharp` arrives transitively (via the build toolchain) rather than as a
 * declared dependency, so this script says so plainly instead of failing
 * with a bare module error.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("This one-off generator needs `sharp` (npm i -D sharp). The committed PNGs are already in public/.");
  process.exit(1);
}

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** `inset` is the share of the canvas left as margin on each side. */
async function render(size, inset, out) {
  const mark = Math.round(size * (1 - inset * 2));
  const logo = await sharp(svg, { density: 600 }).resize(mark, mark, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, top: Math.round((size - mark) / 2), left: Math.round((size - mark) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(new URL(`../public/${out}`, import.meta.url), png);
  console.log(`${out}  ${size}x${size}  ${png.length} bytes`);
}

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
// `any`: a modest margin, because the launcher draws the square as-is.
await render(192, 0.12, "icon-192.png");
await render(512, 0.12, "icon-512.png");
// `maskable`: the outer 20% of each edge can be cropped away by the device.
await render(512, 0.22, "icon-maskable-512.png");
// iOS reads `apple-touch-icon` and applies its own rounded mask; 180px is
// the size current iPhones ask for.
await render(180, 0.12, "apple-touch-icon.png");
