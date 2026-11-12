// Phone layout (390 × 844): nothing wider than the screen, buttons big enough for a thumb,
// pop-ups slide up from the bottom, toasts stay clear of the sheet buttons, money is not cut off.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const SHOTS = process.env.SHOTS || '/tmp';

// Layout facts for the current screen: horizontal overflow and on-screen tap targets under 32 px.
const layout = page => ev(page, () => {
  const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 1 && b.height > 1; };
  const small = [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [onclick]')]
    .filter(el => vis(el) && !el.closest('.hidden'))
    .filter(el => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0 && (b.height < 32 || b.width < 32); })
    .filter(el => !el.closest('#appToast'))
    .map(el => `${(el.innerText || el.value || el.getAttribute('aria-label') || el.id || el.tagName).trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
  return { wide: document.documentElement.scrollWidth > innerWidth, small };
});
async function screen(page, name, allow = []) {
  await sleep(300);
  const r = await layout(page);
  check(!r.wide, `${name}: fits the screen width`);
  const bad = r.small.filter(s => !allow.some(a => s.startsWith(a)));
  check(bad.length === 0, `${name}: buttons at least 32 px${bad.length ? ' — ' + bad.join(', ') : ''}`);
}
const box = (page, sel) => ev(page, s => { const b = document.querySelector(s).getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; }, sel);
const fullyShown = (page, sel) => ev(page, s => { const el = document.querySelector(s); return el.scrollWidth <= el.clientWidth + 1; }, sel);

try {
  out('1 sign-in screen');
  const a = await openPhone('custodian', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await screen(a, 'welcome');
  await ev(a, () => gateGo('custodian'));
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in form');
  await screen(a, 'custodian sign-in');
  await ev(a, () => showToast('Testing where the toast goes'));
  const t = await box(a, '#appToast');
  check(t.top > 844 / 2, 'toast on the sign-in screen sits at the bottom, not over the logo');
  check(t.left >= 8 && t.right <= 390 - 8, 'toast fits inside the screen');

  await ev(a, () => { rcSchool.value = 'Oquendo Elementary School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian' && cloud.user && !document.documentElement.classList.contains('gated'), 'signed in');
  await sleep(500);
  await ev(a, () => { closeInvite(); document.getElementById('appToast').classList.add('hidden'); });

  out('2 Home');
  await screen(a, 'empty Home');
  await ev(a, async () => { await loadSampleInventory(); schoolInfo.school = '114656 - Oquendo Elementary School'; });
  await ev(a, () => { const eq = items.filter(i => i.type === 'EQUIPMENT' && i.qty >= 2 && i.qty <= 6).slice(0, 2); eq.forEach(i => { openUnitsModal(i.code); generateUnitTags(); closeUnitsModal(); }); });
  await ev(a, () => { document.getElementById('appToast').classList.add('hidden'); switchMainView('HOME'); });
  await screen(a, 'Home');
  // The faded art never shows its bottom edge as a stripe, even on a short page
  await ev(a, () => { homeSearch.value = 'bond'; renderHome(); });
  check(await ev(a, () => { const b = getComputedStyle(document.body); const first = b.backgroundSize.split(',')[0].trim().split(' ')[1]; const px = parseFloat(first); return first.endsWith('%') ? true : px >= 6 * 16 + 2 * innerWidth - 2; }), 'fade covers the whole picture');
  await ev(a, () => { homeSearch.value = ''; renderHome(); });

  out('3 encode sheet: a toast moves above the sheet, away from Save & next');
  await ev(a, () => showToast('Saved'));
  await ev(a, () => openEncodeSheet(items.find(i => i.qty > 0).code));
  await sleep(300);
  const toast = await box(a, '#appToast');
  check(toast.bottom <= 844 / 2, `toast moved to the top while the sheet is open (bottom ${Math.round(toast.bottom)})`);
  await screen(a, 'encode sheet');
  await a.screenshot({ path: `${SHOTS}/phone-encode.png` });
  await ev(a, () => { closeEncodeSheet(); document.getElementById('appToast').classList.add('hidden'); });

  out('4 My Items: value + stepper, then labelled buttons');
  await ev(a, () => switchMainView('ITEMS'));
  await screen(a, 'My Items');
  const row = await ev(a, () => {
    const btn = [...document.querySelectorAll('#viewItems button[onclick^="openReleaseForItem"]')].find(b => b.offsetParent);
    const b = btn.getBoundingClientRect();
    return { w: b.width, h: b.height, label: btn.innerText.trim() };
  });
  check(row.h >= 40 && row.w >= 80, `release button is a real button (${Math.round(row.w)}×${Math.round(row.h)})`);
  check(row.label === 'Release', 'buttons carry words on a phone');
  check(await ev(a, () => [...document.querySelectorAll('.ledger-tab')].filter(t => t.offsetParent).every(t => t.getBoundingClientRect().height >= 34)), 'filter tabs at least 34 px tall');
  await a.screenshot({ path: `${SHOTS}/phone-items.png` });

  out('5 pop-ups open as bottom sheets');
  for (const [open, id, close] of [['openUnitsModal(items.find(i => getUnits(i.code).length).code)', 'unitsModal', 'closeUnitsModal()'], ['openSchoolModal()', 'schoolModal', 'closeSchoolModal()'], ['openItemModal(items.find(i => i.qty > 0).code)', 'itemModal', 'closeItemModal()']]) {
    await ev(a, s => eval(s), open);
    await sleep(300);
    const card = await box(a, `#${id} > div`);
    check(Math.abs(card.bottom - 844) <= 2 && card.w >= 388, `${id} slides up from the bottom, full width`);
    await screen(a, id);
    await ev(a, s => eval(s), close);
  }

  out('6 Catalog');
  await ev(a, () => switchMainView('CATALOG'));
  await screen(a, 'Catalog', ['Total:']);
  check(await ev(a, () => new Set([...document.querySelectorAll('.part-tab')].map(t => Math.round(t.getBoundingClientRect().top))).size) === 1, 'All / Part I / Part II / Stock on one line');
  check(await ev(a, () => [...document.querySelectorAll('.part-tab')].every(t => t.getBoundingClientRect().height <= 40)), 'tab labels do not wrap');

  out('7 Reports');
  await ev(a, () => switchMainView('REPORTS'));
  await screen(a, 'Reports');
  check(await fullyShown(a, '#kpiTotalValue'), 'total valuation shown in full');
  check(await ev(a, () => { const b = document.querySelector('button[onclick="openSummaryModal()"]'); return b.getBoundingClientRect().height <= 42; }), 'Summary button on one line');
  await a.screenshot({ path: `${SHOTS}/phone-reports.png` });

  out('8 Supply requests and Released to teachers');
  await ev(a, () => openRequestsView());
  await screen(a, 'Supply requests');
  check(await ev(a, () => { const h = document.querySelector('#viewRequests h1'); return h.getBoundingClientRect().height < 34; }), 'title on one line');
  check(await fullyShown(a, '#reqViewSchool'), 'school name not cut off');
  await ev(a, () => openTeachersView());
  await screen(a, 'Released to teachers');

  out('9 teacher phone');
  const code = await ev(a, () => reqRole.schoolId);
  const t1 = await openPhone('teacher', backend);
  await t1.goto(BASE_URL + '#join=' + code, { waitUntil: 'networkidle0' });
  await until(t1, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await screen(t1, 'join sheet');
  await ev(t1, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 4'; });
  await t1.click('#joinBtn');
  await until(t1, () => reqRole && reqRole.role === 'teacher' && cloud.user, 'joined');
  await sleep(500);
  {
    await ev(t1, () => { document.getElementById('appToast').classList.add('hidden'); setTeacherTab('requests'); });
    await screen(t1, 'teacher Requests');
    await ev(t1, () => openRequestForm());
    await sleep(300);
    const d = await box(t1, '#rfNeeded');
    check(d.w >= 300, `"Needed by" date has room on a phone (${Math.round(d.w)} px)`);
    await screen(t1, 'request form');
    await t1.screenshot({ path: `${SHOTS}/phone-teacher-form.png` });
  }
} catch (e) {
  check(false, 'crashed: ' + (e.stack || e));
} finally {
  await closeAll();
  summary('phone layout');
}
