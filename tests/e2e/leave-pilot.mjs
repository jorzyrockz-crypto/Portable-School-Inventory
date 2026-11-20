// Leave (CS Form No. 6), a pilot at one school (Nov 2026). The teacher applies on their phone,
// the AO (the custodian's account) receives and recommends it and sends it to the School Head,
// who approves or returns it in the Approve tab. The AO prepares Form 6, the teacher prints it,
// and the AO records Handed in, Signed by the School Head and Received by the Division (stamp
// date). A ₱250 whole-day absence is approved too and its Form 6 is kept on hold (2 a month).
// Other schools see none of it, and the rules refuse it there.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead, refused } from './lib/school-setup.mjs';

const pilot = [];   // the test school joins the pilot after step 1
const backend = createBackend({ leavePilot: pilot });
const leaves = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/leaves/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const notifs = (page, re) => ev(page, src => loadNotifs().items.some(n => new RegExp(src).test(n.title)), re.source);
const turnOn = page => ev(page, () => { localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId); });

async function apply(t, { type = 'VL', from, to, use = 'vsc', days, reason = '' }) {
  await ev(t, () => setTeacherTab('leave'));
  await ev(t, () => document.getElementById('lvApplyBtn').click());
  await until(t, () => !!document.getElementById('lvApplySave'), 'apply sheet');
  await ev(t, (ty, f, to2, u, d, r) => {
    lvType.value = ty; lvApplyDetail();
    lvFrom.value = f; lvTo.value = to2; lvApplyDates();
    if (d) lvDays.value = d;
    document.querySelector(`input[name="lvUse"][value="${u}"]`).checked = true; lvApplyUse();
    lvReason.value = r;
  }, type, from, to || from, use, days || '', reason);
  await ev(t, () => document.getElementById('lvApplySave').click());
}

