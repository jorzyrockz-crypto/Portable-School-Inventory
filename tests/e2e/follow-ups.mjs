// Follow-ups the custodian and teachers asked for (the rest of the notifications plan, without a
// server):
//  · T3 fewer than asked: "approved, with fewer items" and "Partly supplied: 3 of 5 …";
//  · T4 Ask back: the custodian asks a teacher to return a unit; the teacher's phone shows it on
//    My Items (with Return) and a notification; their return request ends it;
//  · C9 equipment of ₱50,000 or more still on an ICS: Year-end & reminders → Make the PAR;
//  · C8 a Purchase Request approved more than 30 days ago and not delivered: reminder + list.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, ev, until, closeAll, summary } from './lib/harness.mjs';
import { waitNode, custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const rel = sid => backend.docs(`schools/${sid}/releases/`).map(d => ({ ...d, id: d.path.split('/').pop() }));
const reqs = sid => backend.docs(`schools/${sid}/requests/`).map(d => ({ ...d, id: d.path.split('/').pop() }));
const notified = (page, re) => ev(page, src => loadNotifs().items.some(n => new RegExp(src).test(`${n.title} · ${n.body}`)), re.source);

try {
  out('1 a school with a teacher');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: anaUid } = await teacher(backend, sid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, anaUid);

  out('2 fewer than asked (T3)');
  const supply = await ev(a, () => { const i = items.find(x => x.type === 'CONSUMABLE' && x.qty >= 8 && !relIsEquip(x)); return { name: i.name, code: i.code }; });
  await ev(t, w => { openRequestForm(); document.getElementById('rfSearch').value = w; addReqLine(); reqDraft.lines[0].qty = 5; sendRequest(); }, supply.name);
  await until(a, () => reqList.some(r => r.status === 'pending' && !r.sending), 'custodian gets the request', 10000);
  const rq = await ev(a, () => reqList.find(r => r.status === 'pending').id);
  await ev(a, id => { openReview(id); reviewState.lines[0].approved = 3; approveRequest(); }, rq);
  await waitNode(() => (reqs(sid).find(r => r.id === rq) || {}).status === 'approved');
  await until(t, () => loadNotifs().items.some(n => /approved, with fewer items/.test(n.title)), 'Ana: approved with fewer items', 10000);
  check(await notified(t, /Approved 3 of 5/), 'Ana: “approved, with fewer items · Approved 3 of 5 …”');
  await ev(a, id => { openReleaseFromRequest(id); __fillSerials(); confirmRelease(); closeRelease(); }, rq);
  await waitNode(() => (reqs(sid).find(r => r.id === rq) || {}).status === 'released');
  const r1 = reqs(sid).find(r => r.id === rq);
  check(r1.short && r1.short.length === 1 && r1.short[0].asked === 5 && r1.short[0].got === 3, `request: short ${JSON.stringify(r1.short)}`);
  await until(t, () => loadNotifs().items.some(n => n.title === 'Partly supplied'), 'Ana: Partly supplied', 10000);
  check(await notified(t, /Partly supplied · Supplied 3 of 5/), 'Ana: “Partly supplied · Supplied 3 of 5 …”');
  await ev(t, () => setTeacherTab('requests'));
  check(await ev(t, () => /3 of 5/.test((document.querySelector('[data-req-short]') || {}).textContent || '')), 'Ana’s request card: “Supplied 3 of 5 …”');
  await until(a, id => (reqList.find(r => r.id === id).short || []).length === 1, 'custodian has the request back', 8000, rq);
  check(await ev(a, id => /Partly supplied: 3 of 5/.test(reqCardHTML(reqList.find(r => r.id === id))), rq), 'custodian’s card: “Partly supplied: 3 of 5 …”');

  out('3 Ask back (T4)');
  const equip = await ev(a, () => { const i = items.find(x => relIsEquip(x) && relMax(x) >= 3 && !isPPE(x)); return { code: i.code, name: i.name }; });
  await ev(a, (uid, code) => { openRelease({ teacherUid: uid, lines: [{ code, qty: 2 }], purpose: 'Classroom use' }); __fillSerials(); confirmRelease(); closeRelease(); }, anaUid, equip.code);
  await waitNode(() => rel(sid).some(r => r.teacherUid === anaUid && r.kind === 'ICS'));
  const ics = rel(sid).find(r => r.teacherUid === anaUid && r.kind === 'ICS');
  const [u1, u2] = ics.lines[0].units;
  await until(a, id => !!unitHeldRelease(findUnitWithItem(id).unit), 'the slip on the custodian’s phone', 8000, u1.id);
  a.dialogs.prompt = 'For the physical count, by Friday';
  await ev(a, id => askUnitBack(id), u1.id);
  await waitNode(() => !!((rel(sid).find(r => r.id === ics.id).askBack || {})[u1.id]));
  check(rel(sid).find(r => r.id === ics.id).askBack[u1.id].note === 'For the physical count, by Friday', 'saved on the slip: askBack (why / by when)');
  check(await ev(a, id => !!unitAskBack(findUnitWithItem(id).unit), u1.id), 'custodian: “Asked back” on the unit');
  await until(t, () => loadNotifs().items.some(n => /asks for an item back/.test(n.title)), 'Ana notified', 10000);
  check(await notified(t, /For the physical count, by Friday · tap Return/), 'Ana: notification with the reason');
  await ev(t, () => setTeacherTab('items'));
  await until(t, id => !!document.querySelector(`[data-tunit-card="${id}"] [data-t-askback], [data-tunit-row="${id}"] [data-t-askback]`) || (document.querySelectorAll('[data-tgroup] button[aria-expanded="false"]').forEach(b => b.click()), false), 'My Items: asked back', 8000, u1.id);
  check(await ev(t, id => !document.querySelector(`[data-tunit-card="${id}"] [data-t-askback], [data-tunit-row="${id}"] [data-t-askback]`), u2.id), '…only on that unit');
  await ev(t, ([rid, uid]) => { openTeacherReport('return', rid, uid); sendTeacherReport(); }, [ics.id, u1.id]);
  await until(t, id => !document.querySelector(`[data-tunit-card="${id}"] [data-t-askback], [data-tunit-row="${id}"] [data-t-askback]`), 'Return requested replaces it', 8000, u1.id);
  check(true, 'Ana taps Return: the ask is answered (Return requested)');

  out('4 ₱50,000 or more on an ICS (C9)');
  check(await ev(a, () => unitsNeedingPar().length === 0), 'nothing to fix at first');
  await ev(a, id => { const f = findUnitWithItem(id); f.unit.cost = 62000; saveState(); }, u2.id);
  check(await ev(a, () => unitsNeedingPar().length === 1), 'a unit corrected to ₱62,000 on an ICS needs a PAR');
  await ev(a, () => { const st = loadNotifs(); Object.keys(st.seen).filter(k => /^np:/.test(k)).forEach(k => delete st.seen[k]); saveNotifs(); notifYearEnd(Date.now()); });
  check(await notified(a, /1 unit of ₱50,000 or more on an ICS/), 'monthly reminder: “1 unit of ₱50,000 or more on an ICS”');
  await ev(a, () => openYearEnd());
  check(await ev(a, () => document.querySelector('[data-ye-par]')?.dataset.yePar === '1' && /Ana Reyes/.test(document.querySelector('[data-ye-section="par"]').textContent)), 'Year-end & reminders: the unit and who holds it');
  await ev(a, () => moveToPar());
  await waitNode(() => rel(sid).some(r => r.kind === 'PAR' && r.teacherUid === anaUid && r.source === 'renewal'));
  const par = rel(sid).find(r => r.kind === 'PAR' && r.teacherUid === anaUid);
  check(par.lines.length === 1 && par.lines[0].units.length === 1 && par.lines[0].units[0].id === u2.id && /ICS to PAR/.test(par.purpose), 'Make the PAR: a PAR for Ana with that one unit');
  check(await ev(a, id => findUnitWithItem(id).unit.doc === 'PAR' && unitsNeedingPar().length === 0, u2.id), 'the unit is now on the PAR; nothing left to fix');
  await ev(a, () => closeYearEnd());

  out('5 PR not delivered after 30 days (C8)');
  const late = await ev(a, () => {
    const now = Date.now();
    prList.push({ id: 'late-pr', prNo: '2026-09-004', total: 18500, createdMs: now - 41 * 86400000, date: localISODate(new Date(now - 41 * 86400000)), lines: [], requestIds: [] });
    notifPrsNotDelivered(now);
    const first = loadNotifs().items.some(n => /PR No\. 2026-09-004 is still not delivered/.test(n.title) && /41 days/.test(n.body));
    const before = loadNotifs().items.length;
    notifPrsNotDelivered(now);
    const once = loadNotifs().items.length === before;
    openYearEnd();
    const list = document.querySelector('[data-ye-late-prs]')?.textContent || '';
    closeYearEnd();
    prList = prList.filter(p => p.id !== 'late-pr');
    return { first, once, list };
  });
  check(late.first, 'reminder: “PR No. 2026-09-004 is still not delivered · 41 days since it was approved”');
  check(late.once, '…once (not again until 60 days)');
  check(/2026-09-004/.test(late.list) && /41 days/.test(late.list), 'Year-end & reminders: Purchase Requests not delivered');
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('follow-ups');
}
