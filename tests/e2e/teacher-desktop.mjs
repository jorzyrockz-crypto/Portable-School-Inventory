// A teacher's account on a computer (Nov 2026): the custodian's sidebar (Today first) and Today in two columns. My Items puts
// equipment and supplies on the left (Report a problem / Return on each item's row) and the
// overview, slips to receive, the count and clearance on the right; Stock, Requests and Library
// show their cards in columns. Phones keep one column in the same order as before.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
async function release(a, uid, lines) {
  await ev(a, (uid, lines) => openRelease({ teacherUid: uid, lines }), uid, lines);
  await sleep(200);
  await a.evaluate(() => __fillSerials());
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
}
const box = (page, sel) => ev(page, s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; }, sel);

try {
  out('1 the custodian releases equipment and supplies to a teacher');
  const { page: a, sid } = await custodian(backend);
  for (const c of ['45111609-MM-P01', '43211503-LAP001']) await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }, c);
  const { page: t, uid } = await teacher(backend, sid, 'Floyran Gomez', 'Teacher I', 'Grade 4');
  await until(a, () => teacherRoster().filter(x => x.joined).length === 1, 'roster', 8000);
  await release(a, uid, [{ code: '12191601-AL-E04', qty: 5 }, { code: '45111609-MM-P01', qty: 2 }]);
  await release(a, uid, [{ code: '43211503-LAP001', qty: 1 }, { code: '14111507-PP-M01', qty: 3 }]);
  await ev(t, () => setTeacherTab('items'));
  await until(t, () => myReleases.length === 4 && document.querySelectorAll('.t-ris').length === 2, 'releases', 10000);
  await sleep(500);

  out('2 phone: one column, same order as before');
  const order = await ev(t, () => {
    const pos = s => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : -1; };
    return { tiles: pos('#tOverview'), ack: pos('#tAckBox'), equip: pos('#tEquipList'), sup: pos('.t-sup'), clear: pos('#tClearance'), page: document.documentElement.scrollWidth <= innerWidth };
  });
  check(order.tiles < order.ack && order.ack < order.equip && order.equip < order.sup && order.sup < order.clear && order.page, `phone: overview, slips to receive, equipment, supplies, clearance (${JSON.stringify(order)})`);
  const pcard = await ev(t, () => { const c = document.querySelector('[data-tunit-card]'); const h = c.firstElementChild.getBoundingClientRect(), b = c.querySelector('.t-u-btns').getBoundingClientRect(); return b.top >= h.bottom - 1; });
  check(pcard, 'phone: Report a problem / Return under the item');

  out('3 computer: My Items in two columns');
  await t.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(400);
  await ev(t, () => setTeacherTab('items'));
  await sleep(300);
  const page = await box(t, '#viewRequester'), tabs = await box(t, '#rqTab-today'), more = await ev(t, () => getComputedStyle(document.getElementById('rqTab-more')).display), main = await box(t, '.t-main'), side = await box(t, '.t-side'), foot = await box(t, '.t-foot');
  const head = await ev(t, () => { const v = document.getElementById('viewHead'), was = v.classList.contains('hidden'); v.classList.remove('hidden'); const w = v.getBoundingClientRect().width; if (was) v.classList.add('hidden'); return w; });
  check(page.w > 1100 && Math.abs(page.w - head) < 1, `wider page, the same width as the School Head's (${Math.round(page.w)} px · head ${Math.round(head)} px)`);
  check(tabs.r <= page.l + 1 && more === 'none' && await ev(t, () => !!document.getElementById('rqTab-stock').offsetParent), `the sidebar on the left with every page, no More (${Math.round(tabs.r)} · ${Math.round(page.l)})`);
  check(main.r <= side.l && main.w > side.w * 1.8 && Math.abs(main.t - side.t) < 4, `equipment and supplies on the left (${Math.round(main.w)} px), the rest on the right (${Math.round(side.w)} px)`);
  check(foot.l >= side.l - 1 && foot.t >= side.b, 'Clearance under the right column');
  const inSide = await ev(t, () => ['#tOverview', '#tAckBox', '#tPrintMine'].every(s => document.querySelector('.t-side ' + s)) && !!document.querySelector('.t-main #tEquipList'));
  check(inSide, 'right: totals, slips to receive, Print my list · left: the equipment list');
  const row = await ev(t, () => {
    const c = document.querySelector('[data-tunit-card]'), h = c.firstElementChild.getBoundingClientRect(), b = c.querySelector('.t-u-btns').getBoundingClientRect();
    const r = document.querySelector('[data-tunit-row]'), rh = r && r.firstElementChild.getBoundingClientRect(), rb = r && r.querySelector('.t-u-btns').getBoundingClientRect();
    return { card: b.left >= h.right - 1 && b.top < h.bottom, unitRow: !r || (rb.left >= rh.right - 1 && rb.top < rh.bottom), h: Math.round(c.getBoundingClientRect().height) };
  });
  check(row.card && row.unitRow && row.h < 110, `each item one row, Report a problem / Return on the right (${row.h} px tall)`);
  const ris = await ev(t, () => { const r = [...document.querySelectorAll('.t-ris')].map(e => e.getBoundingClientRect()); return r.length === 2 && Math.abs(r[0].top - r[1].top) < 2 && r[0].right <= r[1].left; });
  check(ris, 'RIS slips side by side');
  check(await ev(t, () => document.documentElement.scrollWidth <= innerWidth), 'the page does not scroll sideways');

  await ev(t, () => setTeacherTab('today'));
  await sleep(300);
  const cols = await ev(t, () => { const c = [...document.querySelectorAll('#rqTodayPane .t-today > *')].map(e => e.getBoundingClientRect()); return c.length === 2 && c[0].right <= c[1].left && Math.abs(c[0].top - c[1].top) < 2; });
  check(cols, 'Today: two columns on a computer');

  out('4 computer: Stock and Requests in columns');
  await ev(t, () => setTeacherTab('stock'));
  await until(t, () => document.querySelectorAll('#stList [data-stock]').length > 3, 'stock', 8000);
  const st = await ev(t, () => { const r = [...document.querySelectorAll('#stList [data-stock]')].slice(0, 4).map(e => e.getBoundingClientRect()); return { cols: r.filter(x => Math.abs(x.top - r[0].top) < 2).length, search: document.getElementById('stSearch').getBoundingClientRect().width }; });
  check(st.cols >= 3 && st.search <= 520, `stock: ${st.cols} cards per row, a normal-size search box (${Math.round(st.search)} px)`);
  await ev(t, () => setTeacherTab('requests'));
  await sleep(200);
  const nb = await box(t, '#rqNewBtn');
  check(nb.w < 600, `New supply request: a normal-size button (${Math.round(nb.w)} px)`);

  out('5 back on a phone: as before');
  await t.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ev(t, () => setTeacherTab('items'));
  await sleep(300);
  const ph = await ev(t, () => { setTeacherTab('today'); const c = [...document.querySelectorAll('#rqTodayPane .t-today > *')].map(e => e.getBoundingClientRect()); setTeacherTab('items'); return getComputedStyle(document.getElementById('rqTab-more')).display !== 'none' && getComputedStyle(document.getElementById('rqTab-stock')).display === 'none' && c[1].top >= c[0].bottom; });
  check(ph, 'phone: bottom tabs with More, Today in one column');
  const back = await ev(t, () => { const m = document.querySelector('.t-main').getBoundingClientRect(), s = document.querySelector('.t-side').getBoundingClientRect(); return s.bottom <= m.top + 1 && Math.abs(m.width - s.width) < 2; });
  check(back, 'phone: one column again');
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('teacher-desktop');
  await closeAll();
}
