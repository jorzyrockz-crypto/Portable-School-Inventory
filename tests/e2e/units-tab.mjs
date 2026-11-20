// The Units tab of the Item preview (it replaced the Property Numbers window): tag units, edit a card
// without the keyboard closing, condition, highlight from elsewhere (scanner, Useful life), Edit details →
// Manage units, the computer side panel, a cloud update while typing, the School Head (suggestions) and
// a view-only look.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { custodian, schoolHead } from './lib/school-setup.mjs';

const SHOTS = process.env.SHOTS || '/tmp';
const backend = createBackend();
const P = '45111609-MM-P01';   // equipment
const shown = (page, id) => ev(page, i => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden') && !!el.offsetParent; }, id);

try {
  out('1 the Units tab: equipment only, and the old window is gone');
  const { page: a, sid } = await custodian(backend);
  check(await ev(a, () => !document.getElementById('unitsModal')), 'no Property Numbers window any more');
  const sup = await ev(a, () => items.find(i => i.type !== 'EQUIPMENT' && i.qty > 0 && !getUnits(i.code).length).code);
  await ev(a, c => openItemSheet(c), sup);
  check(!(await shown(a, 'ipTab-units')), 'supplies: no Units tab');
  await ev(a, c => openItemSheet(c), P);
  check(await shown(a, 'ipTab-units') && await ev(a, () => document.getElementById('ipUnitsN').textContent === ''), 'equipment: Units tab (no count yet)');
  const tabsFit = await ev(a, () => { const t = document.getElementById('ipTabs'); return t.scrollWidth <= t.clientWidth + 1; });
  check(tabsFit, 'phone: the 4 tabs fit on one line');

  out('2 Overview → Property nos. → Units; tag the units');
  await ev(a, () => [...document.querySelectorAll('#isRows button')].find(b => /Property nos\./.test(b.innerText)).click());
  await sleep(150);
  check(await ev(a, c => ipView.tab === 'units' && unitsModalCode === c, P) && await shown(a, 'ipUnits'), 'the Property nos. line opens the Units tab');
  const qty = await ev(a, c => items.find(i => i.code === c).qty, P);
  check(await ev(a, () => /property number yet/.test(document.querySelector('[data-units-untagged]')?.innerText || '')), 'says the units have no number yet');
  await ev(a, () => document.querySelector('[data-units-untagged] button').click());
  await sleep(200);
  check(await ev(a, (c, q) => getUnits(c).length === q && document.querySelectorAll('#ipUnits [id^="unitcard-"]').length === q, P, qty), `${qty} unit cards`);
  check(await ev(a, q => document.getElementById('ipUnitsN').textContent === String(q), qty), 'the tab shows the count');
  check(await ev(a, () => !document.querySelector('[data-units-untagged]') && /Add new unit/.test(document.querySelector('[data-units-tools]').innerText)), 'Add new unit, Print, Scan');
  await a.screenshot({ path: `${SHOTS}/units_phone.png` });

  out('3 typing in a card: saved, and the next field keeps the keyboard');
  const [u0, u1] = await ev(a, c => getUnits(c).slice(0, 2).map(u => u.id), P);
  await a.click(`[data-uf="${u0}:serial"]`);
  await a.type(`[data-uf="${u0}:serial"]`, 'SN-778');
  await a.click(`[data-uf="${u0}:loc"]`);       // the serial is saved (change) while the room field gets the focus
  await sleep(200);
  check(await ev(a, (c, id) => findUnit(c, id).serial === 'SN-778', P, u0), 'serial no. saved');
  check(await ev(a, id => document.activeElement && document.activeElement.dataset.uf === id + ':loc', u0), 'the room field still has the focus (not drawn again under the finger)');
  await a.type(`[data-uf="${u0}:loc"]`, 'Room 4');
  await ev(a, () => renderUnitsModal(null, true));   // a cloud update meanwhile
  check(await ev(a, id => document.activeElement.dataset.uf === id + ':loc' && document.activeElement.value === 'Room 4', u0), 'a cloud update waits while typing');
  await ev(a, () => document.activeElement.blur());
  await sleep(150);
  check(await ev(a, (c, id) => findUnit(c, id).loc === 'Room 4' && !ipUnitsStale, P, u0), 'leaving the card: saved and drawn again');
  await a.click(`[data-uf="${u1}:to"]`);
  await a.type(`[data-uf="${u1}:to"]`, 'Pedro Santos');
  await a.click(`[data-uf="${u1}:serial"]`);
  await sleep(250);
  check(await ev(a, (c, id) => findUnit(c, id).to === 'Pedro Santos', P, u1), 'Assigned to saved');
  check(await ev(a, id => document.activeElement && document.activeElement.dataset.uf === id + ':serial', u1), 'the card is drawn again (holder) and the focus stays where it was');

  out('4 condition from the card');
  await ev(a, id => document.querySelector(`#unitcard-${id} button[onclick*="'R'"]`).click(), u1);
  await sleep(150);
  check(await ev(a, (c, id) => findUnit(c, id).cond === 'R' && getCondition(items.find(i => i.code === c)).repair === 1, P, u1), 'Needs Repair: the item counts 1 for repair');
  check(await ev(a, () => /for repair/i.test(document.getElementById('ipChips').innerText)), 'the chips follow');

  out('5 opened from elsewhere: the card is shown');
  await ev(a, () => closeItemSheet());
  const u3 = await ev(a, c => getUnits(c)[getUnits(c).length - 1].id, P);
  await ev(a, (c, id) => openUnitsModal(c, id), P, u3);
  await sleep(200);
  check(await ev(a, (c, id) => sheetCode === c && ipView.tab === 'units' && /ring-emerald/.test(document.getElementById('unitcard-' + id).className), P, u3), 'openUnitsModal(code, unit): Units tab, that card marked');
  const vis = await ev(a, id => { const r = document.getElementById('unitcard-' + id).getBoundingClientRect(), b = document.getElementById('ipBody').getBoundingClientRect(); return r.top >= b.top - 1 && r.top < b.bottom; }, u3);
  check(vis, 'scrolled to it');
  await ev(a, () => closeUnitsModal());
  check(await ev(a, () => document.getElementById('itemSheet').classList.contains('hidden') && unitsModalCode === null), 'closeUnitsModal closes the preview');

  out('6 Edit details → Manage units');
  await ev(a, c => openItemModal(c), P);
  await sleep(150);
  check(await ev(a, () => /Manage units/.test(document.getElementById('modalTagsBtnText').textContent)), 'Edit details: Manage units');
  await ev(a, () => openUnitsFromItemModal());
  await sleep(200);
  check(await ev(a, c => !activeModalCode && ipView.tab === 'units' && sheetCode === c, P) && await shown(a, 'ipUnits'), 'saves the form and opens the Units tab');
  await ev(a, () => ipTab('overview'));
  check(await ev(a, () => unitsModalCode === null), 'another tab: the units functions stop following it');
  await ev(a, () => closeItemSheet());

  out('7 computer: in the side panel, two columns, nothing sticks out');
  await a.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await sleep(400);
  await ev(a, () => { switchMainView('ITEMS'); setLedgerFilter('ALL'); });
  await ev(a, c => openUnitsModal(c), P);
  await sleep(300);
  const lay = await ev(a, () => {
    const body = document.getElementById('ipBody');
    const grid = document.querySelector('#ipUnits input[data-uf$=":serial"]').closest('.grid');
    return { over: body.scrollWidth - body.clientWidth, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, panel: document.querySelector('#itemSheet > div').getBoundingClientRect().width, modal: document.getElementById('itemSheet').getAttribute('aria-modal') };
  });
  check(lay.over <= 1 && lay.cols === 2 && lay.modal === 'false', `side panel ${Math.round(lay.panel)} px: ${lay.cols} columns, no sideways scroll (${lay.over})`);
  check(await ev(a, () => !!document.querySelector('#dashboardLedgerContainer .inv-row') && document.querySelector('#dashboardLedgerContainer').getBoundingClientRect().width > 400), 'the list stays beside it');
  await a.screenshot({ path: `${SHOTS}/units_laptop.png` });
  await ev(a, () => closeItemSheet());

  out('8 the School Head: sees the units, a change is a suggestion');
  await sleep(1500);   // the inventory reaches the account
  const { page: h } = await schoolHead(backend, a, sid);
  await ev(h, () => setHeadTab('items'));
  await until(h, () => headInvLoaded, 'head inventory', 10000);
  await until(h, c => getUnits(c).length > 0, 'units on the head phone', 8000, P);
  await ev(h, c => openUnitsModal(c), P);
  await sleep(250);
  check(await shown(h, 'ipUnits') && await ev(h, () => document.querySelectorAll('#ipUnits [id^="unitcard-"]').length > 0), 'Units tab with the cards');
  check(await ev(h, () => !document.querySelector('#ipUnits [onclick^="removeUnitTag"], #ipUnits [onclick^="generateUnitTags"], #ipUnits [onclick^="addUnitTag"], #ipUnits [onclick^="openScanner"], #ipUnits [data-report-lost]')), 'no remove, tag, scan or report lost');
  check(await ev(h, () => /kept as your suggestion/.test(document.getElementById('ipUnits').innerText)), 'says changes are kept as a suggestion');
  await h.click(`[data-uf="${u0}:serial"]`);
  await ev(h, id => { document.querySelector(`[data-uf="${id}:serial"]`).value = ''; }, u0);
  await h.type(`[data-uf="${u0}:serial"]`, 'SN-900');
  await h.click(`[data-uf="${u0}:loc"]`);
  await until(h, c => Object.keys(headDraftOps()).includes('i:' + c), 'the change is in the draft', 6000, P);
  check(await ev(h, (c, id) => findUnit(c, id).serial === 'SN-900', P, u0), 'the serial no. is kept as the head’s suggestion (not sent yet)');
  check(await ev(a, (c, id) => findUnit(c, id).serial === 'SN-778', P, u0), 'the custodian’s inventory is unchanged');
  await h.screenshot({ path: `${SHOTS}/units_head.png` });

  out('9 view only: the cards only show');
  await ev(a, () => { window.__ro = true; window.__isViewOnly = isViewOnly; isViewOnly = () => true; });
  const ro = await ev(a, c => {
    openUnitsModal(c);
    const q = s => document.querySelectorAll('#ipUnits ' + s).length;
    return { inputs: q('input[data-uf]'), locked: q('input[data-uf][readonly]'), cond: q('[data-unit-cond]'), condBtns: q('button[onclick^="setUnitCond"]'), trash: q('[onclick^="removeUnitTag"]'), print: q('[onclick^="printItemLabels"]') };
  }, P);
  check(ro.inputs > 0 && ro.inputs === ro.locked && ro.cond > 0 && !ro.condBtns && !ro.trash && ro.print === 1, `fields read-only, condition as a label, no remove; Print labels stays (${JSON.stringify(ro)})`);
  await ev(a, () => { isViewOnly = window.__isViewOnly; closeItemSheet(); });
} catch (e) {
  out('CRASH ' + (e && e.stack || e));
  check(false, 'suite crashed');
} finally {
  summary('units-tab');
  await closeAll();
}
