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

  out('4 Inventory: tidy rows, tap one for the item sheet');
  await ev(a, () => switchMainView('ITEMS'));
  await screen(a, 'Inventory');
  check(await ev(a, () => document.querySelector('.tab-btn[data-view="ITEMS"]').innerText.includes('Inventory') && /^Inventory/.test(document.querySelector('#masterLedgerSection h3').innerText.trim())), 'the tab and the page are called Inventory');
  check(await ev(a, () => /^\d+ items · ₱/.test(document.getElementById('invSummary').innerText)), 'summary line: items · total value');
  const rows = await ev(a, () => [...document.querySelectorAll('#dashboardLedgerContainer .inv-row')].map(r => ({
    h: r.getBoundingClientRect().height, flags: r.querySelectorAll('.inv-flag').length,
    steppers: r.querySelectorAll('button[onclick*="adjustQty"]').length, val: r.innerText.includes('₱')
  })));
  check(rows.length > 10, `one row per item (${rows.length})`);
  check(rows.every(r => r.steppers === 0), 'no +/− on the rows (counts can’t change by accident)');
  check(rows.every(r => r.flags <= 3), 'at most 2 status labels (+N) per row');
  check(rows.every(r => r.val && r.h >= 56), 'every row shows the value and is a big tap target');
  check(await ev(a, () => { const t = [...document.querySelectorAll('.ledger-tab')].filter(t => t.offsetParent); return t.every(x => x.getBoundingClientRect().right <= innerWidth && x.getBoundingClientRect().height >= 34); }), 'filter chips wrap inside the screen, at least 34 px tall');
  check(await ev(a, () => !document.getElementById('ledgerTab-UNCOUNTED').offsetParent), '“Not counted” only during a count');
  await a.screenshot({ path: `${SHOTS}/phone-items.png` });
  await a.click('#dashboardLedgerContainer .inv-row');
  await sleep(300);
  const sheet = await box(a, '#itemSheet > div');
  check(Math.abs(sheet.bottom - 844) <= 2 && sheet.w >= 388, 'item sheet slides up from the bottom, full width');
  const acts = await ev(a, () => [...document.querySelectorAll('#itemSheet button')].filter(b => b.offsetParent).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()));
  check(['Release', 'Edit details', 'History', 'Close', 'One less', 'One more'].every(x => acts.includes(x)), `sheet buttons carry words or names (${acts.filter(Boolean).slice(0, 8).join(', ')})`);
  check(await ev(a, () => [...document.querySelectorAll('#isStats p.font-mono')].every(p => p.scrollWidth <= p.clientWidth + 1)), 'on hand / unit cost / total value are not cut off');
  await screen(a, 'item sheet');
  await a.screenshot({ path: `${SHOTS}/phone-item-sheet.png` });
  await ev(a, () => closeItemSheet());

  // During a physical count: a check button on each row, "Not counted" chip, Mark as counted in the sheet
  await ev(a, () => { countSession = { name: 'Test count', startedAt: Date.now(), counted: {} }; renderDashboard(); });
  check(await ev(a, () => document.querySelectorAll('#dashboardLedgerContainer .count-check').length === document.querySelectorAll('#dashboardLedgerContainer .inv-row').length), 'count: a check button on every row');
  check(await ev(a, () => !!document.getElementById('ledgerTab-UNCOUNTED').offsetParent), 'count: “Not counted” chip shows');
  const first = await ev(a, () => document.querySelector('#dashboardLedgerContainer .inv-row').dataset.code);
  await a.click('#dashboardLedgerContainer .inv-row .count-check');
  check(await ev(a, c => isCounted(c) && document.getElementById('itemSheet').classList.contains('hidden'), first), 'count: the check button marks the item without opening the sheet');
  const second = await ev(a, () => document.querySelectorAll('#dashboardLedgerContainer .inv-row')[1].dataset.code);
  await ev(a, c => openItemSheet(c), second);
  await a.click('#isCount');
  check(await ev(a, c => isCounted(c) && document.getElementById('itemSheet').classList.contains('hidden'), second), 'count: Mark as counted in the sheet, then back to the list');
  await screen(a, 'Inventory during a count');
  await ev(a, () => { countSession = null; persistCountSession(); setLedgerFilter('ALL'); renderDashboard(); });

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
  await screen(a, 'Catalog');
  const cat = await ev(a, () => [...document.querySelectorAll('#itemsContainer .cat-row')].slice(0, 12).map(r => ({
    h: r.getBoundingClientRect().height, right: r.getBoundingClientRect().right,
    steps: [...r.querySelectorAll('.cat-step button')].map(b => (b.getAttribute('aria-label') || '') + ':' + Math.round(b.getBoundingClientRect().height))
  })));
  check(cat.length >= 10, `Catalog: one row per item (${cat.length})`);
  check(cat.every(r => r.h <= 100 && r.right <= 390), 'Catalog rows are compact and fit the screen');
  check(cat.every(r => r.steps.join() === 'One less:40,One more:40'), `each row has a named − / + at least 40 px (${cat[0]?.steps.join(' ')})`);
  check(await ev(a, () => !document.getElementById('categoryPills') && document.getElementById('catCategorySelect').options.length === CATEGORIES.length + 1), 'categories are in a drop-down, not a sideways-scrolling strip');
  const added = await ev(a, () => items.find(i => i.qty === 0 && i.price > 0 && !i.note).code);
  await a.click(`#card-${added} .cat-plus`);
  check(await ev(a, c => { const r = document.getElementById(`card-${c}`); return items.find(i => i.code === c).qty === 1 && r.classList.contains('is-on') && /₱/.test(document.getElementById(`flags-${c}`).innerText) && document.activeElement === r.querySelector('.cat-plus'); }, added), '+ adds one, shows the total and keeps the finger on the button');
  await a.click(`#card-${added} .cat-minus`);
  check(await ev(a, c => items.find(i => i.code === c).qty === 0 && !document.getElementById(`card-${c}`).classList.contains('is-on'), added), '− takes it back off');
  await ev(a, () => { const s = document.getElementById('catCategorySelect'); s.value = '0'; s.dispatchEvent(new Event('change')); });
  check(await ev(a, () => [...document.querySelectorAll('.cat-row')].every(r => items.find(i => i.code === r.dataset.code).catIdx === 0) && !!document.getElementById('clearCatFilterBtn').offsetParent), 'choosing a category filters the list and shows a chip to clear it');
  await screen(a, 'Catalog with a category');
  await ev(a, () => setCategoryFilter('ALL'));
  await a.click('#itemsContainer .cat-row .cat-main');
  await sleep(300);
  check(await ev(a, () => !document.getElementById('itemModal').classList.contains('hidden')), 'tapping the name opens room · price · minimum stock');
  await ev(a, () => closeItemModal());
  await a.screenshot({ path: `${SHOTS}/phone-catalog.png` });
  check(await ev(a, () => new Set([...document.querySelectorAll('.part-tab')].map(t => Math.round(t.getBoundingClientRect().top))).size) === 1, 'All / Part I / Part II / In stock on one line');
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
