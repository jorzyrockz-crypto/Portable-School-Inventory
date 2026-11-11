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
// 4. Service worker with a precache manifest
// ---------------------------------------------------------------------------
const listFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : e.name.startsWith('.') ? [] : [p];
  });

const precache = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'manifest.webmanifest'),
  ...listFiles(ASSETS),
].filter((p) => fs.existsSync(p));

const hash = createHash('sha256');
for (const p of precache) hash.update(rel(p)).update(fs.readFileSync(p));
const version = hash.digest('hex').slice(0, 12);

const urls = ['./', ...precache.map((p) => `./${rel(p)}`)];
const swTemplate = read(path.join(ROOT, 'src', 'sw.template.js'));
const sw = swTemplate
  .replace('__CACHE_VERSION__', version)
  .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2).replace(/\n/g, '\n  '));
fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' KB';
console.log(`✓ assets/app.css (${kb(path.join(ASSETS, 'app.css'))})`);
console.log(`✓ icons: ${usedIcons.size - missing.size} glyphs across ${usedWeights.join(', ')}`);
console.log(`✓ sw.js  cache version ${version}, ${urls.length} precached URLs`);
