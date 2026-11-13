import { check, sleep, ev } from './harness.mjs';

// Layout facts for the current screen: horizontal overflow and on-screen tap targets under 32 px.
export const layout = page => ev(page, () => {
  const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 1 && b.height > 1; };
  const small = [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [onclick]')]
    .filter(el => vis(el) && !el.closest('.hidden'))
    .filter(el => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0 && (b.height < 32 || b.width < 32); })
    .filter(el => !el.closest('#appToast'))
    .map(el => `${(el.innerText || el.value || el.getAttribute('aria-label') || el.id || el.tagName).trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
  // Buttons with no name for screen readers (no text, aria-label or title)
  const unnamed = [...document.querySelectorAll('button')].filter(el => vis(el) && !el.closest('.hidden'))
    .filter(el => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; })
    .filter(el => !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title'))
    .map(el => (el.id || el.getAttribute('onclick') || el.className).slice(0, 40));
  // White text on a coloured button: at least 4.5:1 (UI review finding 1)
  const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const lowContrast = [...document.querySelectorAll('button')].filter(el => vis(el) && !el.closest('.hidden'))
    .filter(el => { const st = getComputedStyle(el); return st.color === 'rgb(255, 255, 255)' && /^rgb\(/.test(st.backgroundColor) && (el.innerText || '').trim(); })
    .map(el => ({ t: el.innerText.trim().slice(0, 24), r: (1.05) / (lum(getComputedStyle(el).backgroundColor) + 0.05) }))
    .filter(x => x.r < 4.5).map(x => `${x.t} ${x.r.toFixed(2)}:1`);
  // Faint grey text (slate-400 on white, 2.56:1; UI review finding 2)
  const faint = document.documentElement.classList.contains('dark') ? [] : [...document.querySelectorAll('p, span, label, h2, h3, h4, li, button')]
    .filter(el => vis(el) && !el.closest('.hidden') && el.childElementCount === 0 && (el.innerText || '').trim())
    .filter(el => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; })
    .filter(el => getComputedStyle(el).color === 'rgb(148, 163, 184)').map(el => el.innerText.trim().slice(0, 30));
  return { wide: document.documentElement.scrollWidth > innerWidth, small, unnamed, lowContrast, faint };
});
export async function screen(page, name, allow = []) {
  await sleep(300);
  const r = await layout(page);
  check(!r.wide, `${name}: fits the screen width`);
  const bad = r.small.filter(s => !allow.some(a => s.startsWith(a)));
  check(bad.length === 0, `${name}: buttons at least 32 px${bad.length ? ' — ' + bad.join(', ') : ''}`);
  check(r.unnamed.length === 0, `${name}: every button has a name${r.unnamed.length ? ' — ' + r.unnamed.join(', ') : ''}`);
  check(r.lowContrast.length === 0, `${name}: white button text at least 4.5:1${r.lowContrast.length ? ' — ' + r.lowContrast.join(', ') : ''}`);
  check(r.faint.length === 0, `${name}: no faint grey text${r.faint.length ? ' — ' + r.faint.slice(0, 5).join(', ') : ''}`);
}
