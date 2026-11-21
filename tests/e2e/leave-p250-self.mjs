// Leave pilot, part C (Nov 2026): the ₱250 log (whole-day absences paid at the office, turned
// over to the Faculty President, with a printed list), and applying for one's own leave: the AO
// on the custodian's account ("Apply for my leave", goes to the School Head like everyone's) and
// the School Head (a Leave tab; approved by the Division, so the AO prepares Form 6 without the
// Approve tab and it goes straight to the Division once handed in).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead, refused } from './lib/school-setup.mjs';

const backend = createBackend({ leavePilot: 'any' });
const leaves = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/leaves/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const approvals = sid => [...backend.store.entries()].filter(([k, v]) => k.startsWith(`schools/${sid}/approvals/`) && v.kind === 'leave').map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const notifs = (page, re) => ev(page, src => loadNotifs().items.some(n => new RegExp(src).test(n.title)), re.source);
const turnOn = page => ev(page, () => { localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId); });

// Fill in the open Apply sheet and save it
async function fill(p, { type = 'VL', from, to, use, days, reason = '' }) {
  await until(p, () => !!document.getElementById('lvApplySave'), 'apply sheet');
  await ev(p, (ty, f, to2, u, d, r) => {
    lvType.value = ty; lvApplyDetail();
    lvFrom.value = f; lvTo.value = to2; lvApplyDates();
    if (d) lvDays.value = d;
    if (u) { document.querySelector(`input[name="lvUse"][value="${u}"]`).checked = true; lvApplyUse(); }
    lvReason.value = r;
  }, type, from, to || from, use || '', days || '', reason);
  await ev(p, () => document.getElementById('lvApplySave').click());
}
async function teacherApply(t, o) {
  await ev(t, () => setTeacherTab('leave'));
  await ev(t, () => document.getElementById('lvApplyBtn').click());
  await fill(t, o);
}

