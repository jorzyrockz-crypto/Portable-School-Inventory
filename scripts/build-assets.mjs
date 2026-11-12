// Builds every asset CustodianPro needs to run fully offline:
//   assets/app.css   – compiled Tailwind + self-hosted fonts + subsetted Phosphor icons
//   assets/fonts/*   – Inter / JetBrains Mono (variable) + icon fonts (only used glyphs)
//   sw.js            – service worker with a precache list and a content-hash version
//
// Run `npm run build` after editing index.html (new Tailwind classes or icons).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const ASSETS = path.join(ROOT, 'assets');
const FONTS = path.join(ASSETS, 'fonts');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');

fs.rmSync(FONTS, { recursive: true, force: true });
fs.mkdirSync(FONTS, { recursive: true });

const html = read(path.join(ROOT, 'index.html'));

// ---------------------------------------------------------------------------
// 1. Text fonts (variable woff2, latin + latin-ext so "₱" renders offline)
// ---------------------------------------------------------------------------
const TEXT_FONTS = [
  { family: 'Inter Variable', pkg: '@fontsource-variable/inter', prefix: 'inter' },
  { family: 'JetBrains Mono Variable', pkg: '@fontsource-variable/jetbrains-mono', prefix: 'jetbrains-mono' },
];
const SUBSETS = {
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
};

let fontCss = '';
for (const f of TEXT_FONTS) {
  for (const [subset, range] of Object.entries(SUBSETS)) {
    const file = `${f.prefix}-${subset}-wght-normal.woff2`;
    fs.copyFileSync(path.join(NM, f.pkg, 'files', file), path.join(FONTS, file));
    fontCss += `@font-face{font-family:'${f.family}';font-style:normal;font-display:swap;font-weight:100 900;` +
      `src:url(./fonts/${file}) format('woff2-variations'),url(./fonts/${file}) format('woff2');unicode-range:${range}}\n`;
  }
}

// ---------------------------------------------------------------------------
// 2. Phosphor icons – keep only the weights + glyphs index.html actually uses
// ---------------------------------------------------------------------------
const WEIGHTS = { bold: 'Bold', fill: 'Fill', duotone: 'Duotone', regular: 'Regular' };
const usedIcons = new Set(
  [...html.matchAll(/\bph-([a-z0-9-]+)/g)].map((m) => m[1]).filter((n) => !(n in WEIGHTS))
);
const usedWeights = Object.keys(WEIGHTS).filter((w) =>
  w === 'regular' ? /class="[^"]*\bph\b(?!-)/.test(html) : new RegExp(`\\bph-${w}\\b`).test(html)
);

let iconCss = '';
const missing = new Set(usedIcons);
for (const weight of usedWeights) {
  const name = WEIGHTS[weight];
  const dir = path.join(NM, '@phosphor-icons/web/src', weight);
  const css = read(path.join(dir, 'style.css'));
  const sel = weight === 'regular' ? '.ph' : `.ph-${weight}`;

  // Base class rule (font-family, smoothing, …)
  const baseRule = css.match(new RegExp(`\\n\\${sel} \\{[\\s\\S]*?\\n\\}`))[0].trim();

  // Per-icon rules: ".ph-bold.ph-package:before { content: "\e390"; }"
  const codepoints = [];
  let rules = '';
  for (const m of css.matchAll(/\n(\.ph[^{\n]*?)\.ph-([a-z0-9-]+):(before|after) \{([^}]*)\}/g)) {
    const [, , icon, , body] = m;
    if (!usedIcons.has(icon)) continue;
    missing.delete(icon);
    rules += m[0].trim().replace(/\s+/g, ' ') + '\n';
    const cp = body.match(/content: "\\([0-9a-f]+)"/);
    if (cp) codepoints.push(String.fromCodePoint(parseInt(cp[1], 16)));
  }

  const fontFile = `Phosphor-${name}.woff2`;
  const subset = await subsetFont(fs.readFileSync(path.join(dir, fontFile)), codepoints.join(''), {
    targetFormat: 'woff2',
  });
  fs.writeFileSync(path.join(FONTS, fontFile), subset);

  iconCss += `@font-face{font-family:"Phosphor-${name}";src:url(./fonts/${fontFile}) format("woff2");` +
    `font-weight:normal;font-style:normal;font-display:block}\n${baseRule}\n${rules}`;
}
if (missing.size) {
  console.warn(`! Unknown Phosphor icon names in index.html (ignored): ${[...missing].join(', ')}`);
}

