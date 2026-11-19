// A teacher's My Items overview (Nov 2026): the tiles (items, value, supplies this school year,
// borrowed books), "Needs your attention" (slips to mark Received, asked back, the year-end
// count, reports waiting, lost / in repair, slips over 3 years, overdue library books, books
// issued to them), and Clearance: Return everything in one tap, then "Nothing is under your name".
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const reports = () => backend.docs('schools/').filter(d => /\/teacherReports\//.test(d.path));
const P = '45111609-MM-P01', S = '12191601-AL-E04';
const pane = page => ev(page, () => document.getElementById('rqItemsPane').innerText);
const attKeys = page => ev(page, () => [...document.querySelectorAll('#tOverview [data-t-att]')].map(e => e.dataset.tAtt));
const tile = (page, k) => ev(page, k => (document.querySelector(`[data-t-tile="${k}"]`) || {}).innerText || '', k);

async function release(a, uid, lines) {
  await ev(a, (uid, lines) => openRelease({ teacherUid: uid, lines }), uid, lines);
  await sleep(200);
  await a.evaluate(() => __fillSerials());
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
}

try {
  out('1 custodian releases 2 projectors (ICS) and alcohol (RIS) to Ana');
  const { page: a, sid } = await custodian(backend);
  await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }, P);
  const { page: t, uid: ana } = await teacher(backend, sid);
  await until(a, () => teacherRoster().filter(x => x.joined).length === 1, 'roster', 8000);
  await release(a, ana, [{ code: S, qty: 5 }, { code: P, qty: 2 }]);
  const units = await ev(a, (c, uid) => getUnits(c).filter(u => u.toUid === uid).map(u => ({ id: u.id, no: u.no })), P, ana);
  const cost = await ev(a, c => items.find(i => i.code === c).price || 0, P);

  out('2 Ana’s overview');
  await ev(t, () => setTeacherTab('items'));
  await until(t, () => myReleases.length === 2, 'Ana’s releases', 8000);
  await until(t, () => !!document.getElementById('tOverview'), 'overview', 8000);
  check(/^2\b/.test(await tile(t, 'items')) && /ITEMS/i.test(await tile(t, 'items')), 'tile: 2 items');
  const v = await tile(t, 'value');
  check(/₱/.test(v) && /value/i.test(v), `tile: equipment value (${v.replace(/\n/g, ' ')})`);
  const sup = await tile(t, 'supplies');
  check(/SY \d{4}–\d{2}/.test(sup) && /1 RIS/.test(sup), `tile: supplies this school year (${sup.replace(/\n/g, ' ')})`);
  check(!(await tile(t, 'books')), 'no books tile with nothing borrowed');
  let keys = await attKeys(t);
  check(keys.includes('ack'), `attention: slips to mark Received (${keys.join(', ')})`);
  check(/2 slips to mark Received/.test(await pane(t)), '“2 slips to mark Received”');
  check(await ev(t, () => !!document.getElementById('tAckBox')), 'tapping it goes to the Received box (#tAckBox)');
  await ev(t, () => document.querySelector('[data-t-att="ack"] button').click());
  check(true, 'tap works without errors');

  out('3 Received → all clear');
  await ev(t, () => myReleases.forEach(r => ackRelease(r.id)));
  await until(t, () => !document.getElementById('tAckBox'), 'Received box gone', 8000);
  await until(t, () => !!document.querySelector('[data-t-att="clear"]'), 'all clear', 8000);
  check(/All clear/.test(await pane(t)), 'Needs your attention: All clear');

  out('4 custodian asks for a projector back');
  await ev(a, id => askUnitBack(id), units[0].id);
  await until(t, () => !!document.querySelector('[data-t-att="askback"]'), 'asked back', 8000);
  check(/asks you to return 1 item/.test(await pane(t)), 'attention: “The property custodian asks you to return 1 item”');
  check(/MULTIMEDIA PROJECTOR/i.test(await ev(t, () => document.querySelector('[data-t-att="askback"]').innerText)), 'names the item');

  out('5 Ana reports the other one → waiting for the custodian; then in repair');
  await ev(t, id => { openTeacherReport('problem', myReleases.find(x => x.kind === 'ICS').id, id); document.getElementById('trNote').value = 'No display'; sendTeacherReport(); }, units[1].id);
  await until(t, () => !!document.querySelector('[data-t-att="open"]'), 'open report', 8000);
  check(/1 report waiting for the property custodian/.test(await pane(t)), 'attention: 1 report waiting');
  await until(a, () => openTeacherReports().length === 1, 'custodian inbox', 8000);
  await ev(a, () => resolveTeacherReport(openTeacherReports()[0].id, 'repair'));
  await until(t, () => !!document.querySelector('[data-t-att="repair"]'), 'in repair', 8000);
  check(/1 item in repair/.test(await pane(t)) && !(await attKeys(t)).includes('open'), 'attention: 1 item in repair (no longer waiting)');

  out('6 overdue library book and books issued (from what the phone already has)');
  await ev(t, () => {
    bk.loansLoaded = true;
    bk.loans = [...bk.loans, { id: 'L1', borrowerUid: cloud.user.uid, status: 'out', dueISO: '2026-01-05', title: 'Noli Me Tangere' }];
    bk.moves = [...bk.moves, { id: 'M1', toUid: cloud.user.uid, status: 'sent', lines: [{ n: 40 }] }];
    renderRequesterView();
  });
  keys = await attKeys(t);
  check(keys.includes('books') && /1 library book overdue/.test(await pane(t)), 'attention: 1 library book overdue');
  check(keys.includes('bookmoves'), 'attention: books issued to you to mark Received');
  await ev(t, () => window.scrollTo(0, 0));
  await t.screenshot({ path: '/tmp/e2e_t_dash.png' });
  check(/^1\b/.test(await tile(t, 'books')), 'tile: 1 borrowed book');
  await ev(t, () => document.querySelector('[data-t-att="books"] button').click());
  check(await ev(t, () => teacherTab) === 'library', 'tapping it opens Library');
  await ev(t, () => { bk.loans = bk.loans.filter(l => l.id !== 'L1'); bk.moves = bk.moves.filter(m => m.id !== 'M1'); setTeacherTab('items'); });

  out('7 slips over 3 years');
  await ev(t, () => {
    myReleases = myReleases.map(r => (r.kind !== 'ICS' ? r : { ...r, lines: r.lines.map(l => ({ ...l, units: (l.units || []).map(u => ({ ...u, icsDate: '2021-06-01' })) })) }));
    renderRequesterView();
  });
  check(/2 items on slips older than 3 years/.test(await pane(t)), 'attention: 2 items on slips older than 3 years');

  out('8 Clearance: Return everything');
  check(await ev(t, () => !!document.getElementById('tClearance') && !document.getElementById('tClearance').open), 'Clearance box, closed');
  await ev(t, () => { const d = document.getElementById('tClearance'); d.open = true; d.dispatchEvent(new Event('toggle')); });
  check(/2 items still under your name/.test(await pane(t)), '“2 items still under your name”');
  await ev(t, () => document.getElementById('tClearance').scrollIntoView());
  await t.screenshot({ path: '/tmp/e2e_t_clear.png' });
  check(/Return everything \(2\)/.test(await pane(t)), 'Return everything (2)');
  await ev(t, () => document.getElementById('tReturnAll').click());
  await waitNode(() => reports().filter(r => r.kind === 'return').length >= 1);
  const rets = reports().filter(r => r.kind === 'return');
  check(rets.length === 1 && rets[0].units.length === 2, `one return request with both projectors (${rets.map(r => r.units.length).join(',')})`);
  check(rets[0].uid === ana && rets[0].status === 'open', 'from Ana, open');
  await until(t, () => /Return requested for all/.test(document.getElementById('rqItemsPane').innerText), 'all requested', 8000);
  check(await ev(t, () => document.getElementById('tClearance').open), 'Clearance stays open');
  check(!(await attKeys(t)).includes('askback'), 'asked back is answered by the return request');
  check(t.dialogs.some(d => /Return everything\?/.test(d)), 'asked first (Return everything?)');

  out('9 custodian receives them back → nothing under Ana’s name');
  await until(a, () => openTeacherReports().some(x => x.kind === 'return'), 'return in inbox', 8000);
  await ev(a, () => acceptTeacherReturn(openTeacherReports().find(x => x.kind === 'return').id));
  await until(t, () => teacherHoldings(myReleases).equipment.length === 0, 'equipment gone', 10000);
  await until(t, () => document.querySelector('[data-t-clear-left="0"]'), 'clearance done', 8000);
  check(/Nothing is under your name/.test(await pane(t)), 'Clearance: “Nothing is under your name”');
  check(/^0\b/.test(await tile(t, 'items')), 'tile: 0 items');
  check(!/older than 3 years/.test(await pane(t)), 'old-slip line gone');
  check(await ev(t, () => !!document.getElementById('tPrintMine')), 'Print my list still there');

  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('teacher-dashboard');
}