try {
  out('1 a school in the pilot: the AO, a teacher and the School Head');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: tUid } = await teacher(backend, sid);
  await turnOn(a); await turnOn(t);
  await ev(a, () => { leaveSync(); lvNav(); });
  const { page: h, uid: hUid } = await schoolHead(backend, a, sid);
  await turnOn(h);
  await ev(h, () => renderHeadView());
  const aUid = await ev(a, () => cloud.user.uid);
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-leave-p250-self' && r.pilot === 'leave') && wnList().some(r => r.id === '2026-11-leave-p250-self')), 'What’s new: the ₱250 log and applying for one’s own leave (pilot)');

  out('2 ₱250 days: the AO’s log by month and person');
  await teacherApply(t, { type: 'SPL', from: '2026-12-01', use: 'p250', days: '1' });
  await waitNode(() => leaves(sid).length === 1);
  await teacherApply(t, { type: 'SPL', from: '2026-12-07', use: 'p250', days: '1' });
  await waitNode(() => leaves(sid).length === 2);
  await ev(a, () => openLeaveView());
  await until(a, () => lvList.filter(l => l.use === 'p250').length === 2, 'the AO sees both ₱250 days', 8000);
  await ev(a, () => setLvPage('p250'));
  check(await ev(a, () => document.querySelectorAll('[data-lv-page]').length === 3 && !!document.querySelector('[data-lv-page="p250"][aria-pressed="true"]') && !document.getElementById('lvEncodeBtn')), 'Leave page: a third tab, ₱250');
  check(await ev(a, () => !!document.querySelector('[data-p250-empty]')), 'this month: no ₱250 days yet');
  await ev(a, () => setP250Month('2026-12'));
  check(await ev(a, () => document.querySelectorAll('[data-p250-person]').length === 1 && /Ana Reyes/.test(document.querySelector('[data-p250-person]').textContent)
    && document.querySelector('[data-p250-count]').textContent.trim() === '2 of 2 this month'), 'December: Ana Reyes, 2 of 2 this month');
  check(await ev(a, () => document.querySelectorAll('[data-p250-state="unpaid"]').length === 2 && !document.getElementById('p250TurnBtn')), 'both not paid yet, nothing to turn over');

  out('3 paid at the office');
  const [p1, p2] = leaves(sid).sort((x, y) => x.from.localeCompare(y.from)).map(l => l.id);
  await ev(a, i => document.querySelector(`[data-p250-pay="${i}"]`).click(), p1);
  await until(a, () => !!document.getElementById('p250PaySave'), 'paid sheet');
  check(await ev(a, () => p250Amt.value === '250'), 'the amount starts at ₱250 a day');
  const today = await ev(a, () => localISODate());
  await ev(a, () => { p250PaySave.click(); });
  await waitNode(() => leaves(sid).find(l => l.id === p1).p250);
  const P = i => leaves(sid).find(l => l.id === i);
  check(P(p1).p250.amount === 250 && P(p1).p250.paidISO === today && /₱250 paid/.test(P(p1).log.slice(-1)[0].x), 'saved: ₱250 paid today, in the history');
  await ev(a, i => openLvSheet('p250pay', i), p2);
  await until(a, () => !!document.getElementById('p250PaySave'), 'paid sheet');
  await ev(a, () => { p250Date.value = '2099-01-01'; p250PaySave.click(); });
  check(await ev(a, () => /future/.test(document.getElementById('lvErr').textContent)), 'a date paid in the future is refused');
  await ev(a, () => { p250Date.value = '2026-11-02'; p250PaySave.click(); });
  await waitNode(() => P(p2).p250 && P(p2).p250.paidISO === '2026-11-02');
  await until(a, () => document.querySelectorAll('[data-p250-state="paid"]').length === 2, 'both paid');
  check(await ev(a, () => /₱500/.test(document.querySelector('[data-p250-sum]').textContent) && /Turn over ₱500/.test(document.getElementById('p250TurnBtn').textContent)), 'Paid ₱500 · Turn over ₱500 to the Faculty President');

  out('4 turned over to the Faculty President, and the printed list');
  await ev(a, () => p250TurnBtn.click());
  await until(a, () => !!document.getElementById('p250TurnSave'), 'turnover sheet');
  check(await ev(a, () => document.querySelectorAll('[data-p250-turn-list] li').length === 2), 'the sheet lists the two payments');
  await ev(a, () => { p250FPName.value = ''; p250TurnSave.click(); });
  check(await ev(a, () => /Faculty President/.test(document.getElementById('lvErr').textContent)), 'the Faculty President’s name is needed');
  await ev(a, () => { p250FPName.value = 'Maria L. Santos'; p250TurnDate.value = '2026-11-10'; p250TurnSave.click(); });
  await waitNode(() => P(p1).p250.turnISO && P(p2).p250.turnISO);
  check(P(p1).p250.turnTo === 'Maria L. Santos' && P(p2).p250.turnISO === '2026-11-10' && P(p1).p250.amount === 250, 'both turned over to Maria L. Santos on November 10');
  await until(a, () => document.querySelectorAll('[data-p250-state="turned"]').length === 2, 'rows show turned over');
  check(await ev(a, () => !document.getElementById('p250TurnBtn') && !document.querySelector('[data-p250-pay]')), 'nothing left to turn over; turned-over payments can’t be changed');
  check(await ev(a, () => localStorage.getItem(P250_FP_KEY) === 'Maria L. Santos'), 'the Faculty President’s name is remembered');
  await ev(a, () => p250PrintBtn.click());
  await until(a, () => (window.__printed || 0) === 1, 'printed');
  const list = await ev(a, () => document.getElementById('printPrSection').textContent);
  check(/TURNOVER LIST/.test(list) && /December 2026/.test(list) && /Ana Reyes/.test(list) && /₱500/.test(list), 'print: the turnover list for December, Ana Reyes, ₱500');
  check(/MARIA L\. SANTOS/.test(list) && /Faculty President/.test(list) && /Turned over by/.test(list) && /Administrative Officer/.test(list), 'print: signed by the AO and the Faculty President');
  await ev(a, i => openLvSheet('view', i), p1);
  check(await ev(a, () => /turned over to the Faculty President/.test(document.getElementById('lvModalBody').textContent)), 'the application shows the payment and the turnover');
  await ev(a, () => closeLvModal());

  out('5 the AO applies for their own leave');
  await ev(a, () => setLvPage('apps'));
  await ev(a, () => document.getElementById('lvSelfBtn').click());
  await until(a, () => !!document.getElementById('lvApplySave'), 'apply sheet');
  check(await ev(a, () => /Apply for my leave/.test(document.querySelector('[data-lv-sheet-title]').textContent) && !document.getElementById('lvWho')
    && !document.querySelector('input[name="lvUse"][value="p250"]') && document.querySelector('input[name="lvUse"]:checked').value === 'vlsl' && !!lvName.value), 'Apply for my leave: own name, VL/SL picked, no ₱250, no roster');
  await ev(a, () => { lvPos.value = 'Administrative Officer II'; });
  await fill(a, { type: 'VL', from: '2026-12-14', to: '2026-12-15', reason: 'Family matter' });
  await waitNode(() => leaves(sid).some(l => l.by === 'self'));
  const S = () => leaves(sid).find(l => l.by === 'self');
  check(S().uid === aUid && S().status === 'applied' && S().position === 'Administrative Officer II' && S().use === 'vlsl' && S().days === 2, 'saved: the AO’s own, applied, VL/SL, 2 days');
  check(await ev(a, () => localStorage.getItem(LV_MYPOS_KEY) === 'Administrative Officer II'), 'the AO’s position is remembered');
  await until(a, i => !!document.querySelector(`[data-lv-stage="applied"] [data-lv="${i}"]`), 'listed under New applications', 8000, S().id);
  check(await ev(a, i => /the AO/.test(document.querySelector(`[data-lv="${i}"]`).textContent), S().id), 'the card says it is the AO’s');
  await ev(a, i => openLvSheet('receive', i), S().id);
  await until(a, () => !!document.getElementById('lvSendHead'), 'receive sheet');
  check(await ev(a, () => /Send to the School Head/.test(lvSendHead.textContent)), 'it goes to the School Head like everyone’s');
  await ev(a, () => lvSendHead.click());
  await waitNode(() => S().status === 'sh');
  const apS = () => approvals(sid).find(x => x.refId === S().id);
  check(!!apS() && apS().status === 'pending', 'an approval waits for the School Head');
  await until(h, i => apList.some(x => x.refId === i && x.status === 'pending'), 'head sees the AO’s leave', 10000, S().id);
  await ev(h, i => headDecideAp(i, true), apS().id);
  await waitNode(() => S().status === 'approved', 10000);
  await ev(a, i => openLvSheet('prepare', i), S().id);
  await until(a, () => !!document.getElementById('lvSendTeacher'), 'prepare sheet');
  check(await ev(a, () => !document.getElementById('lvRecName') && /GUADALUPE/i.test(lvShName.value)), 'Form 6: the School Head signs 7.B and 7.C');
  await ev(a, () => lvSendTeacher.click());
  await waitNode(() => S().status === 'review');
  check(/you \(the AO\)/.test(S().log.slice(-1)[0].x), 'history: Form 6 prepared for the AO');
  check(await ev(a, i => lvCanPrint(lvById(i)), S().id), 'the AO prints their own Form 6');

  out('6 the School Head: My leave (under More; in the sidebar on a computer)');
  check(await ev(h, () => document.getElementById('hdTab-leave').style.display !== 'none' && !!document.querySelector('[data-hd-more-row="leave"]') && !!document.querySelector('[data-hd-today="leave"]')), 'My leave: under More, a card on Today');
  await ev(h, () => setHeadTab('leave'));
  check(await ev(h, () => document.getElementById('hdTitle').textContent === 'My leave' && !!document.querySelector('[data-hd-pane="leave"]:not(.hidden) #lvApplyBtn')), 'My leave: Apply for leave');
  check(await ev(h, () => /Division/.test(document.querySelector('[data-hd-pane="leave"]').textContent)), 'it says the Division approves it');
  await ev(h, () => document.querySelector('[data-hd-pane="leave"] #lvApplyBtn').click());
  await until(h, () => !!document.getElementById('lvApplySave'), 'apply sheet');
  check(await ev(h, () => !document.querySelector('input[name="lvUse"][value="p250"]') && /GUADALUPE/i.test(lvName.value) && lvPos.value === 'School Principal I'), 'the head’s name and designation, no ₱250');
  await fill(h, { type: 'VL', from: '2026-12-21', to: '2026-12-22', reason: 'Seminar travel' });
  await waitNode(() => leaves(sid).some(l => l.by === 'head'));
  const H = () => leaves(sid).find(l => l.by === 'head');
  check(H().uid === hUid && H().status === 'applied' && /Guadalupe/.test(H().name), 'saved: the School Head’s own, applied');
  await until(h, () => !!document.querySelector('[data-hd-pane="leave"] [data-lv-status="applied"]'), 'listed on the head’s Leave tab', 8000);
  check(await ev(h, () => !!document.querySelector('[data-hd-pane="leave"] [data-lv-steps="0"]') && /AO/.test(document.querySelector('[data-hd-pane="leave"] [data-lv-steps]').textContent)), 'steps: Applied, AO, Form 6, Signed, Division');
  await until(a, () => loadNotifs().items.some(n => /Leave application from the School Head/.test(n.title)), 'AO notified', 8000);
  check(await notifs(a, /Leave application from the School Head, John/), 'AO: “Leave application from the School Head, John…”');

  out('7 the AO receives it and prepares Form 6 for the Division');
  const nAp = approvals(sid).length;
  await ev(a, i => openLvSheet('receive', i), H().id);
  await until(a, () => !!document.getElementById('lvSendHead'), 'receive sheet');
  check(await ev(a, () => !!document.querySelector('[data-lv-head-own]') && /Received · prepare Form 6/.test(lvSendHead.textContent)), 'receive: approved by the Division, not the Approve tab');
  await ev(a, () => lvSendHead.click());
  await waitNode(() => H().status === 'approved');
  check(H().approval && H().approval.division === true && approvals(sid).length === nAp, 'approved status for Form 6, no approval sent to the head');
  await until(h, () => loadNotifs().items.some(n => /was received/.test(n.title)), 'head told: received', 8000);
  check(await notifs(h, /Your leave application was received/), 'head: “Your leave application was received”');
  await ev(a, i => openLvSheet('prepare', i), H().id);
  await until(a, () => !!document.getElementById('lvRecName'), 'prepare sheet with the Division’s officials');
  check(await ev(a, () => lvRecDesig.value === 'Public Schools District Supervisor' && lvShDesig.value === 'Schools Division Superintendent'), 'Form 6: the PSDS recommends, the SDS approves');
  await ev(a, () => { lvRecName.value = 'Pedro C. Cruz'; lvShName.value = 'Elena R. Lim'; lvSendTeacher.click(); });
  await waitNode(() => H().status === 'review');
  check(H().form.recName === 'Pedro C. Cruz' && H().form.shName === 'Elena R. Lim', 'saved: the Division’s officials');
  await until(h, () => loadNotifs().items.some(n => /Form 6 is ready/.test(n.title)), 'head told: Form 6 ready', 8000);
  await ev(h, () => setHeadTab('leave'));
  await until(h, i => !!document.querySelector(`[data-hd-pane="leave"] [data-lv-print="${i}"]`), 'head: Print Form 6', 8000, H().id);
  await ev(h, i => document.querySelector(`[data-hd-pane="leave"] [data-lv-print="${i}"]`).click(), H().id);
  await until(h, () => (window.__printed || 0) === 1, 'head printed');
  const f6 = await ev(h, () => document.getElementById('printPrSection').textContent);
  check(/APPLICATION FOR LEAVE/.test(f6) && /PEDRO C\. CRUZ/.test(f6) && /ELENA R\. LIM/.test(f6) && /Schools Division Superintendent/.test(f6), 'head prints Form 6 with the PSDS (7.B) and the SDS (7.C)');
  await ev(a, i => openLvSheet('view', i), H().id);
  check(await ev(a, () => /The School Head’s own leave/.test(document.getElementById('lvModalBody').textContent)), 'AO: marked as the School Head’s own leave');
  await ev(a, () => document.querySelector('[data-lv-act="handed"]').click());
  await waitNode(() => H().status === 'signed');
  check(H().status === 'signed', 'handed in: straight to the Division (no School Head signature step)');
  await until(a, () => !!document.querySelector('[data-lv-act="do"]'), 'Received by the Division button');
  await ev(a, () => document.querySelector('[data-lv-act="do"]').click());
  await until(a, () => !!document.getElementById('lvDoSave'), 'DO sheet');
  await ev(a, () => { lvDoDate.value = '2026-11-10'; lvDoRef.value = 'DTS-2026-2001'; lvDoSave.click(); });
  await waitNode(() => H().status === 'done');
  await until(h, () => loadNotifs().items.some(n => /received by the Division/.test(n.title)), 'head told: done', 8000);
  check(await notifs(h, /Form 6 received by the Division/), 'head: “Form 6 received by the Division”');

  out('8 the School Head cancels; the rules');
  await ev(h, () => document.querySelector('[data-hd-pane="leave"] #lvApplyBtn').click());
  await fill(h, { type: 'SL', from: '2026-12-28' });
  await waitNode(() => leaves(sid).filter(l => l.by === 'head').length === 2);
  const C = () => leaves(sid).find(l => l.by === 'head' && l.type === 'SL');
  await ev(h, i => lvCancel(i), C().id);
  await waitNode(() => C().status === 'cancelled');
  check(C().status === 'cancelled', 'the School Head cancelled their application');
  check(await refused(h, (F, u) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves')), { uid: u, name: 'Ana Reyes', type: 'VL', status: 'applied', by: 'head', log: [] }), tUid), 'rules: the head can’t apply for someone else');
  check(await refused(h, (F, i) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves'), i), { status: 'approved' }), H().id), 'rules: the head can’t change their leave after applying');
  check(await refused(t, (F, u) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves')), { uid: u, name: 'Ana Reyes', type: 'VL', status: 'applied', by: 'head', log: [] }), tUid), 'rules: a teacher can’t file as the head');
  check(await refused(t, (F, i) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves'), i), { p250: { amount: 250, paidISO: '2026-12-01' } }), p1), 'rules: the teacher can’t log their own ₱250');
  const bad = backend.denied.filter(d => !/leave (update|create)/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 300)})`);
  const errs = errors.filter(e => /lv|leave|Form 6|p250|head/i.test(e));
  check(!errs.length, `no page errors about leave (${errs.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('leave-p250-self');
  await closeAll();
}