// ---------------------------------------------------------------------------
// 3. Tailwind → one stylesheet (fonts + icons + utilities)
// ---------------------------------------------------------------------------
const twOut = path.join(ASSETS, '.tailwind.tmp.css');
execFileSync(
  process.execPath,
  [require.resolve('tailwindcss/lib/cli.js'), '-c', 'tailwind.config.js', '-i', 'src/tailwind.css', '-o', twOut, '--minify'],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }
);
const appCss = `/* Generated by scripts/build-assets.mjs – do not edit by hand. */\n${fontCss}${iconCss}${read(twOut)}`;
fs.rmSync(twOut);
fs.writeFileSync(path.join(ASSETS, 'app.css'), appCss);

// ---------------------------------------------------------------------------
// 4. Vendor scripts, lazy-loaded by index.html (and precached for offline use)
//    qrcode.js – draws the QR codes on printed property labels   (MIT, Kazuhiko Arase)
//    jsQR.js   – reads QR codes from the camera in the scanner    (Apache-2.0, Cosmo Wolfe)
// ---------------------------------------------------------------------------
const VENDOR = path.join(ASSETS, 'vendor');
fs.rmSync(VENDOR, { recursive: true, force: true });
fs.mkdirSync(VENDOR, { recursive: true });
for (const [src, dest] of [
  ['qrcode-generator/dist/qrcode.js', 'qrcode.js'],
  ['jsqr/dist/jsQR.js', 'jsQR.js'],
  ['jsqr/LICENSE', 'jsQR.LICENSE.txt'],
  // fflate.js – unzips .xlsx files for "Import from Excel"     (MIT, Arjun Barrett)
  ['fflate/umd/index.js', 'fflate.js'],
  ['fflate/LICENSE', 'fflate.LICENSE.txt'],
]) {
  fs.copyFileSync(path.join(NM, src), path.join(VENDOR, dest));
}

// ---------------------------------------------------------------------------
// 4a. Firebase (Apache-2.0) for Supply Requests – only the functions src/firebase-entry.js
//     re-exports, bundled to window.FirebaseSDK. ~670 KB, so like the OCR files it is NOT
//     precached: it loads (and is cached) only on devices that use Supply Requests.
//     The project settings live in firebase-config.js (edit that file, no rebuild needed).
// ---------------------------------------------------------------------------
// Every F.xxx / cloud.sdk.xxx the app calls must be re-exported, or that feature breaks only
// on real phones (tests use a stand-in SDK) – fail the build instead.
{
  const entry = read(path.join(ROOT, 'src', 'firebase-entry.js'));
  const exported = new Set(entry.match(/[A-Za-z]+/g));
  const used = new Set([...read(path.join(ROOT, 'index.html')).matchAll(/\b(?:F|cloud\.sdk|FirebaseSDK)\.([A-Za-z]+)/g)].map(m => m[1]));
  const missing = [...used].filter(n => !exported.has(n));
  if (missing.length) throw new Error(`src/firebase-entry.js: also export ${missing.join(', ')} (used in index.html)`);
}
const CLOUD_DIR = path.join(ASSETS, 'cloud');
fs.rmSync(CLOUD_DIR, { recursive: true, force: true });
fs.mkdirSync(CLOUD_DIR, { recursive: true });
const FIREBASE_VERSION = JSON.parse(read(path.join(NM, 'firebase', 'package.json'))).version;
buildSync({
  entryPoints: [path.join(ROOT, 'src', 'firebase-entry.js')],
  outfile: path.join(CLOUD_DIR, 'firebase.js'),
  bundle: true, minify: true, format: 'iife', globalName: 'FirebaseSDK', target: 'es2019',
  legalComments: 'none', logLevel: 'error',
  banner: { js: `/* Firebase JS SDK ${FIREBASE_VERSION} (Apache-2.0, Google LLC) – app, auth, firestore subset */` },
});

