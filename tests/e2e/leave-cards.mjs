// Leave cards, the credits ledger of the Leave pilot (Nov 2026): one card per person with the
// opening balances from the paper cards (and their memos), credits earned (VSC: Division memo,
// up to 30 days a year; Local Service Credits: School memo, no limit, not reflected in the DTR;
// VL/SL 1.25 a month for non-teaching staff), approved leaves deducted by themselves, 7.A of
// Form 6 filled in from the card, voided lines, and the leave card print.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, refused } from './lib/school-setup.mjs';

const backend = createBackend({ leavePilot: 'any' });
const cardOf = (sid, id) => backend.store.get(`schools/${sid}/leaveCards/${id}`);
const bal = (c, cr) => Math.round((c.entries || []).filter(e => !e.void && e.cr === cr).reduce((n, e) => n + e.days, 0) * 1000) / 1000;
const leaves = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/leaves/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));

async function entry(a, cardId, mode, { cr, days, at, memo = '', note = '' }) {
  await ev(a, (i, m) => openLvSheet('cardEntry', i, m), cardId, mode);
  await until(a, () => !!document.getElementById('lcEntrySave'), 'entry sheet');
  await ev(a, (c, d, t, m, n) => { lcCr.value = c; lcEntryHint(); lcDays.value = d; if (t) lcAt.value = t; lcMemo.value = m; lcNote.value = n; }, cr, String(days), at || '', memo, note);
  await ev(a, () => lcEntrySave.click());
}
async function apply(t, { type = 'VL', from, to, use }) {
  await ev(t, () => setTeacherTab('leave'));
  await ev(t, () => document.getElementById('lvApplyBtn').click());
  await until(t, () => !!document.getElementById('lvApplySave'), 'apply sheet');
  await ev(t, (ty, f, to2, u) => {
    lvType.value = ty; lvApplyDetail(); lvFrom.value = f; lvTo.value = to2; lvApplyDates();
    document.querySelector(`input[name="lvUse"][value="${u}"]`).checked = true; lvApplyUse();
  }, type, from, to || from, use);
  await ev(t, () => document.getElementById('lvApplySave').click());
}
// No School Head in the app: the AO records the approval on paper
async function approveOnPaper(a, id, memo) {
  await until(a, i => lvList.some(l => l.id === i), 'AO sees the application', 8000, id);
  await ev(a, i => openLvSheet('receive', i), id);
  await until(a, () => !!document.getElementById('lvSendHead'), 'receive sheet');
  const note = await ev(a, m => { if (m) lvMemo.value = m; lvRecBal(); return document.getElementById('lvRecBal').textContent; }, memo || '');
  await ev(a, () => lvSendHead.click());
  return note;
}

