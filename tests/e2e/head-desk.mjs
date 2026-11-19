// The School Head's desk, lost / damaged property and the year-end tools:
//  · the head's screen: a summary of the school's property (stock, who holds what, requests);
//  · RIS approval (when the custodian turns it on): an approved request waits for the head,
//    who approves or returns it; the RIS shows the approval;
//  · lost property: reported by the custodian, 30 days to apply for relief (reminder), and the
//    write-off waits for the head's approval, then leaves the inventory (kept under Written off);
//  · Year-end & reminders: Inventory Committee, bond / designation order reminders, slips older
//    than 3 years renewed, the count report approved by the head and shown on the RPCPPE / RPCSP.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { refused, waitNode, custodian, teacher, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const aps = sid => backend.docs(`schools/${sid}/approvals/`);
const rel = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
const HEAD = 'John Russell L. Guadalupe';

try {
  out('1 a school with a teacher and a confirmed School Head');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: anaUid } = await teacher(backend, sid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, anaUid);
  const { page: h, uid: hUid } = await schoolHead(backend, a, sid);
  check(!!hUid, 'School Head confirmed');
  // Equipment issued to Ana (an ICS), so the head sees who holds what.
  const equip = await ev(a, () => { const i = items.find(x => relIsEquip(x) && relMax(x) >= 4 && !isPPE(x)); return { code: i.code, name: i.name }; });
  await ev(a, (uid, code) => { openRelease({ teacherUid: uid, lines: [{ code, qty: 3 }], purpose: 'Classroom use' }); __fillSerials(); confirmRelease(); closeRelease(); }, anaUid, equip.code);
  await waitNode(() => rel().some(r => r.teacherUid === anaUid && r.kind === 'ICS'));

  out('2 the School Head’s screen: the school’s property');
  await waitNode(() => { const d = backend.store.get(`schools/${sid}/dashboard/summary`); return !!(d && (d.holders || []).some(x => x.n === 'Ana Reyes')); }, 20000);
  const dash = backend.store.get(`schools/${sid}/dashboard/summary`);
  check(dash && dash.items > 10 && dash.held >= 3 && dash.holders.some(x => x.n === 'Ana Reyes' && x.u === 3), `summary in the cloud: ${dash && dash.items} items, Ana holds ${dash && (dash.holders.find(x => x.n === 'Ana Reyes') || {}).u} units`);
  await until(h, () => !!document.querySelector('#hdBody [data-head-dash] [data-dash-holders]') && /Ana Reyes/.test(document.querySelector('[data-dash-holders]').textContent), 'head sees the summary', 10000);
  const hv = await ev(h, () => ({ text: document.querySelector('[data-head-dash]').textContent, stock: !!document.querySelector('[data-dash-stock]') }));
  check(/Who holds what/i.test(hv.text) && /Ana Reyes/.test(hv.text) && hv.stock && /Supply requests waiting/i.test(hv.text), 'head: stock levels, who holds what, requests');
  check(await refused(h, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'inventory')), sid), 'rules: the head still can’t read the inventory itself');
  check(await refused(t, (F, sid) => F.getDoc(F.doc(cloud.db, 'schools', sid, 'dashboard', 'summary')), sid), 'rules: a teacher can’t read the summary');
  check(await refused(h, (F, sid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'dashboard', 'summary'), { items: 0 }), sid), 'rules: the head can’t change the summary');

  out('3 RIS approval');
  check(await ev(a, () => { openHeadPanel(); return !!document.querySelector('[data-ris-toggle]'); }), 'School Head panel: the RIS switch');
  await ev(a, () => { closeHeadPanel(); setRisApproval(true); });
  await waitNode(() => backend.store.get(`schools/${sid}`).risApproval === true);
  check(backend.store.get(`schools/${sid}`).risApproval === true, 'school: RIS needs approval');
  const supply = await ev(a, () => items.find(i => i.type === 'CONSUMABLE' && i.qty >= 8 && !relIsEquip(i)).name);
  await ev(t, w => { openRequestForm(); document.getElementById('rfSearch').value = w; addReqLine(); reqDraft.lines[0].qty = 3; sendRequest(); }, supply);
  await until(a, () => reqList.some(r => r.status === 'pending' && !r.sending), 'custodian gets the request', 10000);
  const rq = await ev(a, () => reqList.find(r => r.status === 'pending').id);
  await ev(a, id => { openReview(id); approveRequest(); }, rq);
  await waitNode(() => aps(sid).some(x => x.kind === 'ris' && x.refId === rq && x.status === 'pending'));
  const ap1 = aps(sid).find(x => x.kind === 'ris' && x.refId === rq);
  const ap1Id = ap1 && ap1.path.split('/').pop();
  check(ap1 && ap1.title === 'Ana Reyes' && ap1.lines[0].qty === 3 && ap1.byUid, 'approved request sent to the head (lines, teacher)');
  await until(a, () => apList.some(x => x.kind === 'ris' && x.status === 'pending'), 'custodian sees it', 8000);
  await ev(a, () => { switchMainView('REQUESTS'); setReqTab('approved'); });
  check(await ev(a, () => !!document.querySelector('[data-ris-head="pending"]')), 'request card: waiting for the School Head');
  check(await ev(a, id => { openReleaseFromRequest(id); return document.getElementById('releaseModal').classList.contains('hidden'); }, rq), 'can’t release before the head approves');
  check(await refused(a, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'approvals', id), { status: 'approved', decision: { byUid: cloud.user.uid, byName: 'Me', atMs: Date.now(), note: '' } }), sid, ap1Id), 'rules: the custodian can’t approve it');
  await until(h, () => document.querySelector('[data-head-ap][data-kind="ris"]'), 'head sees the RIS', 10000);
  check(await ev(h, () => loadNotifs().items.some(n => /Supply request \(RIS\) waits for you/.test(n.title))), 'head notified');
  h.dialogs.prompt = 'Only 2 for now, please';
  await ev(h, id => { headDecideAp(id, false); }, ap1Id);
  await waitNode(() => backend.store.get(ap1.path).status === 'returned');
  check(backend.store.get(ap1.path).decision.note === 'Only 2 for now, please' && backend.store.get(ap1.path).decision.byUid === hUid, 'head returned it with a note');
  await until(a, () => !!document.querySelector('[data-ris-head="returned"]'), 'custodian sees returned', 8000);
  check(await ev(a, () => loadNotifs().items.some(n => /returned Ana Reyes’s supply request/.test(n.title))), 'custodian notified: returned');
  await ev(a, id => { sendRisToHead(id); }, rq);
  await waitNode(() => aps(sid).filter(x => x.kind === 'ris' && x.refId === rq).length === 2);
  check(backend.store.get(ap1.path).status === 'cancelled' && aps(sid).some(x => x.refId === rq && x.status === 'pending'), 'sent again: the returned one is cancelled');
  await until(h, () => apPending().length === 1, 'head sees the new one', 8000);
  const ap2 = await ev(h, () => apPending()[0].id);
  await ev(h, id => { headDecideAp(id, true); }, ap2);
  await until(a, () => !!document.querySelector('[data-ris-head="approved"]'), 'custodian sees approved', 10000);
  check(await ev(a, () => loadNotifs().items.some(n => /approved Ana Reyes’s supply request/.test(n.title))), 'custodian notified: approved');
  await ev(a, id => { openReleaseFromRequest(id); __fillSerials(); confirmRelease(); }, rq);
  await waitNode(() => rel().some(r => r.requestId === rq && r.kind === 'RIS'));
  const ris = rel().find(r => r.requestId === rq && r.kind === 'RIS');
  check(ris && ris.headOk && ris.headOk.byName === HEAD, 'RIS made after approval keeps the head’s approval');
  const risHtml = await ev(a, () => { const d = releaseDone.docs.find(x => x.kind === 'RIS'); closeRelease(); return risPrintHTML(d); });
  check(risHtml.includes(HEAD.toUpperCase()) && /Approved in the app/.test(risHtml), 'printed RIS: Approved by the head, approved in the app');
  await ev(a, () => setRisApproval(false));
  await waitNode(() => backend.store.get(`schools/${sid}`).risApproval === false);

  out('4 lost property and write-offs');
  const held = await ev(a, code => getUnits(code).filter(u => u.toUid).map(u => u.id), equip.code);
  a.dialogs.prompt = 'Missing from Room 4 since Monday';
  await ev(a, id => { reportLostUnit(id); }, held[0]);
  await until(a, id => !!(findUnitWithItem(id) || {}).unit?.lostMs, 'reported lost', 5000, held[0]);
  check(await ev(a, id => findUnitWithItem(id).unit.lostNote === 'Missing from Room 4 since Monday' && reliefLeft(findUnitWithItem(id).unit) === 30, held[0]), 'lost: note kept, 30 days to apply for relief');
  // 25 days later: the relief reminder
  await ev(a, id => { findUnitWithItem(id).unit.lostMs = Date.now() - 25 * 864e5; saveState(); notifReminders(); }, held[0]);
  check(await ev(a, () => loadNotifs().items.some(n => /5 days left to apply for relief/.test(n.title))), 'reminder: 5 days left to apply for relief');
  a.dialogs.prompt = 'RLSDDSP No. 2026-001';
  await ev(a, id => { relieveLost(id); }, held[0]);
  await waitNode(() => aps(sid).some(x => x.kind === 'writeoff' && x.status === 'pending'));
  const wo = aps(sid).find(x => x.kind === 'writeoff');
  check(wo && wo.data.cause === 'lost' && wo.data.units[0].id === held[0] && /Ana Reyes/.test(wo.title), 'relief sent to the head (unit, holder)');
  check(await ev(a, id => !!findUnitWithItem(id), held[0]), 'not written off yet');
  await ev(a, code => { openUnitsModal(code); }, equip.code);
  check(await ev(a, () => !!document.querySelector('[data-lost-unit] [data-wo="pending"]')), 'unit: waiting for the School Head');
  await ev(a, () => closeUnitsModal());
  await until(h, () => document.querySelector('[data-head-ap][data-kind="writeoff"]'), 'head sees the write-off', 10000);
  await ev(h, id => { headDecideAp(id, true); }, wo.path.split('/').pop());
  await until(a, id => !findUnitWithItem(id), 'written off on the custodian’s phone', 10000, held[0]);
  const gone = await ev(a, (code, id) => getWrittenOff(code).find(r => r.id === id), equip.code, held[0]);
  check(gone && gone.cause === 'lost' && /RLSDDSP No\. 2026-001/.test(gone.ref) && /approved by John Russell/.test(gone.ref), `kept under Written off: “${gone && gone.ref}”`);
  await waitNode(() => !!backend.store.get(wo.path).appliedMs);
  check(!!backend.store.get(wo.path).appliedMs, 'the approval is marked done');
  // A unit in stock written off: the head returns it, so it stays
  const { code: fcode, id: free } = await ev(a, () => { const i = items.find(x => relIsEquip(x) && relUntagged(x) > 0);
    const no = nextPropertyNumbers(1, undefined, { date: localISODate(), cost: i.price })[0];
    const st = userState[i.code] || (userState[i.code] = { qty: i.qty });
    const u = { id: newUnitId(), no, serial: '', loc: 'Storage', to: '', cond: 'U', seen: null, printed: null, added: Date.now() };
    st.units = [...getUnits(i.code), u];
    syncUnitCondition(i); saveState();
    return { code: i.code, id: u.id }; });
  a.dialogs.prompt = 'Disposed – unserviceable';
  await ev(a, (code, id) => { removeUnitTag(code, id); }, fcode, free);
  await waitNode(() => aps(sid).some(x => x.kind === 'writeoff' && x.data.cause === 'removed'));
  check(await ev(a, (code, id) => !!findUnit(code, id), fcode, free), 'write-off waits: the unit stays');
  await until(h, () => apPending().some(x => x.data && x.data.cause === 'removed'), 'head sees it', 8000);
  h.dialogs.prompt = 'Have it inspected first';
  await ev(h, () => { headDecideAp(apPending().find(x => x.data.cause === 'removed').id, false); });
  await until(a, () => apList.some(x => x.kind === 'writeoff' && x.status === 'returned'), 'custodian sees returned', 8000);
  await ev(a, code => { openUnitsModal(code); }, fcode);
  check(await ev(a, (code, id) => !!findUnit(code, id) && /Have it inspected first/.test(document.getElementById('unitcard-' + id).textContent), fcode, free), 'returned: the unit stays, with the head’s note');
  await ev(a, () => closeUnitsModal());
  check(await refused(h, (F, sid) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', sid, 'approvals')), { kind: 'writeoff', refId: 'x', status: 'pending', byUid: cloud.user.uid }), sid), 'rules: the head can’t send approvals');
  check(await refused(t, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'approvals')), sid), 'rules: a teacher can’t read them');

  out('5 Year-end & reminders');
  await ev(a, () => openYearEnd());
  check(await ev(a, () => ['count', 'committee', 'lost', 'renew', 'bond', 'waiting'].every(k => document.querySelector(`[data-ye-section="${k}"]`))), 'panel: count, committee, lost, renewal, bond, waiting for the head');
  const soon = await ev(a, () => { const d = new Date(); d.setDate(d.getDate() + 10); return localISODate(d); });
  await ev(a, soon => {
    document.querySelector('#yeBody [data-ye="committee"]').value = 'Maria Santos\nPedro Cruz\nLiza Reyes';
    document.querySelector('#yeBody [data-ye="bondUntil"]').value = soon;
    document.querySelector('#yeBody [data-ye="desigNo"]').value = 'SO No. 12, s. 2026';
    saveYearEnd();
  }, soon);
  check(await ev(a, () => schoolInfo.committee.split('\n').length === 3 && coaVal('committee').startsWith('Maria Santos') && schoolInfo.desigNo === 'SO No. 12, s. 2026'), 'committee and designation order saved (the count report uses the committee)');
  check(await ev(a, () => /expires in 10 days/.test(document.querySelector('[data-ye-bond]').textContent)), 'bond: expires in 10 days');
  await ev(a, () => notifReminders());
  check(await ev(a, () => loadNotifs().items.some(n => /fidelity bond ends in 10 days/.test(n.title))), 'notification: the bond ends in 10 days');
  // Ana's remaining units are on a slip dated 4 years ago → renewal
  const old = await ev(a, code => { const d = new Date(); d.setFullYear(d.getFullYear() - 4); const iso = localISODate(d); const us = getUnits(code).filter(u => u.toUid); us.forEach(u => { u.icsDate = iso; }); saveState(); renderYearEnd(); return us.map(u => u.id); }, equip.code);
  check(await ev(a, n => Number((document.querySelector('[data-ye-renew]') || {}).dataset?.yeRenew) === n, old.length), `${old.length} units due for renewal (slips older than 3 years)`);
  await ev(a, () => notifReminders());
  check(await ev(a, () => loadNotifs().items.some(n => /on slips older than 3 years/.test(n.title))), 'notification: slips to renew');
  await ev(a, () => { renewOldSlips(); });
  await waitNode(() => rel().some(r => r.source === 'renewal' && /older than 3 years/.test(r.purpose)));
  check(rel().some(r => r.source === 'renewal' && r.teacherUid === anaUid && /older than 3 years/.test(r.purpose)), 'renewed: a new slip for Ana');
  check(await ev(a, (ids) => ids.every(id => findUnitWithItem(id).unit.icsDate === localISODate()), old), 'units now on today’s slip');
  // Count report → School Head
  await ev(a, () => { renderYearEnd(); sendCountToHead(); });
  await waitNode(() => aps(sid).some(x => x.kind === 'count' && x.status === 'pending'));
  const cnt = aps(sid).find(x => x.kind === 'count');
  check(cnt && cnt.data.committee.length === 3 && /Year-end count as at/.test(cnt.title) && cnt.refId === '2026-12-31', `count report sent: “${cnt && cnt.title}”`);
  await until(h, () => apPending().some(x => x.kind === 'count'), 'head sees the count report', 8000);
  await ev(h, () => { headDecideAp(apPending().find(x => x.kind === 'count').id, true); });
  await until(a, () => !!countApprovalNear('2026-12-31'), 'custodian has the approval', 8000);
  await ev(a, () => renderYearEnd());
  check(await ev(a, () => !!document.querySelector('[data-ye-count="approved"]')), 'panel: approved by the head');
  if (process.env.SHOTS) { await a.setViewport({ width: 390, height: 1400, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await ev(a, () => openYearEnd()); await sleep(400); await a.screenshot({ path: process.env.SHOTS + '/ye.png' }); await ev(a, () => closeYearEnd()); await a.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 }); }
  const printed = await ev(a, () => { closeYearEnd(); coaOpts.asAt = '2026-12-31'; coaOpts.countType = 'sep'; printCountReport(); return document.getElementById('printPrSection').innerHTML; });
  check(printed.includes('JOHN RUSSELL L. GUADALUPE') && /Approved in the app/.test(printed) && printed.includes('MARIA SANTOS'), 'printed RPCSP: committee, Approved by the head in the app');
  check(await ev(a, () => countSeason(new Date(2026, 5, 15).getTime()).mid === true && countPeriod(new Date(2026, 10, 18).getTime()).asAt === '2026-12-31' && countPeriod(new Date(2026, 2, 1).getTime()).asAt === '2026-06-30'), 'seasons: semestral (as at 30 June) and year-end (as at 31 December)');

  out('6 the head’s history');
  await ev(h, () => renderHeadView());
  if (process.env.SHOTS) { await h.setViewport({ width: 390, height: 2400, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await ev(h, () => document.querySelectorAll('#hdBody details').forEach(d => { d.open = true; })); await sleep(400); await h.screenshot({ path: process.env.SHOTS + '/head.png' }); }
  check(await ev(h, () => document.querySelectorAll('#hdBody [data-head-ap]').length >= 3 && /Recently decided/.test(document.getElementById('hdBody').textContent)), 'head: recently decided');

  out('7 errors');
  const expected = backend.denied.filter(d => !/inventory|dashboard|approval/.test(d));
  check(expected.length === 0, `no unexpected refusals ${JSON.stringify(expected).slice(0, 300)}`);
  const bad = errors.filter(e => !/favicon/.test(e));
  check(bad.length === 0, `no errors on any phone ${JSON.stringify(bad).slice(0, 400)}`);
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('head-desk');
}
