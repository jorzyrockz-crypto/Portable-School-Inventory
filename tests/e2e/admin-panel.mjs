// The Admin panel (Nov 2026). Testing ES is the admin school: its custodian moves each new feature
// through Off · Testing · Pro · Everyone, sees every school with its users, makes schools Pro (with
// an optional end date) and handles the 7-day Pro trial. Another school sees More → Pro, starts
// the trial once (reminders before it ends), and keeps what it saved, view only, when it ends.
// The rules (firestore.rules featureOn / isPro) refuse the rest. The Admin panel is a page: Admin in
// the sidebar on a computer (Schools · Features · Activity), More → Admin panel on a phone.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, refused } from './lib/school-setup.mjs';

const backend = createBackend({ leavePilot: [], planPilot: [] });
const doc = p => backend.store.get(p) || {};
const notif = (page, re) => ev(page, src => loadNotifs().items.some(n => new RegExp(src).test(n.title)), re.source);
const shown = (page, id) => ev(page, i => { const el = document.getElementById(i); return !!el && el.style.display !== 'none'; }, id);
const DAY = 86400000;

try {
  out('1 the admin school and a Free school');
  const { page: a, sid: sA } = await custodian(backend, { name: 'admin' });
  const { page: b, sid: sB } = await custodian(backend, { name: 'free', email: 'jo@deped.gov.ph', school: 'Lahug Elementary School' });
  const { page: t, uid: tUid } = await teacher(backend, sB);
  backend.setAdminSchool(sA);
  await ev(a, s => { ADMIN_SCHOOL = s; featApply(); }, sA);
  for (const p of [b, t]) await ev(p, s => { ADMIN_SCHOOL = s; featApply(); }, sA);
  check(await shown(a, 'moreAdminItem') && !(await shown(a, 'moreProItem')), 'admin: More → Admin panel, no Pro page');
  check(!(await shown(b, 'moreAdminItem')) && await shown(b, 'moreProItem') && await ev(b, () => moreProTag.textContent === 'Free'), 'Free school: More → Pro (Free), no Admin panel');
  check(await ev(a, () => leaveOn() && planOn() && featStage('leave') === 'testing'), 'admin school: features at Testing are on');
  check(await ev(b, () => !leaveOn() && !planOn()), 'Free school: they are not');
  check(await ev(t, () => document.getElementById('rqTab-leave').classList.contains('hidden')), 'teacher: no Leave tab');
  check(await waitNode(() => (doc(`schools/${sB}`).counts || {}).teachers === 1), 'the school counts its users (1 teacher)');
  check(doc(`schools/${sB}`).counts.total === 2, 'users: the custodian and the teacher');

  out('2 a switch: Leave to Pro');
  check(await shown(a, 'sideAdminSchools') && await shown(a, 'sideAdminFeatures') && await shown(a, 'sideAdminActivity') && await shown(a, 'sideAdminLabel'), 'admin, computer: Admin in the sidebar (Schools · Features · Activity)');
  check(!(await shown(b, 'sideAdminSchools')) && !(await shown(b, 'sideAdminLabel')), 'another school: no Admin in the sidebar');
  await ev(b, () => switchMainView('ADMIN'));
  check(await ev(b, () => activeMainView === 'HOME' && document.getElementById('viewAdmin').classList.contains('hidden')), 'another school: the Admin page sends it back Home');
  await ev(a, () => document.getElementById('sideAdminSchools').click());
  check(await ev(a, () => activeMainView === 'ADMIN' && adminView.tab === 'schools' && !document.getElementById('viewAdmin').classList.contains('hidden')), 'Schools opens the Admin page (Schools first)');
  check(await ev(a, () => sideAdminSchools.getAttribute('aria-current') === 'page' && sideAdminFeatures.getAttribute('aria-current') !== 'page'), 'sidebar: Schools lit');
  check(!(await ev(a, () => !!document.getElementById('adminModal'))), 'no Admin pop-up any more');
  await ev(a, () => document.getElementById('sideAdminFeatures').click());
  check(await ev(a, () => adminView.tab === 'features' && sideAdminFeatures.getAttribute('aria-current') === 'page' && sideAdminSchools.getAttribute('aria-current') !== 'page'), 'Features: its sidebar item lit');
  check(await ev(a, () => !!document.querySelector('[data-feat="leave"][data-feat-now="testing"]') && !!document.querySelector('[data-feat="plan"]')), 'Features: Leave and School calendar at Testing');
  await ev(a, () => document.querySelector('[data-feat-stage="leave:pro"]').click());
  check(await waitNode(() => (doc('appConfig/features').leave || {}).stage === 'pro'), 'saved: appConfig/features leave = pro');
  check(doc('appConfig/features').log.length === 1 && doc('appConfig/features').log[0].to === 'pro', 'history: one entry');
  await until(b, () => featStage('leave') === 'pro', 'Free school follows the switch');
  check(await ev(b, () => !leaveOn()), 'Free school: still no Leave (not Pro)');
  check(await ev(a, () => leaveOn() && !!document.querySelector('[data-feat="leave"][data-feat-now="pro"]')), 'admin school: Leave stays on');
  check(await refused(b, F => F.setDoc(F.doc(cloud.db, 'appConfig', 'features'), { leave: { stage: 'all' } })), 'rules: another school can’t change a switch');
  check(await refused(b, (F, s) => F.updateDoc(F.doc(cloud.db, 'schools', s), { pro: { untilISO: '', untilMs: 0, by: 'me', ms: Date.now() } }), sB), 'rules: a school can’t make itself Pro');
  check(await refused(b, (F, s) => F.updateDoc(F.doc(cloud.db, 'schools', s), { trial: { startMs: Date.now(), untilMs: Date.now() + 30 * 86400000, by: 'me' } }), sB), 'rules: a 30-day trial is refused');

  out('3 More → Pro and the 7-day trial');
  await ev(b, () => openProSheet());
  check(await ev(b, () => !!document.querySelector('[data-pro-status="free"]') && !!document.querySelector('[data-pro-feat="leave"][data-pro-stage="pro"]') && !!document.getElementById('proTrialBtn')), 'Pro page: Free, lists Leave, Try Pro free for 7 days');
  await ev(b, () => document.getElementById('proTrialBtn').click());
  check(await waitNode(() => !!doc(`schools/${sB}`).trial), 'trial saved on the school');
  const tr = doc(`schools/${sB}`).trial;
  check(tr.untilMs - tr.startMs === 7 * DAY, 'exactly 7 days');
  await until(b, () => leaveOn() && schoolPro().trial, 'Leave on during the trial');
  check(await ev(b, () => !!document.querySelector('[data-pro-status="trial"]') && !document.getElementById('proTrialBtn')), 'Pro page: the trial, no second button');
  check(await ev(b, () => { const s = document.querySelector('#proStrip [data-pro-strip]'); return !!s && s.dataset.proStrip === '7' && /7 days left/.test(s.textContent); }), 'Home: “Pro trial · 7 days left”');
  check(await ev(b, () => /Trial · 7 days left/.test(moreProTag.textContent)) && await shown(b, 'moreLeaveItem'), 'More: Pro · Trial, and Leave');
  await until(t, () => leaveOn(), 'the teacher gets Leave too');
  await ev(t, () => setTeacherTab('leave'));
  check(await ev(t, () => !document.getElementById('rqTab-leave').classList.contains('hidden') && !!document.getElementById('lvApplyBtn')), 'teacher: Leave tab with Apply');
  check(await refused(b, (F, s) => F.updateDoc(F.doc(cloud.db, 'schools', s), { trial: { startMs: Date.now(), untilMs: Date.now() + 7 * 86400000, by: 'again' } }), sB), 'rules: a second trial is refused');
  await ev(b, () => { closeProSheet(); openLeaveView(); });
  check(await ev(b, () => { const x = document.querySelector('[data-feat-badge="leave"]'); return !!x && /Pro trial/.test(x.textContent) && !!document.getElementById('lvEncodeBtn'); }), 'Leave page: “Pro trial” badge, Encode works');

  out('4 reminders: 2 days before, the last day');
  await ev(b, () => { proSet({ ...lastSchoolDoc, trial: { ...lastSchoolDoc.trial, untilMs: Date.now() + 1.5 * 86400000 } }); notifProTrial(Date.now()); });
  check(await notif(b, /Your Pro trial ends in 2 days/), 'notified: “Your Pro trial ends in 2 days”');
  const strip1 = await ev(b, () => { proSet({ ...lastSchoolDoc, trial: { ...lastSchoolDoc.trial, untilMs: Date.now() + 0.4 * 86400000 } }); notifProTrial(Date.now()); return document.querySelector('#proStrip [data-pro-strip]').dataset.proStrip; });
  check(await notif(b, /Last day of your Pro trial/), 'notified: “Last day of your Pro trial”');
  const n1 = await ev(b, () => loadNotifs().items.filter(n => /Pro trial/.test(n.title)).length);
  await ev(b, () => notifProTrial(Date.now()));
  check(await ev(b, () => loadNotifs().items.filter(n => /Pro trial/.test(n.title)).length) === n1, 'each reminder once');
  check(strip1 === '1', 'Home strip: 1 day left');
  await ev(b, () => proSet(lastSchoolDoc));   // back to the real trial

  out('5 the admin’s schools list');
  await ev(a, () => setAdminTab('schools'));
  await ev(a, () => adminLoadSchools());   // loaded when the page opened (step 2), before the trial
  await until(a, () => !!document.querySelector(`[data-admin-school]`) && !adminView.loading, 'schools loaded');
  check(await ev(a, () => document.querySelector('[data-admin-stats]').dataset.adminStats === '2' && /^\s*1\s*Trial/i.test(document.querySelector('[data-admin-tile="trial"]').textContent)), 'KPI boxes: 2 schools, 1 on trial');
  check(await ev(a, () => !!document.getElementById('adminSide') && !!document.querySelector('[data-admin-side-empty]')), 'computer: a side panel (“Pick a school”)');
  check(await ev(a, (s, x) => !!document.querySelector(`[data-admin-school="${s}"][data-admin-kind="admin"]`) && !!document.querySelector(`[data-admin-school="${x}"][data-admin-kind="trial"]`), sA, sB), 'list: the admin school, and Lahug ES on Trial');
  check(await ev(a, x => document.querySelector(`[data-admin-school="${x}"] [data-admin-users]`).dataset.adminUsers === '2' && /Trial · ends/.test(document.querySelector(`[data-admin-school="${x}"] [data-admin-tag]`).textContent), sB), 'Lahug ES: 2 users, “Trial · ends …”');
  const no = doc(`schools/${sB}`).schoolNo;
  await ev(a, n => { adminSearch.focus(); setAdminQuery(n); }, no);
  check(await ev(a, x => document.querySelectorAll('#adminList [data-admin-school]').length === 1 && !!document.querySelector(`#adminList [data-admin-school="${x}"]`), sB), 'search by School ID finds it');

  out('5b ending soon, the reminder, sorting and CSV');
  await ev(a, () => { adminSearch.blur(); setAdminQuery(''); });
  await ev(a, x => { const s = adminView.list.find(s => s.id === x); s.trial = { ...s.trial, untilMs: Date.now() + 1.5 * 86400000 }; setAdminFilter('soon'); }, sB);
  check(await ev(a, x => document.querySelectorAll('#adminList [data-admin-school]').length === 1 && !!document.querySelector(`#adminList [data-admin-school="${x}"][data-admin-soon]`), sB), 'Ending soon: Lahug ES (trial ends in 2 days)');
  await ev(a, () => proNav());
  check(await ev(a, () => sideAdminCount.textContent === '1' && !sideAdminCount.classList.contains('hidden')), 'sidebar: Schools · 1 ending soon');
  check(await ev(a, () => homeAttention().some(x => x.key === 'admin-soon')), 'admin’s Home: “… the Pro trial ends soon”');
  await ev(a, () => { localStorage.setItem(ADMIN_CHECK_KEY, String(Date.now())); return adminCheckSoon(Date.now()); });
  check(await notif(a, /Pro trial ends/), 'notified: “Lahug Elementary School: Pro trial ends …”');
  const nA = await ev(a, () => loadNotifs().items.filter(n => n.go === 'admin').length);
  await ev(a, () => adminCheckSoon(Date.now()));
  check(await ev(a, () => loadNotifs().items.filter(n => n.go === 'admin').length) === nA, 'the reminder once');
  await ev(a, (x, tr) => { adminView.list.find(s => s.id === x).trial = tr; proNav(); setAdminFilter('all'); }, sB, doc(`schools/${sB}`).trial);
  await ev(a, () => setAdminSort('users'));
  check(await ev(a, x => document.querySelector('#adminList [data-admin-school]').dataset.adminSchool === x, sB), 'Most users: Lahug ES (2) first');
  const csv = await ev(a, () => { let got = ''; const o = window.downloadText; window.downloadText = t => { got = t; }; adminExportCSV(); window.downloadText = o; return got; });
  check(/^\ufeff?"School","School ID","Custodian","Users"/.test(csv) && /Lahug Elementary School/.test(csv) && csv.trim().split('\r\n').length === 3, 'CSV: a header and 2 schools');
  await ev(a, () => setAdminSort('name'));

  out('6 the trial ends: view only');
  await ev(a, x => adminWriteSchool(x, { trial: { ...adminView.list.find(s => s.id === x).trial, untilMs: Date.now() - 60000 } }, 'test: ended'), sB);
  await until(b, () => featEnded('leave'), 'Free school: Leave view only');
  check(await ev(b, () => leaveOn() && !lvCanManage()), 'Leave still opens, nothing to change');
  await ev(b, () => renderLeaveView());
  check(await ev(b, () => !!document.querySelector('[data-feat-ended="leave"]') && !document.getElementById('lvEncodeBtn') && /View only/.test(document.querySelector('[data-feat-badge="leave"]').textContent)), 'Leave page: View only note, no Encode');
  check(await ev(b, () => document.querySelector('#proStrip [data-pro-strip]').dataset.proStrip === 'ended'), 'Home: “Pro trial ended · view only”');
  await ev(b, () => notifProTrial(Date.now()));
  check(await notif(b, /Your Pro trial ended/), 'notified: “Your Pro trial ended”');
  await until(t, () => featEnded('leave'), 'the teacher: view only too');
  await ev(t, () => setTeacherTab('leave'));
  check(await ev(t, () => !!document.querySelector('[data-feat-ended="leave"]') && !document.getElementById('lvApplyBtn')), 'teacher: View only, no Apply');
  check(await refused(t, (F, uid) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves')), { uid, name: 'Ana Reyes', type: 'VL', status: 'applied', by: 'teacher', log: [] }), tUid), 'rules: a new leave is refused');
  await ev(b, () => openProSheet());
  check(await ev(b, () => !!document.querySelector('[data-pro-status="ended"]') && !document.getElementById('proTrialBtn') && !!document.querySelector('[data-pro-used]')), 'Pro page: ended, the trial was used');

  out('7 the admin extends the trial, then allows a new one');
  await ev(a, x => { setAdminQuery(''); adminOpenRow(x); }, sB);
  check(await ev(a, x => !!document.querySelector(`#adminSide [data-admin-side="${x}"]`) && !!document.querySelector('#adminSide #adminExtendBtn') && !document.querySelector('#adminList [data-admin-actions]'), sB), 'computer: the school opens in the side panel');
  await ev(a, () => document.getElementById('adminExtendBtn').click());
  check(await waitNode(() => doc(`schools/${sB}`).trial.untilMs > Date.now() + 6.9 * DAY), 'extended: 7 more days');
  await until(b, () => !featEnded('leave') && leaveOn() && schoolPro().trial, 'Free school: back on');
  await ev(a, () => document.getElementById('adminNewTrialBtn').click());
  check(await waitNode(() => doc(`schools/${sB}`).trial === null), 'the trial cleared');
  await until(b, () => !leaveOn(), 'Free school: no Leave');
  check(await ev(b, () => !!document.getElementById('proTrialBtn')), 'Pro page: Try Pro free again');

  out('8 Make Pro with an end date, then Remove Pro');
  await ev(a, x => { if (adminView.open !== x) adminOpenRow(x); }, sB);
  await ev(a, () => document.querySelector('[data-admin-preset="3"]').click());
  check(await ev(a, () => { const d = new Date(); d.setMonth(d.getMonth() + 3); return adminProUntil.value === localISODate(d); }), 'preset: 3 months fills the date');
  await ev(a, () => { adminProUntil.value = '2027-06-30'; document.getElementById('adminProBtn').click(); });
  check(await waitNode(() => (doc(`schools/${sB}`).pro || {}).untilISO === '2027-06-30'), 'saved: Pro until Jun 30, 2027');
  await until(b, () => schoolPro().pro && leaveOn(), 'Free school is Pro');
  check(await ev(b, () => moreProTag.textContent === 'Pro' && !!document.querySelector('[data-pro-status="pro"]')), 'More → Pro: Pro, until Jun 30, 2027');
  check(await ev(a, x => /Pro · until/.test(document.querySelector(`[data-admin-school="${x}"] [data-admin-tag]`).textContent), sB), 'admin list: “Pro · until …”');
  await ev(a, () => document.getElementById('adminUnproBtn').click());
  check(await waitNode(() => doc(`schools/${sB}`).pro === null), 'Pro removed');
  await until(b, () => !leaveOn(), 'Leave off again');

  out('9 Everyone, then Off');
  await ev(a, () => setAdminTab('features'));
  await ev(a, () => document.querySelector('[data-feat-stage="plan:all"]').click());
  check(await waitNode(() => (doc('appConfig/features').plan || {}).stage === 'all'), 'saved: plan = all');
  await until(b, () => planOn(), 'Free school: School calendar on');
  await until(t, () => planOn() && !document.getElementById('rqTab-calendar').classList.contains('hidden'), 'teacher: Calendar tab');
  check(true, 'Everyone: every school gets the School calendar');
  await ev(a, () => document.querySelector('[data-feat-stage="plan:off"]').click());
  check(await waitNode(() => (doc('appConfig/features').plan || {}).stage === 'off'), 'saved: plan = off');
  await until(a, () => !planOn(), 'admin school: off too');
  await until(b, () => !planOn(), 'Free school: off');
  const log = doc('appConfig/features').log;
  check(log.filter(x => x.f !== 'school').length === 3, 'history: 3 switches');
  check(log.filter(x => x.f === 'school').length === 4 && log.some(x => x.f === 'school' && /Made Pro/.test(x.act)), 'history: 4 school actions (extend, new trial, Pro, remove)');
  await ev(a, () => document.getElementById('sideAdminActivity').click());
  check(await ev(a, () => adminView.tab === 'activity' && document.querySelector('[data-admin-activity]').dataset.adminActivity === '7'), 'Activity: 7 entries');
  await ev(a, () => setAdminLogFilter('school'));
  check(await ev(a, () => document.querySelectorAll('[data-admin-log="school"]').length === 4 && !document.querySelector('[data-admin-log="switch"]')), 'Activity · Pro & trials: 4');

  out('10 on a phone: More → Admin panel, the school opens in its card');
  await a.setViewport({ width: 390, height: 844 });
  await sleep(300);
  check(!(await ev(a, () => sidebarLayout())), 'phone layout');
  await ev(a, () => { switchMainView('HOME'); openMoreMenu(); });
  check(await shown(a, 'moreAdminItem'), 'More: Admin panel');
  await ev(a, () => moreAdminItem.click());
  check(await ev(a, () => activeMainView === 'ADMIN' && !document.getElementById('viewAdmin').classList.contains('hidden')), 'opens the Admin page');
  await ev(a, () => setAdminTab('schools'));
  check(await ev(a, () => !document.getElementById('adminSide') && document.querySelectorAll('[role=tab][data-admin-tab]').length === 3), 'phone: tabs on top, no side panel');
  await ev(a, x => { adminView.open = ''; adminOpenRow(x); }, sB);
  check(await ev(a, x => !!document.querySelector(`#adminList [data-admin-school="${x}"] [data-admin-actions]`), sB), 'phone: the school opens in its card');
  await ev(a, () => closeAdminPanel());
  check(await ev(a, () => activeMainView === 'HOME'), 'back to Home');

  // (when the admin clears the trial or Pro, or turns a feature off, an open Leave or Calendar listener is refused before the school's
  // change reaches the phone, which then stops it)
  const bad = backend.denied.filter(d => !/features write|Pro and the trial|leave create|leave:|read leave|read planYears|read ppas/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 400)})`);
  check(!errors.length, `no page errors (${errors.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('admin-panel');
  await closeAll();
}
