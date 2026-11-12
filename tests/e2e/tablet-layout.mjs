// Tablet layout (touch screen, 800 × 1280 portrait like a 10–11" Android tablet): the phone-first
// column is scaled up to fill the screen (root font size follows the width), so the installed
// app no longer looks small and lost in the middle. Phones and computers keep 16 px.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const SHOTS = process.env.SHOTS || '/tmp';
const rootPx = page => ev(page, () => parseFloat(getComputedStyle(document.documentElement).fontSize));
const fits = page => ev(page, () => document.documentElement.scrollWidth <= innerWidth);
const width = (page, sel) => ev(page, s => { const el = [...document.querySelectorAll(s)].find(e => e.offsetParent); return el ? el.getBoundingClientRect().width : 0; }, sel);

try {
  out('1 tablet portrait, touch: sign-in screen');
  const t = await openPhone('tablet', backend, { width: 800, height: 1280 });
  await t.setViewport({ width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  await t.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await ev(t, () => matchMedia('(pointer: coarse)').matches), 'touch screen reports a coarse pointer');
  const px = await rootPx(t);
  check(px > 18.5 && px < 19.5, `text scaled up to fill the tablet (root ${px.toFixed(2)} px)`);
  check(await fits(t), 'welcome fits the screen width');
  await t.screenshot({ path: `${SHOTS}/tablet-welcome.png` });
  await ev(t, () => gateGo('custodian'));
  await until(t, () => !!document.getElementById('rcEmail'), 'sign-in form');
  check(await fits(t), 'custodian sign-in fits the screen width');
  const small = await ev(t, () => parseFloat(getComputedStyle([...document.querySelectorAll('.text-\\[11px\\], .text-\\[10px\\]')].find(e => e.offsetParent) || document.body).fontSize));
  check(small >= 11.5, `small captions grow with the rest (${small.toFixed(1)} px)`);

  out('2 tablet: Home and pop-ups');
  await ev(t, () => { rcSchool.value = 'Oquendo Elementary School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await t.click('#rcCreate');
  await until(t, () => reqRole && reqRole.role === 'custodian' && cloud.user && !document.documentElement.classList.contains('gated'), 'signed in');
  await sleep(500);
  await ev(t, async () => { closeInvite(); document.getElementById('appToast').classList.add('hidden'); await loadSampleInventory(); schoolInfo.school = '114656 - Oquendo Elementary School'; switchMainView('HOME'); document.getElementById('appToast').classList.add('hidden'); });
  await sleep(400);
  const col = await width(t, '#viewHome');
  check(col >= 650 && col <= 720, `Home column fills most of the tablet (${Math.round(col)} of 800 px)`);
  check(await fits(t), 'Home fits the screen width');
  await t.screenshot({ path: `${SHOTS}/tablet-home.png` });
  for (const [open, close] of [['switchMainView("ITEMS")', ''], ['switchMainView("CATALOG")', ''], ['switchMainView("REPORTS")', ''], ['openSchoolModal()', 'closeSchoolModal()'], ['openItemModal(items.find(i => i.qty > 0).code)', 'closeItemModal()'], ['openMoreMenu()', '']]) {
    await ev(t, s => eval(s), open);
    await sleep(300);
    check(await fits(t), `${open}: fits the screen width`);
    await t.screenshot({ path: `${SHOTS}/tablet-${open.replace(/\W+/g, '-').slice(0, 30)}.png` });
    if (close) await ev(t, s => eval(s), close);
  }

  out('3 phones and computers are unchanged');
  await t.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(200);
  check(await rootPx(t) === 16, 'phone (390 px, touch): 16 px');
  await t.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(200);
  check(await ev(t, () => !matchMedia('(pointer: coarse)').matches), 'computer reports a mouse');
  check(await rootPx(t) === 16, 'computer (1280 px, mouse): 16 px');
  // A zoomed browser tab on the tablet (Chrome's zoom / text size) reports a narrower width,
  // so it is not enlarged a second time.
  await t.setViewport({ width: 640, height: 1024, deviceScaleFactor: 1.875, isMobile: true, hasTouch: true });
  await sleep(200);
  check(await rootPx(t) === 16, 'tablet tab zoomed to 125 % (640 px wide): left at 16 px');
  await t.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  await sleep(200);
  check(await rootPx(t) === 20, 'tablet landscape: capped at 20 px');
  check(await fits(t), 'tablet landscape fits the screen width');
} catch (e) {
  out('FAIL: crashed —', e.stack || e); process.exitCode = 1;
} finally {
  await closeAll();
  summary('tablet layout');
}
