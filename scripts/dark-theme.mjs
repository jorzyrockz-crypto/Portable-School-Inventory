// Dark mode for CustodianPro, generated from the Tailwind color classes index.html uses.
//
// The app is written with light-theme utilities (bg-white, text-slate-900, bg-amber-50 …) in
// thousands of places, many inside JS templates. Rather than adding a dark: twin to every one
// of them, this maps each light color class to a dark counterpart under `html.dark`:
//   · neutrals (white / slate / black) are flipped: white cards → deep navy, dark text → light
//   · pale tints (amber-50, rose-100, brand-200 …) become a translucent wash of the 500 shade
//   · strong text tints (emerald-700 …) become the light 300/400 shade so they stay readable
//   · saturated fills (bg-brand-600 buttons, bg-amber-500 …) are left alone
// Variants (hover:, focus:, disabled:, group-hover:, sm:/md:/lg:/xl:) are carried over so the
// dark rule never beats the interaction state. Everything sits in @media screen: printed forms
// keep their black-on-white look. New classes in index.html are picked up on the next build.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tw = require('tailwindcss/colors');

const FAMILIES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const palette = Object.fromEntries(FAMILIES.map((f) => [f, tw[f]]));
palette.brand = tw.indigo; // tailwind.config.js brand = the indigo scale
const NEUTRAL = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);

