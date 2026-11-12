// App updates: a new version downloaded by the service worker is announced in the window
// title, in the app's own title bar (installed on a computer, Window Controls Overlay), with a
// bar under the header and in More → About; Restart loads it; "What's new" once afterwards; a
// worker that brings the version already running is not announced. Also the About sheet
// (banner, share), link-preview tags and the manifest.
// Runs its own little web server so it can hand out a "new" sw.js like a real deploy would.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { out, check, sleep, ev, until, summary } from './lib/harness.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const VERSION = SW.match(/const CACHE = 'custodianpro-([0-9a-f]{12})'/)[1];
const NEW_VERSION = '0123456789ab';
let swVariant = '';      // '' as built · 'same' different bytes, same version · 'new' next release
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (url.pathname === '/sw.js' && swVariant) {
    const body = swVariant === 'new' ? SW.replace(`custodianpro-${VERSION}`, `custodianpro-${NEW_VERSION}`) : SW + '\n// same release, rebuilt\n';
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' });
    return res.end(body);
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;
const errors = [];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || await chromium.executablePath(), args: process.env.CHROME_PATH ? ['--no-sandbox'] : chromium.args, headless: true });

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800 });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', async d => { page.lastDialog = d.message(); if (page.dismissConfirm && d.type() === 'confirm') await d.dismiss(); else await d.accept(); });
  return page;
}
const toastText = page => ev(page, () => document.getElementById('appToast').classList.contains('hidden') ? '' : document.getElementById('appToast').innerText);
const visible = (page, id) => ev(page, id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'; }, id);

try {
  out('1 first open: offline-ready, version known');
  const p = await newPage();
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await until(p, () => !!navigator.serviceWorker.controller && !!swReg, 'controlled', 10000);
  check(await ev(p, () => APP_VERSION) === VERSION, `page version = sw.js cache version (${VERSION})`);
  check(await ev(p, () => document.title === BASE_TITLE && !appUpdate.ready), 'no update notice');
  check(!(await visible(p, 'updateBar')) && !(await visible(p, 'titleBar')), 'no update bar; no custom title bar in a normal tab');

  out('2 a rebuilt worker with the same version: not announced');
  swVariant = 'same';
  await ev(p, () => openAbout());
  check(await ev(p, () => /Version [0-9a-f]{12}/.test(document.getElementById('aboutBody').innerText)), 'About shows the version');
  await p.click('#aboutCheck');
  await until(p, () => /latest version/.test(document.getElementById('appToast').innerText), 'latest toast', 10000);
  check(await ev(p, () => !appUpdate.ready && !document.title.startsWith('Update ready')), '“You have the latest version”; nothing announced');

  out('3 next release: announced everywhere');
  swVariant = 'new';
  await sleep(300);
  await p.click('#aboutCheck');
  await until(p, () => appUpdate.ready, 'update ready', 15000);
  check(await ev(p, () => appUpdate.newVersion) === NEW_VERSION, `new version ${NEW_VERSION} detected`);
  check(await ev(p, () => document.title.startsWith('Update ready · CustodianPro')), `window title: “${await ev(p, () => document.title)}”`);
  check(await visible(p, 'updateBar'), 'bar under the header: “A new version is ready · Restart”');
  check(await visible(p, 'moreUpdateDot'), 'More → About shows an “Update” tag');
  check(await ev(p, () => !!document.getElementById('aboutRestart')), 'About sheet offers Restart');
  check(/A new version is ready/.test(await toastText(p)) && /Restart/.test(await toastText(p)), 'toast with Restart');
  await ev(p, () => closeAbout());

  out('4 installed on a computer with Chrome’s title bar folded in');
  await ev(p, () => { Object.defineProperty(navigator, 'windowControlsOverlay', { configurable: true, value: { visible: true, addEventListener() {} } }); syncTitleBarMode(); });
  const tb = await ev(p, () => {
    const bar = document.getElementById('titleBar').getBoundingClientRect();
    const up = document.getElementById('tbUpdate');
    return { shown: getComputedStyle(document.getElementById('titleBar')).display === 'flex', top: bar.top, h: bar.height, bg: getComputedStyle(document.getElementById('titleBar')).backgroundColor,
      up: up.offsetParent !== null && /Update ready · Restart/.test(up.innerText), header: getComputedStyle(document.querySelector('header')).top, pad: getComputedStyle(document.body).paddingTop };
  });
  check(tb.shown && tb.top === 0 && tb.h === 33 && tb.bg === 'rgb(18, 46, 118)', `navy title bar at the top (${tb.h}px)`);
  check(tb.up, 'title bar: “Update ready · Restart”');
  check(tb.header === '33px' && tb.pad === '33px', 'header and page sit below it');
  await p.screenshot({ path: '/tmp/e2e_u_titlebar.png' });

  out('5 Later, then Restart');
  await ev(p, () => snoozeUpdate());
  check(!(await visible(p, 'updateBar')) && (await ev(p, () => document.title.startsWith('Update ready'))), 'Later hides the bar; title still says Update ready');
  await ev(p, () => openSchoolModal());
  p.dismissConfirm = true;
  await ev(p, () => { window.__stay = 1; applyUpdate(); });
  check(/form that is open will close/.test(p.lastDialog || '') && await ev(p, () => window.__stay === 1), 'asks first when a form is open (Cancel keeps it)');
  p.dismissConfirm = false;
  await ev(p, () => closeSchoolModal());
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('#tbUpdate')]);
  await until(p, () => /up to date/.test(document.getElementById('appToast').innerText), 'up to date toast', 5000);
  check(await ev(p, () => !appUpdate.ready && document.title === BASE_TITLE && document.getElementById('updateBar').classList.contains('hidden')), 'after Restart: “CustodianPro is up to date”, notices gone');

  out('6 What’s new once after an update');
  await ev(p, () => localStorage.setItem(SEEN_RELEASE_KEY, '2026-10-requests'));
  await p.reload({ waitUntil: 'networkidle0' });
  await until(p, () => /Updated · /.test(document.getElementById('appToast').innerText), 'whats new toast', 5000);
  const latestTitle = await ev(p, () => WHATS_NEW[0].title);
  check((await toastText(p)).includes(`Updated · ${latestTitle}`), `toast: ${(await toastText(p)).replace(/\s+/g, ' ')}`);
  await p.click('#appToastAction');
  await sleep(300);
  const about = await ev(p, () => ({ open: !document.getElementById('aboutPanel').classList.contains('hidden'), text: document.getElementById('aboutBody').innerText,
    img: document.querySelector('#aboutPanel img').naturalWidth, releases: document.querySelectorAll('[data-release]').length }));
  check(about.open && /What’s new/i.test(about.text) && about.text.includes(latestTitle) && about.releases === 3, 'What’s new opens About with the latest 3 releases');
  check(about.img === 1024, 'banner shown in About');
  await p.screenshot({ path: '/tmp/e2e_u_about.png' });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  check(!/Updated · /.test(await toastText(p)), 'shown only once');

  out('7 share the app link');
  await ev(p, () => { navigator.share = undefined; window.__copied = ''; navigator.clipboard.writeText = async t => { window.__copied = t; }; });
  await ev(p, () => shareApp());
  check(await ev(p, b => window.__copied === b, BASE) && /Link copied/.test(await toastText(p)), 'no share sheet: link copied');

  out('8 first-ever open: no What’s new');
  // (a separate browser: extra contexts crash this headless build)
  const fresh = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || await chromium.executablePath(), args: process.env.CHROME_PATH ? ['--no-sandbox'] : chromium.args, headless: true });
  try {
    const f = await fresh.newPage();
    f.on('pageerror', e => errors.push(String(e)));
    await f.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1200);
    check(!/Updated · /.test(await toastText(f)) && await ev(f, () => localStorage.getItem(SEEN_RELEASE_KEY) === WHATS_NEW[0].id), 'new user: remembered silently');
  } finally { await fresh.close().catch(() => {}); }

  out('9 offline, link previews, manifest');
  await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'networkidle0' });
  await ev(p, () => openAbout());
  await sleep(300);
  check(await ev(p, () => document.querySelector('#aboutPanel img').naturalWidth) === 1024, 'banner works offline (precached webp)');
  await p.setOfflineMode(false);
  const meta = await ev(p, () => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')].map(m => [m.getAttribute('property') || m.name, m.content])));
  const OG = 'https://custodianpro.vercel.app/assets/brand/og-image.png';
  check(meta['og:image'] === OG && meta['og:image:secure_url'] === OG && meta['twitter:image'] === OG && meta['og:image:type'] === 'image/png', 'og:image / X card: the banner (og-image.png)');
  check(meta['og:image:width'] === '1200' && meta['og:image:height'] === '630' && meta['twitter:card'] === 'summary_large_image', '1200×630, large preview card');
  check(meta['og:title'] === 'CustodianPro – School Inventory' && meta['twitter:title'] === meta['og:title'] && /property custodians/.test(meta['og:description']) && meta['og:url'] === 'https://custodianpro.vercel.app/' && meta['og:locale'] === 'en_PH', 'title, description, address, locale');
  const seo = await ev(p, () => ({ title: BASE_TITLE, canonical: document.querySelector('link[rel=canonical]').href, desc: document.querySelector('meta[name=description]').content,
    ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent) }));
  check(seo.title === 'CustodianPro – School Inventory & APP-CSE 2027' && seo.canonical === 'https://custodianpro.vercel.app/' && seo.desc.length > 80 && seo.desc.length <= 300, `page title “${seo.title}”, canonical, description`);
  check(seo.ld['@type'] === 'WebApplication' && seo.ld.image === OG && seo.ld.offers.price === '0', 'structured data (WebApplication) parses');
  const og = await (await import('node:module')).createRequire(import.meta.url)('../../node_modules/sharp')(path.join(ROOT, 'assets/brand/og-image.png')).metadata();
  check(og.width === 1200 && og.height === 630 && fs.statSync(path.join(ROOT, 'assets/brand/og-image.png')).size < 1024 * 1024, `og-image.png ${og.width}×${og.height}, under 1 MB`);
  check(!/brand\/[a-z-]+\.png/.test(SW), 'preview images deployed, not precached');
  const cdp = await p.target().createCDPSession();
  const m = await cdp.send('Page.getAppManifest');
  const inst = await cdp.send('Page.getInstallabilityErrors');
  check(m.errors.length === 0 && inst.installabilityErrors.length === 0 && JSON.parse(m.data).display_override[0] === 'window-controls-overlay', 'manifest valid, installable, title bar mode offered');
} catch (e) {
  check(false, 'unexpected error: ' + (e && e.stack || e));
} finally {
  if (errors.length) out('page errors ' + JSON.stringify(errors));
  check(errors.length === 0, 'no page errors');
  await browser.close().catch(() => {});
  server.close();
  summary('app-updates');
}