// ---------------------------------------------------------------------------
// 4b. Text recognition for "Scan ICS" (Tesseract.js, Apache-2.0). ~7 MB, so it is NOT
//     precached: the service worker keeps it in its own long-lived cache the first
//     time someone scans an ICS (and Tesseract keeps the language data in IndexedDB).
//     The folder name carries the version so a new release never mixes files.
// ---------------------------------------------------------------------------
const OCR_VERSION = JSON.parse(read(path.join(NM, 'tesseract.js', 'package.json'))).version;
const OCR_DIR = path.join(ASSETS, 'ocr');
fs.rmSync(OCR_DIR, { recursive: true, force: true });
const OCR = path.join(OCR_DIR, `tesseract-${OCR_VERSION}`);
// index.html hard-codes the folder (OCR_BASE / OCR_CACHE_NAME) – fail loudly after an upgrade.
if (!read(path.join(ROOT, 'index.html')).includes(`assets/ocr/tesseract-${OCR_VERSION}/`)) {
  throw new Error(`index.html: update OCR_BASE and OCR_CACHE_NAME to tesseract ${OCR_VERSION}`);
}
fs.mkdirSync(OCR, { recursive: true });
for (const [src, dest] of [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/LICENSE.md', 'LICENSE.txt'],
  // LSTM-only engines: one for devices with WebAssembly SIMD (almost every phone since
  // 2021), one fallback. index.html picks the file itself, so the larger
  // "relaxed SIMD" builds are not needed.
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  // English model, "best_int" (fast + accurate enough for typed forms)
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]) {
  fs.copyFileSync(path.join(NM, src), path.join(OCR, dest));
}

// ---------------------------------------------------------------------------
// 5. Service worker with a precache manifest
// ---------------------------------------------------------------------------
const listFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : e.name.startsWith('.') ? [] : [p];
  });

const precache = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'manifest.webmanifest'),
  path.join(ROOT, 'firebase-config.js'), // also network-first in sw.js, so edits apply without a rebuild
  ...listFiles(ASSETS).filter((p) => !p.startsWith(OCR_DIR + path.sep) && !p.startsWith(CLOUD_DIR + path.sep)),
].filter((p) => fs.existsSync(p));

const hash = createHash('sha256');
for (const p of precache) hash.update(rel(p)).update(fs.readFileSync(p));
const version = hash.digest('hex').slice(0, 12);

const urls = ['./', ...precache.map((p) => `./${rel(p)}`)];
const swTemplate = read(path.join(ROOT, 'src', 'sw.template.js'));
const sw = swTemplate
  .replace('__CACHE_VERSION__', version)
  .replace('__OCR_VERSION__', OCR_VERSION)
  .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2).replace(/\n/g, '\n  '));
fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' KB';
console.log(`✓ assets/app.css (${kb(path.join(ASSETS, 'app.css'))})`);
console.log(`✓ icons: ${usedIcons.size - missing.size} glyphs across ${usedWeights.join(', ')}`);
console.log(`✓ sw.js  cache version ${version}, ${urls.length} precached URLs`);
console.log(`✓ assets/cloud/firebase.js  Firebase ${FIREBASE_VERSION} (${(fs.statSync(path.join(CLOUD_DIR, 'firebase.js')).size / 1024).toFixed(0)} KB, cached on first use)`);
console.log(`✓ assets/ocr/tesseract-${OCR_VERSION} (${(listFiles(OCR).reduce((n, p) => n + fs.statSync(p).size, 0) / 1048576).toFixed(1)} MB, cached on first use)`);
