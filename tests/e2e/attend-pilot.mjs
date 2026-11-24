// Teacher attendance (School Planning pilot, part E), a pilot at one school (Nov 2026).
// A teacher signs in from the morning sheet (present / official business, or files a leave
// instead). The School Head sees who's in today and can mark absent, official business or a
// service-credit day for anyone. The month summary prints. Another school sees none of it,
// and the rules refuse it there.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead, refused } from './lib/school-setup.mjs';

const pilot = [];   // the test school joins the pilot after step 1
const backend = createBackend({ attendPilot: pilot, leavePilot: pilot, planPilot: pilot });
const att = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/attendance/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const turnOn = page => ev(page, () => { localStorage.setItem(ATTEND_PILOT_KEY, reqRole.schoolId); localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId); localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); featApply(); });

try {
  out('1 not a pilot school: nothing shows, the rules refuse');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: tUid } = await teacher(backend, sid);
  check(await ev(t, () => typeof attendOn === 'function' && attendOn() === false), 'attendOn() is false');
  check(await ev(t, () => document.getElementById('moreAttendItem').style.display === 'none' && document.getElementById('sideAttend').style.display === 'none'), 'no Attendance in More or the sidebar');
  check(await ev(t, () => !wnList().some(r => r.pilot === 'attend') && WHATS_NEW.some(r => r.id === '2026-11-attendance')), "What's new: the note waits for the pilot");
  await ev(t, () => switchMainView('ATTEND'));
  check(await ev(t, () => activeMainView === 'REQUESTER'), 'the Attendance page does not open');
  const iso = await ev(t, () => localISODate());
  check(await refused(t, (F, uid, d) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'attendance'), d + '_' + uid), { date: d, uid, name: 'Ana Reyes', mark: 'present', by: 'teacher', log: [] }), tUid, iso), 'the rules refuse a sign-in outside the pilot');

  out('2 the pilot is on: the morning sheet and the sign-in');
  pilot.push(sid);
  backend.denied.length = 0;
  await turnOn(a); await turnOn(t);
  await ev(a, () => { attendSync(); attendNav(); });
  await ev(t, () => { attendSync(); attendNav(); });
  check(await ev(a, () => document.getElementById('sideAttend').style.display === ''), 'custodian: Attendance in the sidebar');
  check(await ev(t, () => document.getElementById('moreAttendItem').style.display === ''), 'teacher: Attendance in More');
  check(await ev(t, () => wnList().some(r => r.pilot === 'attend')), "What's new: the pilot note shows");
  check(await ev(t, () => leaveOn()), 'leave is on too (the morning sheet offers it)');
  // The morning sheet opens on its own on a class day.
  await until(t, () => !document.getElementById('attModal').classList.contains('hidden'), 'morning sheet', 8000);
  await ev(t, () => renderAttendView());
  check(await ev(t, () => !!document.getElementById('attPresentBtn') && !!document.getElementById('attObBtn') && !!document.getElementById('attLeaveBtn')), 'Present / Official business / filing a leave');
  await ev(t, () => closeAttModal());
  check(await ev(t, () => document.getElementById('attModal').classList.contains('hidden')), 'Later closes the sheet');
  await ev(t, () => openAttendModal('morning'));
  await until(t, () => !!document.getElementById('attPresentBtn'), 'sheet again');
  await ev(t, () => document.getElementById('attPresentBtn').click());
  await waitNode(() => att(sid).length === 1);
  const E = () => att(sid)[0];
  check(E().mark === 'present' && E().uid === tUid && E().by === 'teacher' && E().date === iso && typeof E().timeMs === 'number', 'saved: present, the time recorded');
  await until(t, () => document.getElementById('attModal').classList.contains('hidden'), 'sheet closed');
  await until(t, () => attList.length === 1 && !!attMyToday(), 'the listener got it', 8000);
  // The teacher is on their Today page; the attendance card shows the sign-in.
  await until(t, () => { const c = document.querySelector('[data-t-today="attend"]'); return c && /Signed in/.test(c.textContent); }, 'teacher Today card shows signed in', 8000);
  check(await ev(t, () => { const c = document.querySelector('[data-t-today="attend"]'); return c && /Present/.test(c.textContent); }), 'the card: Present');

  out('3 the head sees who is in and marks the rest');
  // The AO sets up the school year, which carries the people list the head's board reads.
  await ev(a, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); featApply(); calSync(); });
  await ev(a, () => openCalendar());
  await until(a, () => !!document.getElementById('calLoadBtn'), 'calendar setup', 8000);
  await ev(a, () => document.getElementById('calLoadBtn').click());
  await waitNode(() => backend.store.get(`schools/${sid}/planYears/2026-2027`));
  const { page: h } = await schoolHead(backend, a, sid);
  await turnOn(h);
  await ev(h, () => { attendSync(); attendNav(); });
  await until(h, () => !!document.querySelector('[data-hd-today="attend"]'), 'head Today card', 10000);
  check(await ev(h, () => /Attendance/.test(document.querySelector('[data-hd-today="attend"]').textContent)), 'the card: Attendance');
  await ev(h, () => openAttendView('board'));   // the head's phone opens their Attendance tab
  await until(h, () => headTab === 'attend' && !!document.querySelector('#hdBody [data-hd-pane="attend"] [data-att-board]'), 'the board', 8000);
  // The head marks the custodian absent.
  const rows = await ev(h, () => [...document.querySelectorAll('[data-att-row]')].map(r => r.dataset.attRow));
  check(rows.length >= 2, `the board lists the school's people (${rows.length})`);
  const custUid = await ev(a, () => cloud.user.uid);
  await ev(h, u => openAttendModal('mark', u), custUid);
  await until(h, () => !!document.querySelector('[data-att-mark="absent"]'), 'mark sheet');
  await ev(h, () => document.querySelector('[data-att-mark="absent"]').click());
  await waitNode(() => att(sid).some(x => x.uid === custUid && x.mark === 'absent'));
  check(att(sid).find(x => x.uid === custUid).by === 'head', 'absent saved, marked by the head');
  await until(h, () => { const b = document.querySelector('#hdBody [data-hd-pane="attend"] [data-att-board]'); return b && /Absent/.test(b.textContent); }, 'the board shows Absent', 8000);

  out('4 the rules keep a teacher from writing anyone else');
  check(await refused(t, (F, uid, d) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'attendance'), d + '_' + uid), { date: d, uid, name: 'Someone Else', mark: 'absent', by: 'teacher', log: [] }), custUid, iso), 'a teacher cannot mark someone else absent');
  check(await refused(t, (F, uid, d) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'attendance'), d + '_' + uid), { date: d, uid, name: 'Ana Reyes', mark: 'absent', by: 'teacher', log: [] }), tUid, iso), 'a teacher cannot mark even themselves absent');
  check(await refused(t, (F, uid, d) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'attendance'), d + '_' + uid), { mark: 'present' }), custUid, iso), 'a teacher cannot change someone else');
  check(backend.denied.length >= 3, `the refusals were recorded (${backend.denied.length})`);

  out('5 the month summary and print');
  await ev(a, () => openAttendView());
  await until(a, () => activeMainView === 'ATTEND' && !!document.querySelector('[data-att-month]'), 'the month grid', 8000);
  check(await ev(a, () => document.querySelectorAll('[data-att-month-row]').length >= 2), 'the grid lists everyone');
  await ev(a, () => document.getElementById('attPrintBtn').click());
  await until(a, () => (window.__printed || 0) >= 1, 'printed');
  const pr = await ev(a, () => document.getElementById('printAttendSection').textContent);
  check(/Teacher attendance/.test(pr) && /CS Form 48/.test(pr), 'the print header and the CS Form 48 note');

  out('6 turn the pilot off again');
  await ev(t, () => { localStorage.removeItem(ATTEND_PILOT_KEY); featApply(); });
  check(await ev(t, () => attendOn() === false && document.getElementById('moreAttendItem').style.display === 'none'), 'off: no Attendance, attendOn() false');
  check(await ev(t, () => activeMainView !== 'ATTEND'), 'off: not on the Attendance page');

  const bad = backend.denied.filter(d => !/attendance/.test(d));
  check(!bad.length, `no refused writes besides the test's own (${bad.join(' | ').slice(0, 300)})`);
  const errs = errors.filter(e => /attend/i.test(e));
  check(!errs.length, `no page errors about attendance (${errs.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('attend-pilot');
  await closeAll();
}