// Dark surfaces, darkest → lightest. Page background is set in index.html (#0b1220).
const SURFACE = { card: '#121a2b', raised: '#172033', soft: '#1c2638', line: '#243044', strong: '#334155' };

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a = 1) => {
  const [r, g, b] = hexRgb(hex);
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+a.toFixed(3)})`;
};

// → [hex, alpha] or null (keep the light color).
function mapNeutral(kind, shade) {
  if (kind === 'bg') {
    return { 50: SURFACE.raised, 100: SURFACE.soft, 200: SURFACE.line, 300: SURFACE.strong, 400: '#4b5a70',
      700: '#475569', 800: '#334155', 900: '#2b3a52' }[shade] || null; // 900/950 with /alpha = scrims, kept below
  }
  if (kind === 'text' || kind === 'placeholder') {
    return { 50: '#0f172a', 100: '#1e293b', 200: '#334155', 300: '#4b5970', 400: '#6b7a90', 500: '#8e9bb0',
      600: '#a8b4c6', 700: '#cbd5e1', 800: '#e2e8f0', 900: '#f1f5f9', 950: '#f8fafc' }[shade] || null;
  }
  // border / divide / ring
  return { 50: SURFACE.soft, 100: SURFACE.soft, 200: SURFACE.line, 300: SURFACE.strong, 400: '#475569' }[shade] || null;
}

function mapTint(kind, family, shade) {
  const c = palette[family];
  if (kind === 'bg') {
    const a = { 50: 0.12, 100: 0.2, 200: 0.3 }[shade];
    return a ? [c[500], a] : null;
  }
  if (kind === 'text' || kind === 'placeholder') {
    const s = { 500: 400, 600: 400, 700: 300, 800: 200, 900: 200, 950: 100 }[shade];
    return s ? [c[s], 1] : null;
  }
  const a = { 50: 0.18, 100: 0.22, 200: 0.32, 300: 0.45 }[shade];
  return a ? [c[500], a] : null;
}

// One class → { color, alpha } in dark mode, or null.
function darkColor(kind, color, alphaPct) {
  const alpha = alphaPct == null ? 1 : alphaPct / 100;
  let hex, a = 1;
  if (color === 'white') {
    if (kind === 'text') return null; // white text on colored buttons stays white
    if (kind === 'bg' && alphaPct != null && alphaPct <= 30) return null; // white glints on navy/colored chips
    hex = kind === 'bg' ? SURFACE.card : kind === 'ring' ? SURFACE.card : SURFACE.line;
  } else if (color === 'black') {
    if (kind === 'bg') return null;
    hex = kind === 'text' ? '#f1f5f9' : '#64748b';
  } else {
    const [family, shadeStr] = color.split(/-(?=\d+$)/);
    const shade = +shadeStr;
    if (!palette[family] || !palette[family][shade]) return null;
    if (NEUTRAL.has(family)) {
      if (kind === 'bg' && shade >= 900 && alphaPct != null) return null; // modal scrims
      hex = mapNeutral(kind, shade);
      if (!hex) return null;
    } else {
      const m = mapTint(kind, family, shade);
      if (!m) return null;
      [hex, a] = m;
    }
  }
  return rgba(hex, a * alpha);
}

function lightColor(color, alphaPct) {
  const a = alphaPct == null ? 1 : alphaPct / 100;
  if (color === 'white') return rgba('#ffffff', a);
  if (color === 'black') return rgba('#000000', a);
  const [family, shade] = color.split(/-(?=\d+$)/);
  const hex = palette[family] && palette[family][shade];
  return hex ? rgba(hex, a) : null;
}

const PROP = {
  bg: (c) => `background-color:${c}`,
  text: (c) => `color:${c}`,
  border: (c) => `border-color:${c}`,
  divide: (c) => `border-color:${c}`,
  ring: (c) => `--tw-ring-color:${c}`,
  placeholder: (c) => `color:${c}`,
};
const STATE = { hover: ':hover', focus: ':focus', 'focus-visible': ':focus-visible', 'focus-within': ':focus-within', active: ':active', disabled: ':disabled' };
const STATE_ORDER = ['', 'group-hover', 'focus-within', 'hover', 'focus', 'focus-visible', 'active', 'disabled'];
const SCREENS = { sm: 640, md: 768, lg: 1024, xl: 1280 };
const esc = (cls) => cls.replace(/([:/.[\]%])/g, '\\$1');

export function buildDarkCss(html) {
  const re = /(?<![\w:-])((?:(?:hover|focus|focus-visible|focus-within|active|disabled|group-hover|sm|md|lg|xl):)*)(bg|text|border|divide|ring|placeholder)-(white|black|[a-z]+-\d{2,3})(?:\/(\d{1,3}))?(?![\w/-])/g;
  const seen = new Map();
  for (const m of html.matchAll(re)) {
    const [cls, variantStr, kind, color, alphaStr] = m;
    if (seen.has(cls)) continue;
    const variants = variantStr ? variantStr.slice(0, -1).split(':') : [];
    const screens = variants.filter((v) => v in SCREENS);
    const states = variants.filter((v) => !(v in SCREENS));
    if (screens.length > 1 || states.length > 1) continue;
    const alpha = alphaStr == null ? null : +alphaStr;
    // A variant whose color is kept must still be re-stated under html.dark, or the dark
    // rule of the element's base class (e.g. bg-white) would win over hover:bg-brand-700.
    const value = darkColor(kind, color, alpha) || (variants.length ? lightColor(color, alpha) : null);
    if (!value) continue;
    const state = states[0] || '';
    let sel = `.${esc(cls)}${STATE[state] || ''}`;
    if (state === 'group-hover') sel = `.group:hover ${sel}`;
    if (kind === 'divide') sel += '>:not([hidden])~:not([hidden])';
    if (kind === 'placeholder') sel += '::placeholder';
    seen.set(cls, { screen: screens[0] || '', state, rule: `html.dark ${sel}{${PROP[kind](value)}}` });
  }
  const rules = [...seen.values()].sort((a, b) =>
    (a.screen ? SCREENS[a.screen] : 0) - (b.screen ? SCREENS[b.screen] : 0) ||
    STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  let css = '';
  let open = '';
  for (const r of rules) {
    if (r.screen !== open) {
      if (open) css += '}';
      if (r.screen) css += `@media (min-width:${SCREENS[r.screen]}px){`;
      open = r.screen;
    }
    css += r.rule;
  }
  if (open) css += '}';
  return { css: `@media screen{${css}}\n`, count: rules.length };
}
