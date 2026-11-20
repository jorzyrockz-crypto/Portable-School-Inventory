// The unified Item preview: one window for an item, opened from everywhere (Inventory, Catalog,
// a teacher's page, Useful life, notifications, Home's quick count). Overview / People / History
// tabs, status chips, Edit details in place, the More menu, view-only mode, the phone bottom sheet
// and the computer side panel (the list stays usable beside it).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, closeAll, summary } from './lib/harness.mjs';
import { custodian } from './lib/school-setup.mjs';

const SHOTS = process.env.SHOTS || '/tmp';
const backend = createBackend();
const P = '45111609-MM-P01';   // equipment, gets property numbers
const box = (page, sel) => ev(page, s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; }, sel);
const shown = (page, id) => ev(page, i => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden') && !!el.offsetParent; }, id);
const isOpen = page => ev(page, () => !document.getElementById('itemSheet').classList.contains('hidden'));

try {
  out('1 computer: the preview is a panel on the right, the list stays usable');
  const { page: a } = await custodian(backend, { width: 1280, height: 860 });
  await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); const u = getUnits(c)[0]; setUnitField(c, u.id, 'to', 'Pedro Santos'); }, P);
  const low = await ev(a, () => { const i = items.find(x => x.qty > 3 && x.type !== 'EQUIPMENT'); i.minQty = i.qty; userState[i.code] = { ...(userState[i.code] || {}), minQty: i.qty }; saveState(); return i.code; });
  await ev(a, () => { switchMainView('ITEMS'); setLedgerFilter('ALL'); });
  await sleep(300);
  await ev(a, c => document.querySelector(`#dashboardLedgerContainer .inv-row[data-code="${c}"]`).click(), P);
  await sleep(300);
  check(await isOpen(a) && await ev(a, c => sheetCode === c, P), 'tapping a row opens the preview');
  const panel = await box(a, '#itemSheet > div');
  const vw = await ev(a, () => innerWidth);
  check(Math.abs(panel.right - vw) <= 1 && panel.top >= 40 && Math.abs(panel.bottom - 860) <= 1 && panel.w >= 380 && panel.w <= 520, `side panel on the right, under the top bar (${Math.round(panel.left)}–${Math.round(panel.right)}, top ${Math.round(panel.top)})`);
  const list = await box(a, '#dashboardLedgerContainer');
  check(list.right <= panel.left + 1 && list.w >= 400, `the list stays visible beside it (${Math.round(list.left)}–${Math.round(list.right)})`);
  check(await ev(a, () => document.getElementById('itemSheet').getAttribute('aria-modal') === 'false'), 'not a modal on a computer (aria-modal false)');
  await a.screenshot({ path: `${SHOTS}/ip_laptop.png` });
  await ev(a, c => document.querySelector(`#dashboardLedgerContainer .inv-row[data-code="${c}"]`).click(), low);
  await sleep(250);
  check(await ev(a, c => sheetCode === c && document.getElementById('isName').textContent === items.find(i => i.code === c).name, low), 'tapping another row switches the panel to that item');

  out('2 status chips');
  check(await ev(a, () => !!document.querySelector('#ipChips [data-ip-chip="low"]')), 'Low stock chip');
  await ev(a, c => openItemSheet(c), P);
  check(await ev(a, () => /1 with teachers/.test(document.querySelector('#ipChips [data-ip-chip="held"]')?.innerText || '')), '“1 with teachers” chip');
  check(await ev(a, () => !document.querySelector('#ipChips [data-ip-chip="viewonly"]')), 'no View only chip for the custodian');
  check(await ev(a, () => document.getElementById('ipPeopleN').textContent === '1'), 'People tab shows 1');

  out('3 tabs: Overview, People, History');
  check(await shown(a, 'ipOverview') && await ev(a, () => document.getElementById('ipTab-overview').getAttribute('aria-selected') === 'true'), 'opens on Overview');
  await a.click('#ipTab-people');
  await sleep(150);
  check(await shown(a, 'ipPeople') && !(await shown(a, 'ipOverview')), 'People tab shows its panel');
  check(await ev(a, () => /Has it now/i.test(document.getElementById('ipPeople').innerText) && /Pedro Santos/.test(document.getElementById('ipPeople').innerText)), 'People: Pedro Santos has it now');
  check(await ev(a, () => document.querySelectorAll('#ipPeople [data-ip-person] [data-avatar]').length === 1), 'People: with an avatar (initials or photo)');
  await ev(a, () => adjustQty(sheetCode, 1));
  await a.click('#ipTab-history');
  await sleep(150);
  check(await shown(a, 'ipHistory') && await ev(a, () => document.querySelectorAll('#ipHistory [data-ip-hist]').length >= 1), 'History tab lists this item’s changes');
  check(await ev(a, () => !!document.querySelector('#ipHistory button[onclick="itemSheetGo(\'fullhistory\')"]')), 'History: Open the full history');
  await a.focus('#ipTab-history');
  await a.keyboard.press('ArrowRight');
  await sleep(100);
  check(await ev(a, () => ipView.tab === 'overview' && document.activeElement.id === 'ipTab-overview'), 'arrow keys move between the tabs');

  out('4 Edit details opens in place');
  await a.click('#isEdit');
  await sleep(150);
  check(await shown(a, 'ipEdit') && !(await shown(a, 'ipTabs')) && await shown(a, 'ipEditFoot') && !(await shown(a, 'ipFoot')), 'the form replaces the tabs, with Save / Cancel');
  check(await ev(a, () => document.getElementById('itemModal') === null), 'the separate item details window is gone');
  await ev(a, () => { document.getElementById('modalItemNote').value = 'ICT / Computer Lab'; document.getElementById('modalItemMinQty').value = '2'; });
  await a.click('#ipSave');
  await sleep(200);
  check(await ev(a, c => { const i = items.find(x => x.code === c); return i.note === 'ICT / Computer Lab' && i.minQty === 2; }, P), 'Save changes stores the room and minimum');
  check(await isOpen(a) && await shown(a, 'ipOverview') && !(await shown(a, 'ipEdit')), 'after saving: back to the Overview, still open');
  check(await ev(a, () => /ICT \/ Computer Lab/.test(document.getElementById('isRows').innerText)), 'the Overview shows the new room');
  await ev(a, () => itemSheetGo('edit'));
  await ev(a, () => { document.getElementById('modalItemNote').value = 'Not saved'; });
  await a.focus('#modalItemNote');
  await a.keyboard.press('Escape');
  await sleep(150);
  check(await isOpen(a) && await shown(a, 'ipOverview') && await ev(a, c => items.find(x => x.code === c).note === 'ICT / Computer Lab', P), 'Esc while editing: back to the Overview, nothing saved');
  await ev(a, () => openItemModal(sheetCode));
  await ev(a, () => closeItemModal());
  check(await isOpen(a) && await shown(a, 'ipOverview'), 'closeItemModal() returns to the Overview');
  await a.focus('#ipTab-overview');
  await a.keyboard.press('Escape');
  await sleep(150);
  check(!(await isOpen(a)), 'Esc on the Overview closes the preview');

  out('5 More menu');
  await ev(a, c => openItemSheet(c), P);
  await a.click('#isMoreBtn');
  await sleep(150);
  const opts = await ev(a, () => [...document.querySelectorAll('#ipMore [data-ip-more]')].filter(b => b.offsetParent).map(b => b.dataset.ipMore));
  check(['labels', 'prices', 'catalog', 'fullhistory'].every(x => opts.includes(x)) && !opts.includes('units'), `More: ${opts.join(', ')}`);
  await a.screenshot({ path: `${SHOTS}/ip_laptop_more.png` });
  await a.click('#ipMore [data-ip-more="fullhistory"]');
  await sleep(200);
  check(await ev(a, () => !document.getElementById('historyModal').classList.contains('hidden') && historyFilter.code === sheetCode), 'Full history opens filtered to this item');
  await ev(a, () => closeHistory());
  check(await ev(a, () => document.getElementById('ipMore').classList.contains('hidden')), 'the menu closes after a pick');
  await ev(a, () => itemSheetGo('labels'));
  await sleep(300);
  check(await ev(a, () => (window.__printed || 0) >= 1), 'Print QR labels prints this item’s labels');

  out('6 opened from everywhere');
  await ev(a, () => { closeItemSheet(); switchMainView('CATALOG'); setCategoryFilter('ALL'); });
  await sleep(300);
  const cat = await ev(a, () => document.querySelector('#itemsContainer .cat-row').dataset.code);
  await a.click(`#itemsContainer .cat-row[data-code="${cat}"] .cat-main`);
  await sleep(200);
  check(await isOpen(a) && await ev(a, c => sheetCode === c && ipView.tab === 'overview' && !activeModalCode, cat), 'Catalog: the name opens the preview');
  await ev(a, () => switchMainView('HOME'));
  await sleep(150);
  check(!(await isOpen(a)), 'switching pages closes the panel');
  await ev(a, c => goToNotifTarget({ go: 'low', code: c }), low);
  await sleep(250);
  check(await isOpen(a) && await ev(a, c => sheetCode === c && activeMainView === 'ITEMS', low), 'a low-stock notification opens Inventory and that item');
  const pedro = await ev(a, () => personId(null, 'Pedro Santos'));
  await ev(a, k => { closeItemSheet(); openTeachersView(k); }, pedro);
  await sleep(300);
  await a.click(`#viewTeachers [data-ip-open="${P}"]`);
  await sleep(200);
  check(await isOpen(a) && await ev(a, c => sheetCode === c, P), 'a teacher’s page: the item name opens the preview');
  await a.screenshot({ path: `${SHOTS}/ip_laptop_teacher.png` });
  await ev(a, () => { closeItemSheet(); openLifeSheet('all'); });
  await sleep(250);
  await a.click(`#lifeBody [data-ip-open="${P}"]`);
  await sleep(200);
  check(await isOpen(a) && await ev(a, () => document.getElementById('lifeModal').classList.contains('hidden')), 'Useful life: the item name opens the preview');
  await ev(a, () => { closeItemSheet(); switchMainView('HOME'); });
  await ev(a, c => openEncodeSheet(c), low);
  await sleep(200);
  await a.click('#encSeeAll');
  await sleep(200);
  check(await isOpen(a) && await ev(a, c => sheetCode === c && document.getElementById('encodeSheet').classList.contains('hidden'), low), 'Home quick count: See everything opens the preview');
  await ev(a, () => closeItemSheet());

  out('7 view only (outgoing custodian)');
  await ev(a, () => { reqRole.viewOnly = { untilMs: Date.now() + 864e5 }; });
  await ev(a, c => { switchMainView('ITEMS'); openItemSheet(c); }, P);
  await sleep(150);
  check(await ev(a, () => !!document.querySelector('#ipChips [data-ip-chip="viewonly"]')), 'View only chip');
  check(await ev(a, () => [...document.querySelectorAll('#itemSheet [data-ip-write]')].every(b => !b.offsetParent)), 'no stepper, Release or Edit details');
  await ev(a, () => ipToggleMore(true));
  check(await ev(a, () => !document.querySelector('#ipMore [data-ip-more="catalog"]')), 'no Catalog in More');
  await ev(a, c => openItemModal(c), P);
  check(await ev(a, () => !activeModalCode && document.getElementById('ipEdit').classList.contains('hidden')), 'openItemModal does not open the form');
  await ev(a, () => { delete reqRole.viewOnly; closeItemSheet(); });

  out('8 phone: a bottom sheet with tabs');
  const { page: ph } = await custodian(backend, { name: 'phone', email: 'joy@deped.gov.ph', school: 'Lahug Elementary School', width: 390, height: 844 });
  await ev(ph, () => switchMainView('ITEMS'));
  await sleep(300);
  await ph.click('#dashboardLedgerContainer .inv-row');
  await sleep(300);
  const sh = await box(ph, '#itemSheet > div');
  check(Math.abs(sh.bottom - 844) <= 2 && sh.w >= 388 && sh.top > 60, `bottom sheet, full width (top ${Math.round(sh.top)})`);
  check(await ev(ph, () => document.getElementById('itemSheet').getAttribute('aria-modal') === 'true'), 'a modal on the phone');
  const tabs = await ev(ph, () => [...document.querySelectorAll('#ipTabs [role=tab]')].filter(t => !t.classList.contains('hidden')).map(t => { const r = t.getBoundingClientRect(); return r.height >= 40 && r.right <= innerWidth; }));
  check(tabs.length >= 3 && tabs.every(Boolean), `${tabs.length} tabs, finger-sized, inside the screen`);
  check(await ev(ph, () => [...document.querySelectorAll('#ipChips .ip-chip')].every(c => c.getBoundingClientRect().right <= innerWidth)), 'chips wrap inside the screen');
  await ph.screenshot({ path: `${SHOTS}/ip_phone.png` });
  await ph.tap('#ipTab-people');
  await sleep(150);
  check(await shown(ph, 'ipPeople'), 'People tab on the phone');
  await ph.screenshot({ path: `${SHOTS}/ip_phone_people.png` });
  await ph.tap('#isEdit');
  await sleep(200);
  const foot = await box(ph, '#ipEditFoot');
  check(await shown(ph, 'ipEdit') && foot.bottom <= 845 && foot.top > 400, 'Edit details in the sheet, Save / Cancel at the bottom');
  await ph.screenshot({ path: `${SHOTS}/ip_phone_edit.png` });
  await ev(ph, () => closeItemSheet());
} catch (e) {
  out('CRASH ' + (e && e.stack || e));
  check(false, 'suite crashed');
} finally {
  summary('item-preview');
  await closeAll();
}