try {
  out('1 the AO makes leave cards');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: tUid } = await teacher(backend, sid);
  for (const p of [a, t]) await ev(p, () => localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId));
  await ev(a, () => { leaveSync(); openLeaveView(); setLvPage('cards'); });
  await ev(t, () => setTeacherTab('leave'));   // the teacher's phone starts listening (notifications from here on)
  await until(a, () => !!document.querySelector('[data-lc-empty]'), 'no cards yet');
  check(await ev(a, () => !document.getElementById('lvEncodeBtn') && !!document.getElementById('lcNewBtn')), 'Leave cards page: New leave card, no Encode');
  await ev(a, () => document.getElementById('lcNewBtn').click());
  await until(a, () => !!document.getElementById('lcNewSave'), 'new card sheet');
  await ev(a, u => { lcWho.value = u; lcNewWho(); }, tUid);
  check(await ev(a, () => lcName.value === 'Ana Reyes' && lcStaff.value === 'teaching'), 'picking Ana fills in her name; Teaching (service credits)');
  await ev(a, () => lcNewSave.click());
  await waitNode(() => !!cardOf(sid, tUid));
  check(cardOf(sid, tUid).uid === tUid && cardOf(sid, tUid).staff === 'teaching', 'card saved under her uid');
  await until(a, () => lvSheet && lvSheet.view === 'card', 'card sheet opens');

  out('2 opening balances and credits, with memos');
  await entry(a, tUid, 'open', { cr: 'vsc', days: 5, at: '2026-06-30', memo: 'Division Memo No. 12, s. 2025', note: 'from the 2025 leave card' });
  await waitNode(() => bal(cardOf(sid, tUid), 'vsc') === 5);
  await entry(a, tUid, 'earn', { cr: 'lsc', days: 2, memo: '' });
  check(await ev(a, () => /School memo number/.test(document.getElementById('lvErr').textContent)), 'Local Service Credits need the School memo number');
  await ev(a, () => { lcMemo.value = 'School Memo No. 3, s. 2026'; lcNote.value = 'Brigada Eskwela'; lcEntrySave.click(); });
  await waitNode(() => bal(cardOf(sid, tUid), 'lsc') === 2);
  check(bal(cardOf(sid, tUid), 'vsc') === 5 && bal(cardOf(sid, tUid), 'lsc') === 2, 'VSC 5 (opening) and Local SC 2 (earned)');
  check(await ev(a, () => document.querySelector('[data-lc-bal="vsc"]').textContent.includes('5') && /not reflected in the DTR/.test(document.getElementById('lvModalBody').textContent)), 'the card shows the balances and the DTR note');
  a.dialogs.confirm = false;
  await entry(a, tUid, 'earn', { cr: 'vsc', days: 31, at: '2026-08-01', memo: 'Division Memo No. 50, s. 2026' });
  check(a.dialogs.some(d => /30 days/.test(d)) && bal(cardOf(sid, tUid), 'vsc') === 5, 'more than 30 days of VSC in a year asks first (not added when declined)');
  a.dialogs.confirm = true;
  await ev(a, () => closeLvModal());
  await entry(a, tUid, 'open', { cr: 'vsc', days: 6, at: '2026-06-30', memo: 'Division Memo No. 12, s. 2025' });
  await waitNode(() => bal(cardOf(sid, tUid), 'vsc') === 6);
  check(cardOf(sid, tUid).entries.filter(e => e.src === 'open' && e.void).length === 1, 'a new opening balance replaces the old one (voided, kept)');

  out('3 the teacher sees her credits');
  await ev(t, () => setTeacherTab('leave'));
  await until(t, () => !!document.querySelector('[data-lc-mine] [data-lc-bal="vsc"]'), 'my leave credits');
  check(await ev(t, () => document.querySelector('[data-lc-mine] [data-lc-bal="vsc"]').textContent.includes('6') && document.querySelector('[data-lc-mine] [data-lc-bal="lsc"]').textContent.includes('2')), 'teacher: VSC 6 · Local SC 2');
  await until(t, () => loadNotifs().items.some(n => /Leave credits added: 2 days of Local SC/.test(n.title)), 'teacher told: credits added');
  check(await ev(t, () => loadNotifs().items.some(n => /Leave credits added: 2 days of Local SC/.test(n.title))), 'teacher: “Leave credits added: 2 days of Local SC”');
  await ev(t, () => document.getElementById('lvApplyBtn').click());
  await until(t, () => !!document.querySelector('[data-lv-left="vsc"]'), 'balances on the options');
  check(await ev(t, () => document.querySelector('[data-lv-left="vsc"]').textContent === '6 left'), 'apply: “6 left” under Vacation Service Credits');
  await ev(t, () => closeLvModal());
  await ev(t, () => document.getElementById('lcMineBtn').click());
  await until(t, () => lvSheet && lvSheet.view === 'card', 'teacher opens her card');
  check(await ev(t, () => !document.querySelector('[data-lc-act]') && !document.querySelector('[data-lc-void]') && !!document.querySelector('[data-lc-print]')), 'teacher: view only, with Print');
  await ev(t, () => closeLvModal());
  check(await refused(t, (F, u) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaveCards'), u), { entries: [] }), tUid), 'rules: the teacher can’t change her card');
  check(await refused(t, F => F.getDocs(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaveCards'))), 'rules: the teacher can’t list everyone’s cards');

  out('4 an approved leave comes off the card; 7.A fills in');
  await apply(t, { from: '2026-11-23', to: '2026-11-25', use: 'vsc' });
  await waitNode(() => leaves(sid).length === 1);
  const L = () => leaves(sid)[0];
  const note = await approveOnPaper(a, L().id, 'Division Memo No. 12, s. 2025');
  check(/6 VSC left · 3 after this/.test(note), `receive shows the card: “${note}”`);
  await waitNode(() => L().status === 'approved');
  await waitNode(() => bal(cardOf(sid, tUid), 'vsc') === 3, 10000);
  const d = cardOf(sid, tUid).entries.find(e => e.leaveId === L().id);
  check(!!d && d.days === -3 && d.cr === 'vsc' && d.at === '2026-11-23', '3 days deducted from VSC, dated the first day of the leave');
  await ev(a, i => openLvSheet('prepare', i), L().id);
  await until(a, () => !!document.getElementById('lvSendTeacher'), 'prepare sheet');
  check(await ev(a, () => !!document.querySelector('[data-lv-auto7a]') && lvC_vl_earned.value === '6' && lvC_vl_less.value === '3' && lvC_vl_bal.value === '3'), '7.A from the card: 6 · less 3 · balance 3');
  await ev(a, () => lvSendTeacher.click());
  await waitNode(() => L().status === 'review');
  await ev(a, () => { lcSweep(); });
  check(cardOf(sid, tUid).entries.filter(e => e.leaveId === L().id).length === 1, 'deducted once only');
  await ev(t, i => openLvSheet('view', i), L().id);
  await until(t, () => /3 VSC deducted/.test(document.getElementById('lvModalBody').textContent), 'teacher sees the deduction', 8000);
  check(await ev(t, () => /3 VSC deducted/.test(document.getElementById('lvModalBody').textContent)), 'teacher: “Leave card · 3 VSC deducted”');
  await ev(t, () => closeLvModal());

  out('5 Local Service Credits: not reflected in the DTR');
  await apply(t, { from: '2026-11-27', use: 'lsc' });
  await waitNode(() => leaves(sid).length === 2);
  const S = () => leaves(sid).find(l => l.use === 'lsc');
  await approveOnPaper(a, S().id, 'School Memo No. 3, s. 2026');
  await waitNode(() => bal(cardOf(sid, tUid), 'lsc') === 1, 10000);
  const ds = cardOf(sid, tUid).entries.find(e => e.leaveId === S().id);
  check(!!ds && /not reflected in the DTR/.test(ds.note), 'deducted from Local SC, marked “not reflected in the DTR”');
  await ev(a, i => openLvSheet('prepare', i), S().id);
  await until(a, () => !!document.getElementById('lvSendTeacher'), 'prepare sheet 2');
  check(await ev(a, () => /not reflected in the DTR/.test(lvFMemo.value)), 'Form 6 memo line says “not reflected in the DTR”');
  await ev(a, () => closeLvModal());

  out('6 non-teaching staff: VL and SL each month');
  await ev(a, () => { openLeaveView(); setLvPage('cards'); });
  await ev(a, () => document.getElementById('lcNewBtn').click());
  await until(a, () => !!document.getElementById('lcNewSave'), 'new card sheet 2');
  await ev(a, () => { lcName.value = 'Carlo D. Mendoza'; lcPos.value = 'Administrative Assistant II'; lcNewStaff(); });
  check(await ev(a, () => lcStaff.value === 'nonteaching'), 'Administrative Assistant: Non-teaching (VL and SL)');
  await ev(a, () => lcNewSave.click());
  const carlo = () => [...backend.store.entries()].find(([k, v]) => k.startsWith(`schools/${sid}/leaveCards/`) && v.name === 'Carlo D. Mendoza');
  await waitNode(() => !!carlo());
  check(carlo()[1].uid === '' && carlo()[1].staff === 'nonteaching', 'a card for someone not in the app');
  await ev(a, () => { closeLvModal(); renderLeaveView(); });
  await ev(a, () => document.getElementById('lcMonthlyBtn').click());
  await until(a, () => !!document.getElementById('lcMonthlySave'), 'monthly sheet');
  await ev(a, () => { lcMonth.value = '2026-10'; lcMonthlyHint(); lcMonthlySave.click(); });
  await waitNode(() => bal(carlo()[1], 'vl') === 1.25 && bal(carlo()[1], 'sl') === 1.25);
  check(bal(carlo()[1], 'vl') === 1.25 && bal(carlo()[1], 'sl') === 1.25 && bal(cardOf(sid, tUid), 'vl') === 0, 'October: +1.25 VL and +1.25 SL for Carlo only');
  await ev(a, () => openLvSheet('monthly'));
  await until(a, () => !!document.getElementById('lcMonthlySave'), 'monthly sheet 2');
  await ev(a, () => { lcMonth.value = '2026-10'; lcMonthlyHint(); });
  check(await ev(a, () => /already added/.test(document.getElementById('lcMonthlyList').textContent)), 'October shows “already added”');
  await ev(a, () => lcMonthlySave.click());
  check(bal(carlo()[1], 'vl') === 1.25, 'not added twice');

  out('7 void a line; print the leave card');
  const cid = carlo()[0].split('/').pop();
  await ev(a, i => openLvSheet('card', i), cid);
  a.dialogs.prompt = 'typed for the wrong month';
  const slLine = carlo()[1].entries.find(e => e.cr === 'sl').id;
  await ev(a, (c, l) => lcVoid(c, l), cid, slLine);
  await waitNode(() => bal(carlo()[1], 'sl') === 0);
  check(carlo()[1].entries.find(e => e.id === slLine).voidNote === 'typed for the wrong month', 'voided with the reason, still on the card');
  await ev(a, () => closeLvModal());
  await ev(a, u => lcPrint(u), tUid);
  await until(a, () => (window.__printed || 0) >= 1, 'printed');
  const p = await ev(a, () => ({ text: document.getElementById('printPrSection').textContent, wide: !!document.querySelector('#printPrSection .pr-wide') }));
  check(/LEAVE CARD/.test(p.text) && /Ana Reyes/.test(p.text) && /Balance forwarded/.test(p.text) && /Division Memo No. 12/.test(p.text), 'leave card print: name, balance forwarded, memo');
  check(/Vacation Service Credits/.test(p.text) && /Local Service Credits/.test(p.text) && /not reflected in the DTR/.test(p.text) && !p.wide, 'two kinds of credit (portrait), with the DTR note');

  const bad = backend.denied.filter(d => !/leave card write|list leave cards/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 300)})`);
  const errs = errors.filter(e => /lc|lv|leave/i.test(e));
  check(!errs.length, `no page errors about leave (${errs.join(' | ').slice(0, 300)})`);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('leave-cards');
  await closeAll();
}
