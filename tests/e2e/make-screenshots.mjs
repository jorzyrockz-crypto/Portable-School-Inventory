// Renders the install-sheet screenshots listed in manifest.webmanifest ("screenshots") from
// the real app with the sample inventory and the test backend:
//   assets/screenshots/phone-home.png, phone-items.png, phone-requests.png  1080×2400
//   assets/screenshots/tablet-items.png                                     1920×1200
// Run (with the site served on BASE_URL): node make-screenshots.mjs. Output is committed; the
// files are not precached by sw.js (Chrome fetches them only for its install sheet).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, sleep, ev, until, openPhone, closeAll } from './lib/harness.mjs';

const sharp = createRequire(import.meta.url)('../../node_modules/sharp');
const OUT = new URL('../../assets/screenshots/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const backend = createBackend();

async function shoot(page, file) {
  await ev(page, () => { document.getElementById('appToast').classList.add('hidden'); window.scrollTo(0, 0); });
  await sleep(400);
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(new URL(file, OUT).pathname);
  const m = await sharp(new URL(file, OUT).pathname).metadata();
  out(`✓ assets/screenshots/${file} ${m.width}×${m.height}`);
}
async function setup(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(page, () => {
    loadSampleInventory();
    schoolInfo.custodian = 'Rosa Villanueva';
    ['45111609-MM-P01', '45121517-DO-C02'].forEach(c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); });
  });
}

try {
  // Phone: 360×800 CSS px at 3× = 1080×2400.
  const a = await openPhone('custodian', backend, { width: 360, height: 800 });
  await a.setViewport({ width: 360, height: 800, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // Show the sheet as on a phone where notifications were allowed (headless Chrome says "denied").
  await a.evaluateOnNewDocument(() => {
    window.Notification = class { static get permission() { return 'granted'; } static requestPermission() { return Promise.resolve('granted'); } };
  });
  await setup(a);
  await ev(a, () => { openRequestsView(); gateGo('custodian'); }); // signed out: the sign-in screen carries the form
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(a, () => closeInvite());
  await until(a, () => !!notifScope() && loadNotifs().primed.requests, 'primed', 10000);
  const sid = await ev(a, () => reqRole.schoolId);

  const t = await openPhone('teacher', backend);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join');
  await ev(t, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 7 – Science'; });
  await t.click('#joinBtn');
  await until(t, () => reqRole && cloud.user, 'joined');
  for (const w of ['Bond paper, A4, 80 gsm', 'Whiteboard marker, black']) {
    await ev(t, x => { openRequestForm(); rfSearch.value = x; addReqLine(); reqDraft.lines[0].qty = 5; sendRequest(); }, w);
    await sleep(600);
  }
  await until(a, () => loadNotifs().items.length >= 2, 'notifications', 10000);

  await ev(a, () => switchMainView('HOME'));
  await shoot(a, 'phone-home.png');
  await ev(a, () => switchMainView('ITEMS'));
  await shoot(a, 'phone-items.png');
  await ev(a, () => { openRequestsView(); setReqTab('pending'); openNotifPanel(); });
  await shoot(a, 'phone-requests.png');
  await ev(a, () => closeNotifPanel());

  // Tablet (landscape): 1024×640 at 1.875× = 1920×1200.
  await a.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1.875, isMobile: false, hasTouch: true });
  await sleep(1500);                                   // (the viewport change reloads the page)
  await until(a, () => !document.getElementById('notifBtn').classList.contains('hidden'), 'bell', 10000);
  await ev(a, () => switchMainView('ITEMS'));
  await shoot(a, 'tablet-items.png');
} catch (e) {
  out('FAIL: ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  await closeAll();
}
