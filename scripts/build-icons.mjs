// Generates the home-screen / PWA icons in assets/icons from the Phosphor "package" glyph
// (the same mark used in the app header). Run with `npm run icons`; the output is committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const glyphSvg = fs.readFileSync(
  path.join(ROOT, 'node_modules/@phosphor-icons/core/assets/bold/package-bold.svg'),
  'utf8'
);
const glyphPath = glyphSvg.match(/<path d="([^"]+)"/)[1];

const BRAND = '#4f46e5';
const BRAND_DARK = '#4338ca';

// rounded = true  → rounded-square tile (purpose "any")
// rounded = false → full-bleed square, glyph inside the maskable safe zone
function iconSvg({ rounded, glyphScale }) {
  const size = 512;
  const g = size * glyphScale;
  const offset = (size - g) / 2;
  const radius = rounded ? 112 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND}"/>
      <stop offset="1" stop-color="${BRAND_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${g / 256})">
    <path d="${glyphPath}" fill="#ffffff"/>
  </g>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true, glyphScale: 0.62 },
  { file: 'icon-512.png', size: 512, rounded: true, glyphScale: 0.62 },
  { file: 'maskable-512.png', size: 512, rounded: false, glyphScale: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, glyphScale: 0.58 },
  { file: 'favicon-32.png', size: 32, rounded: true, glyphScale: 0.7 },
];

for (const t of targets) {
  await sharp(Buffer.from(iconSvg(t))).resize(t.size, t.size).png({ compressionLevel: 9 }).toFile(path.join(OUT, t.file));
  console.log(`✓ assets/icons/${t.file}`);
}
fs.writeFileSync(path.join(OUT, 'icon.svg'), iconSvg({ rounded: true, glyphScale: 0.62 }));
console.log('✓ assets/icons/icon.svg');
