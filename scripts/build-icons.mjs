// Generates the home-screen / PWA icons in assets/icons from the master artwork
// src/app-icon.png (the folder-with-a-face tile on a light background).
// Run with `npm run icons`; the output is committed.
//
//   icon-192 / icon-512 / favicon-32  rounded tile, transparent corners (purpose "any")
//   maskable-512                      full-bleed: the tile's blue extended to the edges and the
//                                     artwork kept inside the 80% safe circle (Android adaptive)
//   apple-touch-icon                  full-bleed square (iOS rounds it itself)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'app-icon.png');
const OUT = path.join(ROOT, 'assets', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- 1. Find the tile on the light background --------------------------------------------
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const isTile = (x, y) => {
  const i = (y * W + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn > 40 || mx < 200;
};
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!isTile(x, y)) continue;
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const INSET = 3;                                  // drop the anti-aliased light fringe
const side = Math.min(x1 - x0, y1 - y0) + 1 - INSET * 2;
const tile = await sharp(SRC).removeAlpha()
  .extract({ left: x0 + INSET, top: y0 + INSET, width: side, height: side })
  .resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer();

// The artwork's corner radius is about 26% of the tile (measured: ~180px on a 697px tile).
const RADIUS = 0.26;
const roundMask = size => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * RADIUS}" fill="#fff"/></svg>`);
const rounded = await sharp(tile).ensureAlpha()
  .composite([{ input: roundMask(1024), blend: 'dest-in' }]).png().toBuffer();

// ---- 2. Full-bleed version for maskable / Apple ------------------------------------------
// Background: the tile's own vertical gradient (navy at the top, brighter blue lower down).
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#122e76"/><stop offset="0.55" stop-color="#22479f"/><stop offset="1" stop-color="#3563c5"/>
  </linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/></svg>`);
// The tile is placed smaller so the face stays in the safe zone. To avoid an "icon inside an
// icon" look, its bevelled rim is trimmed and its blue background fades into the gradient;
// the folder and face keep crisp edges.
const RIM = 0.035;                                       // bevel width, share of the tile
const inner = await sharp(tile)
  .extract({ left: Math.round(1024 * RIM), top: Math.round(1024 * RIM), width: Math.round(1024 * (1 - 2 * RIM)), height: Math.round(1024 * (1 - 2 * RIM)) })
  .resize(1024, 1024).raw().toBuffer();
const hard = await sharp(roundMask(1024)).greyscale().raw().toBuffer();
const soft = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="40" y="40" width="944" height="944" rx="${944 * RADIUS}" fill="#fff"/></svg>`))
  .blur(36).greyscale().raw().toBuffer();
const rgba = Buffer.alloc(1024 * 1024 * 4);
for (let i = 0, j = 0; i < 1024 * 1024; i++, j += 3) {
  const r = inner[j], g = inner[j + 1], b = inner[j + 2];
  const blueBg = b > 100 && b - r > 70 && b - g > 50 && r < 80;   // the tile's navy/blue backdrop
  rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b;
  rgba[i * 4 + 3] = blueBg ? Math.min(hard[i], soft[i]) : hard[i];
}
const blended = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
async function fullBleed(scale) {
  const s = Math.round(1024 * scale), o = Math.round((1024 - s) / 2);
  const art = await sharp(blended).resize(s, s).png().toBuffer();
  return sharp(bg).composite([{ input: art, left: o, top: o }]).png().toBuffer();
}
const maskable = await fullBleed(0.84);   // face stays inside Android's 80% safe circle
const apple = await fullBleed(0.94);

// ---- 3. Write the files ------------------------------------------------------------------
const targets = [
  { file: 'icon-192.png', size: 192, src: rounded },
  { file: 'icon-512.png', size: 512, src: rounded },
  { file: 'favicon-32.png', size: 32, src: rounded },
  { file: 'maskable-512.png', size: 512, src: maskable },
  { file: 'apple-touch-icon.png', size: 180, src: apple },
];
for (const t of targets) {
  await sharp(t.src).resize(t.size, t.size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, palette: t.size >= 192, quality: 95 }).toFile(path.join(OUT, t.file));
  console.log(`✓ assets/icons/${t.file}`);
}

// ---- 4. Small glyph icons ----------------------------------------------------------------
// badge-96: the white silhouette Android shows in the status bar for a notification
// (only the alpha channel is used). shortcut-*: long-press menu of the home-screen icon.
const PH = path.join(ROOT, 'node_modules', '@phosphor-icons', 'core', 'assets');
const glyph = (name, weight = 'fill') => fs.readFileSync(path.join(PH, weight, `${name}-${weight}.svg`), 'utf8')
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
async function writeSvg(file, size, svg) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(OUT, file));
  console.log(`✓ assets/icons/${file}`);
}
await writeSvg('badge-96.png', 96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="384" height="384">
  <g fill="#fff">${glyph('folder-simple')}</g></svg>`);
for (const [file, name] of [['shortcut-scan.png', 'scan'], ['shortcut-count.png', 'list-checks'], ['shortcut-items.png', 'package'], ['shortcut-requests.png', 'tray']]) {
  await writeSvg(file, 96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="384" height="384">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#122e76"/><stop offset="1" stop-color="#2e5bbd"/></linearGradient></defs>
    <rect width="256" height="256" rx="56" fill="url(#g)"/>
    <g transform="translate(64 64) scale(0.5)" fill="#fff">${glyph(name, 'bold')}</g></svg>`);
}