try {
  out('1 not a pilot school: nothing shows, the rules refuse');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: tUid } = await teacher(backend, sid);
  check(await ev(a, () => document.getElementById('sideLeave').style.display === 'none' && document.getElementById('moreLeaveItem').style.display === 'none'), 'custodian: no Leave in the sidebar or More');
  check(await ev(t, () => document.getElementById('rqTab-leave').classList.contains('hidden') && document.getElementById('rqTabs').classList.contains('grid-cols-4')), 'teacher: four tabs, no Leave');
  check(await ev(a, () => !wnList().some(r => r.pilot) && WHATS_NEW.some(r => r.id === '2026-11-leave-pilot') && WHATS_NEW[0].pilot === 'leave'), 'What’s new: the pilot notes are not shown here');
  await ev(a, () => switchMainView('LEAVE'));
  check(await ev(a, () => activeMainView === 'HOME'), 'the Leave page does not open');
  check(await refused(t, (F, uid) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves')), { uid, name: 'Ana Reyes', type: 'VL', status: 'applied', by: 'teacher', log: [] }), tUid), 'rules: a leave at another school is refused');

  out('2 the pilot is on');
  pilot.push(sid);
  backend.denied.length = 0;
  await turnOn(a); await turnOn(t);
  await ev(a, () => { leaveSync(); lvNav(); });
  await ev(t, () => setTeacherTab('items'));
  check(await ev(a, () => document.getElementById('sideLeave').style.display === '' && document.getElementById('moreLeaveItem').style.display === ''), 'custodian: Leave in the sidebar and More');
  check(await ev(t, () => !document.getElementById('rqTab-leave').classList.contains('hidden') && document.getElementById('rqTabs').classList.contains('grid-cols-5')), 'teacher: a fifth tab, Leave');
  check(await ev(t, () => wnList()[0].pilot === 'leave' && wnList().some(r => r.id === '2026-11-leave-pilot')), 'What’s new: the pilot notes show here');
  const { page: h } = await schoolHead(backend, a, sid);

  out('3 the teacher applies');
  await apply(t, { from: '2026-11-23', to: '2026-11-25', reason: 'Family matter in Bohol' });
  await waitNode(() => leaves(sid).length === 1);
  const L = () => leaves(sid)[0];
  check(L().status === 'applied' && L().days === 3 && L().uid === tUid && L().by === 'teacher' && L().use === 'vsc', 'saved: applied, 3 working days, service credits');
  check(await ev(t, () => !!document.querySelector('#lvMine [data-lv-status="applied"]') && !!document.querySelector('[data-lv-steps="0"]')), 'teacher: listed as Applied with the steps');
  await until(a, () => loadNotifs().items.some(n => /Leave application from Ana Reyes/.test(n.title)), 'custodian notified');
  check(await notifs(a, /Leave application from Ana Reyes/), 'custodian: “Leave application from Ana Reyes”');

  out('4 the AO receives it and sends it to the School Head');
  await ev(a, () => openLeaveView());
  await until(a, () => !!document.querySelector('[data-lv-stage="applied"] [data-lv]'), 'new application on the Leave page');
  check(await ev(a, () => activeMainView === 'LEAVE' && document.getElementById('sideLeaveCount').textContent === '1'), 'the Leave page is open, 1 to act on');
  const id = L().id;
  await ev(a, i => openLvSheet('view', i), id);
  await ev(a, () => document.querySelector('[data-lv-act="receive"]').click());
  await until(a, () => !!document.getElementById('lvSendHead'), 'receive sheet');
  await ev(a, () => { lvSendHead.click(); });
  check(await ev(a, () => /memo/.test(document.getElementById('lvErr').textContent)), 'service credits need the memo number');
  await ev(a, () => { lvMemo.value = 'Division Memo No. 45, s. 2026'; lvRecNote.value = 'Has 5 days left'; lvSendHead.click(); });
  await waitNode(() => L().status === 'sh');
  const ap1 = () => [...backend.store.entries()].filter(([k, v]) => k.startsWith(`schools/${sid}/approvals/`) && v.kind === 'leave');
  check(L().rec && L().rec.memo === 'Division Memo No. 45, s. 2026' && L().receivedISO, 'recommendation saved with the memo and the date received');
  check(ap1().length === 1 && ap1()[0][1].status === 'pending' && ap1()[0][1].refId === id, 'an approval (kind leave) waits for the School Head');
  await until(t, () => loadNotifs().items.some(n => /was received/.test(n.title)), 'teacher told: received');
  check(await notifs(t, /was received/), 'teacher: “Your leave application was received”');

  out('5 the School Head returns it, the AO sends it again, the head approves');
  await ev(h, () => setHeadTab('approve'));
  await until(h, () => !!document.querySelector('[data-head-ap][data-kind="leave"]'), 'leave in the Approve tab', 10000);
  check(await ev(h, () => /Leave application/.test(document.querySelector('[data-head-ap][data-kind="leave"]').textContent) && /Ana Reyes/.test(document.querySelector('[data-head-ap][data-kind="leave"]').textContent)), 'head: card “Leave application · Ana Reyes”');
  h.dialogs.prompt = 'Attach the memo';
  await ev(h, apId => headDecideAp(apId, false), ap1()[0][0].split('/').pop());
  await waitNode(() => L().status === 'returned', 10000);
  check(L().returned && L().returned.note === 'Attach the memo', 'returned with the note (the AO’s phone follows the decision)');
  await until(t, () => loadNotifs().items.some(n => /was returned/.test(n.title)), 'teacher told: returned');
  check(await notifs(t, /was returned/), 'teacher: “Your leave application was returned”');
  await ev(a, i => openLvSheet('receive', i), id);
  await ev(a, () => lvSendHead.click());
  await waitNode(() => L().status === 'sh');
  const pend = () => ap1().find(([, v]) => v.status === 'pending');
  check(!!pend() && ap1().length === 2, 'sent again: a new approval');
  await until(h, () => document.querySelectorAll('[data-head-ap][data-kind="leave"] [data-ap-approve]').length === 1, 'head sees it again', 10000);
  await ev(h, apId => headDecideAp(apId, true), pend()[0].split('/').pop());
  await waitNode(() => L().status === 'approved', 10000);
  check(L().approval && /Guadalupe/.test(L().approval.byName), 'approved by the School Head in the app');
  await until(a, () => loadNotifs().items.some(n => /approved Ana Reyes’s leave/.test(n.title)), 'custodian told: approved');
  check(await notifs(a, /approved Ana Reyes’s leave/), 'custodian: “… approved Ana Reyes’s leave”');

  out('6 the AO prepares Form 6; the teacher prints it');
  await ev(a, i => openLvSheet('prepare', i), id);
  await until(a, () => !!document.getElementById('lvSendTeacher'), 'prepare sheet');
  check(await ev(a, () => lvLast.value === 'Reyes' && lvFirst.value === 'Ana' && /Division Memo No. 45/.test(lvFMemo.value) && lvFWith.value === '3'), 'Form 6 filled in: name, memo, 3 days with pay');
  await ev(a, () => { lvC_vl_earned.value = '10'; lvC_vl_less.value = '3'; lvC_vl_bal.value = '7'; lvSendTeacher.click(); });
  await waitNode(() => L().status === 'review');
  check(L().form && L().form.cred.vl.bal === 7, 'Form 6 saved (7.A balance 7)');
  await until(t, () => loadNotifs().items.some(n => /Form 6 is ready/.test(n.title)), 'teacher told: Form 6 ready');
  await ev(t, () => setTeacherTab('leave'));
  check(await ev(t, () => !document.getElementById('rqLeaveDot').classList.contains('hidden')), 'teacher: a dot on the Leave tab');
  await until(t, i => !!document.querySelector(`[data-lv-print="${i}"]`), 'print button', 8000, id);
  await ev(t, i => document.querySelector(`[data-lv-print="${i}"]`).click(), id);
  await until(t, () => (window.__printed || 0) === 1, 'printed');
  const form = await ev(t, () => ({ printed: window.__printed || 0, text: document.getElementById('printPrSection').textContent, x: [...document.querySelectorAll('#printPrSection .lv-box')].filter(b => b.textContent === 'X').length }));
  check(form.printed === 1 && /APPLICATION FOR LEAVE/.test(form.text) && /Civil Service Form No. 6/.test(form.text), 'teacher prints CS Form No. 6');
  check(/Reyes/.test(form.text) && /November 23–25, 2026/.test(form.text) && /Division Memo No. 45/.test(form.text) && /JOHN RUSSELL L. GUADALUPE/.test(form.text), 'the form has the name, dates, memo and the School Head');
  check(form.x >= 4, `boxes ticked (${form.x}): Vacation, Within the Philippines, Not requested, For approval`);

  out('7 handed in, signed, received by the Division');
  await ev(a, i => openLvSheet('view', i), id);
  await ev(a, () => document.querySelector('[data-lv-act="handed"]').click());
  await waitNode(() => L().status === 'handed');
  await ev(a, () => document.querySelector('[data-lv-act="signed"]').click());
  await waitNode(() => L().status === 'signed');
  await until(a, () => !!document.querySelector('[data-lv-act="do"]'), 'Received by the Division button');
  await ev(a, () => document.querySelector('[data-lv-act="do"]').click());
  await until(a, () => !!document.getElementById('lvDoSave'), 'DO sheet');
  await ev(a, () => { lvDoDate.value = '2026-11-10'; lvDoRef.value = 'DTS-2026-1188'; lvDoSave.click(); });
  await waitNode(() => L().status === 'done');
  check(L().doISO === '2026-11-10' && L().doRef === 'DTS-2026-1188', 'done: the stamp date and reference');
  check(L().log.length >= 9, `the history has every step (${L().log.length})`);
  await until(t, () => loadNotifs().items.some(n => /received by the Division/.test(n.title)), 'teacher told: done');
  check(await notifs(t, /Form 6 signed by the School Head/) && await notifs(t, /received by the Division/), 'teacher told when signed and when the Division received it');

  out('8 ₱250: two a month, approved, Form 6 on hold');
  await apply(t, { type: 'SPL', from: '2026-12-01', use: 'p250', days: '1' });
  await waitNode(() => leaves(sid).length === 2);
  await apply(t, { type: 'SPL', from: '2026-12-03', to: '2026-12-04', use: 'p250' });
  check(await ev(t, () => /2 times a month/.test(document.getElementById('lvErr').textContent)), 'a third ₱250 day in December is refused');
  await ev(t, () => closeLvModal());
  const P = () => leaves(sid).find(l => l.use === 'p250');
  await until(a, i => lvList.some(l => l.id === i), 'custodian sees the ₱250 day', 8000, P().id);
  await ev(a, i => openLvSheet('receive', i), P().id);
  await ev(a, () => lvSendHead.click());
  await waitNode(() => P().status === 'sh');
  const pend2 = () => [...backend.store.entries()].find(([k, v]) => k.startsWith(`schools/${sid}/approvals/`) && v.kind === 'leave' && v.status === 'pending' && v.refId === P().id);
  await until(h, i => apList.some(x => x.refId === i && x.status === 'pending'), 'head sees the ₱250 day', 10000, P().id);
  await ev(h, apId => headDecideAp(apId, true), pend2()[0].split('/').pop());
  await waitNode(() => P().status === 'approved', 10000);
  await ev(a, i => openLvSheet('prepare', i), P().id);
  await until(a, () => !!document.getElementById('lvHoldBtn'), 'Keep on hold button');
  await ev(a, () => lvHoldBtn.click());
  await waitNode(() => P().status === 'hold');
  check(P().status === 'hold' && P().form, 'Form 6 prepared and kept on hold');
  await until(t, () => loadNotifs().items.some(n => /approved/.test(n.title) && /on hold/.test(n.body)), 'teacher told: on hold');
  check(await ev(t, i => !document.querySelector(`#lvMine [data-lv-print="${i}"]`), P().id), 'teacher: no Print while on hold');
  check(await ev(a, i => lvCanPrint(lvById(i)), P().id), 'the AO can still print it');

  out('9 the teacher cancels; nothing else is theirs to change');
  await apply(t, { type: 'SL', from: '2026-11-30' });
  await waitNode(() => leaves(sid).length === 3);
  const S = () => leaves(sid).find(l => l.type === 'SL');
  check(await refused(t, (F, i) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves'), i), { status: 'approved' }), S().id), 'rules: the teacher can’t approve their own leave');
  await ev(t, i => lvCancel(i), S().id);
  await waitNode(() => S().status === 'cancelled');
  check(S().status === 'cancelled', 'the teacher cancelled their application');
  const bad = backend.denied.filter(d => !/leave update/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 300)})`);
  const errs = errors.filter(e => /lv|leave|Form 6/i.test(e));
  check(!errs.length, `no page errors about leave (${errs.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('leave-pilot');
  await closeAll();
}
