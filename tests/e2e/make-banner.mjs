// Renders the sharing banner from the real app screenshots (assets/screenshots/, made by
// make-screenshots.mjs), so the picture always matches the app:
//   assets/brand/og-image.png        1200×630  link previews (Messenger, Facebook, Viber, X…)
//   assets/brand/social-preview.png  1280×640  GitHub → Settings → Social preview (upload by hand)
//   assets/brand/banner.png / .webp  1024×434  README header and More → About
// Run (with the site served on BASE_URL): node make-screenshots.mjs && node make-banner.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { BASE_URL, out } from './lib/harness.mjs';

const sharp = createRequire(import.meta.url)('../../node_modules/sharp');
const BRAND = new URL('../../assets/brand/', import.meta.url).pathname;
const TMP = new URL('../../.banner-tmp.html', import.meta.url).pathname;   // served next to index.html (same origin: fonts load)

const html = (w, h) => `<!doctype html><html><head><meta charset="utf-8"><base href="${BASE_URL}">
<link rel="stylesheet" href="assets/app.css">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  body { font-family: 'Inter Variable', system-ui, sans-serif; color: #0f172a; position: relative;
    background: radial-gradient(120% 90% at 0% 0%, #ffffff 0%, #eef2ff 55%, #e0e7ff 100%); }
  .art { position: absolute; inset: 0; background: url(assets/brand/login-landscape.webp) right -40px bottom -10px / auto 78% no-repeat; opacity: .22;
    -webkit-mask-image: linear-gradient(to left, #000 20%, transparent 75%); mask-image: linear-gradient(to left, #000 20%, transparent 75%); }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(#c7d2fe 1.2px, transparent 1.3px); background-size: 22px 22px; opacity: .55;
    -webkit-mask-image: linear-gradient(to right, #000, transparent 45%); mask-image: linear-gradient(to right, #000, transparent 45%); }
  .left { position: absolute; left: ${h * 0.095}px; top: 50%; transform: translateY(-50%); width: ${w * 0.5}px; }
  .brand { display: flex; align-items: center; gap: ${h * 0.03}px; }
  .brand img { width: ${h * 0.17}px; height: ${h * 0.17}px; border-radius: 22%; box-shadow: 0 10px 30px -8px rgba(18,46,118,.45); }
  .name { font-size: ${h * 0.098}px; font-weight: 850; letter-spacing: -0.035em; color: #122e76; line-height: 1; }
  .kicker { font-size: ${h * 0.033}px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #4f46e5; margin-top: ${h * 0.012}px; }
  .tag { font-size: ${h * 0.046}px; font-weight: 650; line-height: 1.25; color: #1e293b; margin-top: ${h * 0.045}px; letter-spacing: -0.01em; }
  ul { list-style: none; padding: 0; margin-top: ${h * 0.04}px; display: grid; gap: ${h * 0.019}px; }
  li { display: flex; align-items: center; gap: ${h * 0.022}px; font-size: ${h * 0.034}px; font-weight: 600; color: #334155; }
  li i { width: ${h * 0.058}px; height: ${h * 0.058}px; border-radius: 30%; display: inline-flex; align-items: center; justify-content: center; font-size: ${h * 0.034}px; flex: none; }
  .foot { margin-top: ${h * 0.045}px; display: flex; gap: ${h * 0.016}px; align-items: center; }
  .pill { font-size: ${h * 0.028}px; font-weight: 750; padding: ${h * 0.012}px ${h * 0.024}px; border-radius: 999px; }
  .phones { position: absolute; right: ${h * 0.07}px; top: 0; bottom: 0; width: ${w * 0.42}px; }
  .phone { position: absolute; width: ${h * 0.43}px; aspect-ratio: 1080 / 2160; border-radius: ${h * 0.05}px; background: #0f172a; padding: ${h * 0.009}px;
    box-shadow: 0 30px 60px -20px rgba(15,23,42,.45), 0 0 0 1px rgba(15,23,42,.08); }
  .phone div { width: 100%; height: 100%; border-radius: ${h * 0.042}px; background-size: 100% auto; background-position: top center; background-repeat: no-repeat; }
  .p1 { left: 0; top: ${h * 0.13}px; transform: rotate(-4deg); }
  .p2 { right: 0; top: ${h * 0.06}px; transform: rotate(3deg); z-index: 2; }
  .card { position: absolute; z-index: 3; background: #fff; border-radius: ${h * 0.03}px; box-shadow: 0 18px 40px -14px rgba(15,23,42,.35); border: 1px solid #e2e8f0;
    display: flex; align-items: center; gap: ${h * 0.02}px; padding: ${h * 0.02}px ${h * 0.026}px; }
  .card i { width: ${h * 0.065}px; height: ${h * 0.065}px; border-radius: 30%; display: inline-flex; align-items: center; justify-content: center; font-size: ${h * 0.036}px; flex: none; }
  .card b { display: block; font-size: ${h * 0.026}px; font-weight: 800; color: #0f172a; white-space: nowrap; }
  .card span { display: block; font-size: ${h * 0.022}px; color: #64748b; white-space: nowrap; margin-top: 1px; }
  .c1 { left: ${-h * 0.07}px; bottom: ${h * 0.12}px; }
  .c2 { right: ${-h * 0.02}px; bottom: ${h * 0.07}px; }
</style></head><body>
  <div class="art"></div><div class="dots"></div>
  <div class="left">
    <div class="brand"><img src="assets/icons/icon-512.png" alt="">
      <div><div class="name">CustodianPro</div><div class="kicker">School Inventory</div></div></div>
    <p class="tag">Property and supplies for school custodians and teachers, on any phone.</p>
    <ul>
      <li><i class="ph-bold ph-qr-code" style="background:#ede9fe;color:#6d28d9"></i>QR property tags and physical count</li>
      <li><i class="ph-bold ph-files" style="background:#e0e7ff;color:#4338ca"></i>ICS, PAR, RIS, ITR and year-end COA forms</li>
      <li><i class="ph-bold ph-paper-plane-tilt" style="background:#fef3c7;color:#b45309"></i>Teachers request supplies from their phones</li>
    </ul>
    <div class="foot">
      <span class="pill" style="background:#122e76;color:#fff">Free</span>
      <span class="pill" style="background:#d1fae5;color:#047857"><i class="ph-bold ph-wifi-slash"></i> Works offline</span>
      <span class="pill" style="background:#fff;color:#334155;border:1px solid #e2e8f0">custodianpro.vercel.app</span>
    </div>
  </div>
  <div class="phones">
    <div class="phone p1"><div style="background-image:url(assets/screenshots/phone-items.png)"></div></div>
    <div class="phone p2"><div style="background-image:url(assets/screenshots/phone-home.png)"></div></div>
    <div class="card c1"><i class="ph-bold ph-tray" style="background:#fef3c7;color:#d97706"></i><div><b>New supply request</b><span>Ana Reyes · Bond paper, A4</span></div></div>
    <div class="card c2"><i class="ph-bold ph-check-circle" style="background:#d1fae5;color:#059669"></i><div><b>Physical count</b><span>133 serviceable · 96%</span></div></div>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || await chromium.executablePath(), args: process.env.CHROME_PATH ? ['--no-sandbox'] : chromium.args, headless: true });
async function render(w, h, scale) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
  fs.writeFileSync(TMP, html(w, h));
  await page.goto(BASE_URL + '.banner-tmp.html?' + w + 'x' + h, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}
try {
  const og = await render(1200, 630, 2);
  await sharp(og).resize(1200, 630).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toFile(BRAND + 'og-image.png');
  const gh = await render(1280, 640, 2);
  await sharp(gh).resize(1280, 640).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toFile(BRAND + 'social-preview.png');
  // 1024×434: laid out at 1200×509 (same proportions), then scaled down
  const bn = await render(1200, 509, 2);
  await sharp(bn).resize(1024, 434).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toFile(BRAND + 'banner.png');
  await sharp(bn).resize(1024, 434).webp({ quality: 82 }).toFile(BRAND + 'banner.webp');
  for (const f of ['og-image.png', 'social-preview.png', 'banner.png', 'banner.webp']) {
    const m = await sharp(BRAND + f).metadata();
    out(`✓ assets/brand/${f} ${m.width}×${m.height} ${Math.round(m.size / 1024) || ''}`);
  }
} finally {
  fs.rmSync(TMP, { force: true });
  await browser.close();
}
