// School Planning, part D2 (Nov 2026): programs, projects and activities (SIP / AIP). The AO adds a
// program, a project and activities (dates, venue, people, budget, fund source), copies and repeats
// them; they show on the calendar and in the Plan with totals. A teacher sees "Mine", gets reminders
// (added, the day before, moved, cancelled), proposes an activity and suggests a change; the School
// Head approves or returns proposals in the Approve tab. The rules refuse the rest.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead, refused } from './lib/school-setup.mjs';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const ppas = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/ppas/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const notif = (page, re) => ev(page, src => loadNotifs().items.some(n => new RegExp(src).test(n.title)), re.source);
const turnOn = page => ev(page, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); });
// SHOTS=1 saves screenshots to /tmp/ppa-*.png (for looking at the screens; not checked)
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: `/tmp/ppa-${name}.png`, fullPage: false }) : null);
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Fill the open Program / Project / Activity sheet and save it
async function fill(p, f) {
  await until(p, () => !!document.getElementById('ppaSave'), 'ppa sheet');
  await ev(p, f => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    set('ppaParent', f.parent); set('ppaTitle', f.title); set('ppaObjective', f.objective); set('ppaOutput', f.output);
    set('ppaFrom', f.from); set('ppaTo', f.to || f.from); set('ppaVenue', f.venue); set('ppaBudget', f.budget); set('ppaSource', f.source);
    if (f.time !== undefined && document.getElementById('ppaAllDay')) { document.getElementById('ppaAllDay').checked = !f.time; ppaAllDayChanged(); if (f.time) document.getElementById('ppaStart').value = f.time; }
    (f.who || []).forEach(n => { document.getElementById('ppa_who_in').value = n; ppaPersonAdd('who'); });
    (f.team || []).forEach(n => { document.getElementById('ppa_team_in').value = n; ppaPersonAdd('team'); });
    if (f.repeat) { document.getElementById('ppaRepeat').value = f.repeat; ppaRepeatChanged(); document.getElementById('ppaUntil').value = f.until; document.getElementById('ppaSkipOff').checked = !!f.skip; }
    if (f.note !== undefined) set('ppaNote', f.note);
    document.getElementById('ppaSave').click();
  }, f);
}

try {
  out('1 the AO, a teacher and the School Head at a pilot school');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: tUid } = await teacher(backend, sid);
  await turnOn(a); await turnOn(t);
  await ev(t, () => calSync());
  const { page: h } = await schoolHead(backend, a, sid);
  await turnOn(h);
  await ev(h, () => calSync());
  await ev(a, () => { calNav(); openCalendar(); });
  await until(a, () => activeMainView === 'CALENDAR' && !!document.getElementById('calLoadBtn'), 'calendar setup', 8000);
  await ev(a, () => document.getElementById('calLoadBtn').click());
  await waitNode(() => !!backend.store.get(`schools/${sid}/planYears/2026-2027`));
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-plan-ppas' && r.pilot === 'plan') && wnList().some(r => r.id === '2026-11-plan-ppas')), 'What’s new: programs, projects and activities (pilot)');
  check(await waitNode(() => (backend.store.get(`schools/${sid}/planYears/2026-2027`).people || []).some(x => x.uid === tUid && x.name === 'Ana Reyes')), 'the school’s people are kept on the school year (for teachers’ phones)');

  out('2 the Plan page: a program, a project, an activity');
  check(await ev(a, () => !!document.querySelector('[data-cal-page="plan"]') && !!document.querySelector('[data-cal-page="cal"][aria-pressed="true"]')), 'Calendar · Plan switch');
  await ev(a, () => document.querySelector('[data-cal-page="plan"]').click());
  check(await ev(a, () => !!document.querySelector('[data-ppa-empty]') && !!document.getElementById('ppaAddProgram') && !!document.getElementById('ppaAddActivity')), 'empty plan: add Program · Project · Activity');
  const addOrder = () => ev(a, () => { const g = document.querySelector('[data-ppa-add]'); return g ? [...g.children].map(b => b.id.replace('ppaAdd', '') + (/bg-teal-700/.test(b.className) ? '*' : '')).join(' ') : ''; });
  check(await addOrder() === 'Program* Project Activity', 'no program yet: the buttons go Program · Project · Activity, Program first');
  await ev(a, () => document.getElementById('ppaAddProgram').click());
  await fill(a, { title: 'Reading Program', note: 'Reading and numeracy for all grade levels' });
  await waitNode(() => ppas(sid).some(p => p.kind === 'program' && p.title === 'Reading Program'));
  const prog = ppas(sid).find(p => p.kind === 'program');
  await until(a, () => !!document.querySelector('[data-ppa-add="activity"]'), 'Activity first');
  check(await addOrder() === 'Program Project Activity*', 'after the first program: Activity is the main button');
  check(prog.status === 'planned' && prog.sy === '2026-2027' && !prog.from && prog.by.role === 'ao', 'saved: the program (planned, SY 2026–2027)');
  await ev(a, () => document.getElementById('ppaAddProject').click());
  await fill(a, { parent: prog.id, title: 'Project READ', objective: 'Halve the frustration readers in Grades 4 to 6', output: '120 learners reading at grade level', team: ['Ana Reyes'] });
  await waitNode(() => ppas(sid).some(p => p.kind === 'project'));
  const proj = ppas(sid).find(p => p.kind === 'project');
  check(proj.parentId === prog.id && proj.team.length === 1 && proj.team[0].uid === tUid && /Halve/.test(proj.objective), 'saved: the project under the program, Ana on the team (her account)');
  const tom = iso(1);
  await ev(a, x => ppaNew('activity', x), proj.id);
  await fill(a, { title: 'Reading camp', from: tom, time: '13:00', venue: 'Library', who: ['Ana Reyes', 'Pedro Cruz'], budget: '5,000', source: 'mooe', output: '40 learners' });
  await waitNode(() => ppas(sid).some(p => p.title === 'Reading camp'));
  const camp = () => ppas(sid).find(p => p.title === 'Reading camp');
  check(camp().parentId === proj.id && camp().from === tom && camp().startTime === '13:00' && camp().budget === 5000 && camp().source === 'mooe', 'saved: the activity (tomorrow 1:00 PM, ₱5,000 MOOE)');
  check(camp().who.length === 2 && camp().who[0].uid === tUid && camp().who[1].uid === '' && camp().who[1].name === 'Pedro Cruz', 'people: Ana (her account) and Pedro (a name typed in)');
  await until(a, () => !!document.querySelector(`[data-ppa-program] [data-ppa-project] [data-ppa-row]`), 'the tree');
  check(await ev(a, () => /^\s*1\s*Programs/.test(document.querySelector('[data-ppa-tile="programs"]').textContent) && /^\s*1\s*Activities/.test(document.querySelector('[data-ppa-tile="activities"]').textContent) && /5,000/.test(document.querySelector('[data-ppa-tile="budget"]').textContent)), 'totals: 1 program, 1 activity, ₱5,000');
  await shot(a, 'ao-plan');
  check(await ev(a, () => /MOOE ₱5,000\.00/.test(document.querySelector('[data-ppa-src="mooe"]').textContent)), 'by fund source: MOOE ₱5,000.00');
  check(await ev(a, () => /1 activity · ₱5,000/.test(document.querySelector('[data-ppa-project]').textContent)), 'the project: 1 activity · ₱5,000');

  out('3 copy, repeat, and on the calendar');
  await ev(a, id => openCalSheet('ppa', id), camp().id);
  check(await ev(a, () => !!document.querySelector('[data-ppa-act="copy"]') && /Project READ/.test(document.getElementById('calModalBody').textContent) && /Pedro Cruz/.test(document.getElementById('calModalBody').textContent)), 'activity sheet: project, people, Copy');
  await shot(a, 'ao-sheet');
  await ev(a, () => document.querySelector('[data-ppa-act="copy"]').click());
  await fill(a, { title: 'Reading camp (Grade 5)', from: iso(8) });
  await waitNode(() => ppas(sid).some(p => p.title === 'Reading camp (Grade 5)'));
  const copy = ppas(sid).find(p => p.title === 'Reading camp (Grade 5)');
  check(copy.parentId === proj.id && copy.budget === 5000 && copy.who.length === 2 && copy.from === iso(8), 'copied: same project, people and budget, new date');
  await ev(a, () => ppaNew('activity'));
  await fill(a, { title: 'Reading period', from: iso(2), repeat: 'weekly', until: iso(23), skip: false });
  await waitNode(() => ppas(sid).filter(p => p.title === 'Reading period').length === 4);
  const reps = ppas(sid).filter(p => p.title === 'Reading period');
  check(reps.length === 4 && new Set(reps.map(p => p.series)).size === 1 && reps.map(p => p.from).sort().join() === [2, 9, 16, 23].map(iso).join(), 'repeat every week: 4 activities, one series');
  check(await ev(a, () => ppaRepeatDates('2026-11-23', '2026-11-23', 'weekly', '2026-12-14', true).map(x => x[0]).join() === '2026-11-23,2026-12-07,2026-12-14'), 'skip days without classes: Nov 30 (Bonifacio Day) left out');
  check(await ev(a, () => ppaRepeatDates('2027-01-31', '2027-01-31', 'monthly', '2027-04-30', false).map(x => x[0]).join() === '2027-01-31,2027-02-28,2027-03-31,2027-04-30'), 'every month: the last day of short months');
  await ev(a, () => setCalPage('cal'));
  await ev(a, () => setCalFilter('acts'));
  check(await ev(a, () => document.querySelectorAll('[data-cal-entry][data-cal-kind="activity"]').length >= 5 && [...document.querySelectorAll('[data-cal-entry]')].every(e => e.dataset.calKind === 'activity')), 'calendar · Activities: the activities only');
  check(await ev(a, () => !!document.querySelector('[data-cal-week]') && /This week/.test(document.querySelector('[data-cal-week]').textContent)), 'calendar: “This week: …”');
  check(await ev(a, () => homeAttention().some(x => x.key === 'cal-week')), 'AO’s Home: “This week: …”');
  await shot(a, 'ao-cal');
  await ev(a, () => setCalFilter('all'));

  out('4 the teacher: added, Mine, the day before');
  await until(t, () => calEvLoaded && ppaAll().some(p => p.title === 'Reading camp'), 'teacher has the plan', 8000);
  await until(t, () => loadNotifs().items.some(n => /You are responsible: Reading camp/.test(n.title)), 'teacher notified (added)', 8000);
  check(true, 'notified: “You are responsible: Reading camp”');
  await ev(t, () => notifPpaTomorrow(Date.now()));
  check(await notif(t, /^Tomorrow: Reading camp/), 'reminder: “Tomorrow: Reading camp” (Library, 1:00 PM)');
  const nT = await ev(t, () => loadNotifs().items.filter(n => /^Tomorrow:/.test(n.title)).length);
  await ev(t, () => notifPpaTomorrow(Date.now()));
  check(await ev(t, () => loadNotifs().items.filter(n => /^Tomorrow:/.test(n.title)).length) === nT, 'the reminder once');
  await ev(t, () => setTeacherTab('calendar'));
  await ev(t, () => setCalFilter('mine'));
  check(await ev(t, () => { const es = [...document.querySelectorAll('#rqCalPane [data-cal-entry]')]; return es.length === 2 && es.every(e => e.querySelector('[data-cal-mine]')); }), 'teacher · Mine: her 2 activities, marked Yours');
  await ev(t, () => { setCalFilter('all'); setCalPage('plan'); });
  check(await ev(t, () => !!document.querySelector('#rqCalPane [data-ppa-tree]') && !document.getElementById('ppaAddActivity') && !!document.getElementById('ppaProposeActivity') && /Mine · 2/.test(document.querySelector('[data-ppa-filter="mine"]').textContent)), 'teacher · Plan: read only, Propose, Mine · 2');
  await shot(t, 'teacher-plan');
  check(await refused(t, F => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'ppas')), { kind: 'activity', sy: '2026-2027', title: 'Sneaky', from: '2026-12-01', to: '2026-12-01', status: 'planned', by: { uid: cloud.user.uid, name: 'Ana' }, log: [] })), 'rules: a teacher can’t add straight to the plan');
  check(await refused(t, (F, id) => F.updateDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'ppas', id), { title: 'Changed by Ana' }), camp().id), 'rules: a teacher can’t change the AO’s activity');
  check(await refused(t, F => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'ppas')), { kind: 'activity', sy: '2026-2027', title: 'Not mine', from: '2026-12-01', to: '2026-12-01', status: 'proposed', by: { uid: 'someone-else', name: 'X' }, log: [] })), 'rules: a proposal in someone else’s name is refused');

  out('5 the teacher proposes; the School Head returns, then approves');
  await ev(t, () => document.getElementById('ppaProposeActivity').click());
  await sleep(300); await shot(t, 'teacher-form');
  await fill(t, { parent: proj.id, title: 'Storytelling contest', from: iso(10), venue: 'Covered court', who: ['Ana Reyes'], budget: '1500', source: 'pta' });
  await waitNode(() => ppas(sid).some(p => p.title === 'Storytelling contest'));
  const prop = () => ppas(sid).find(p => p.title === 'Storytelling contest');
  check(prop().status === 'proposed' && prop().by.uid === tUid && prop().by.role === 'teacher' && prop().parentId === proj.id, 'saved: a proposal (status proposed, by Ana)');
  check(await ev(t, () => !!document.querySelector('[data-ppa-prop][data-ppa-status="proposed"]') && !!document.querySelector('[data-ppa-withdraw]')), 'teacher: “Your proposals” with Change and Withdraw');
  await ev(t, () => setCalPage('cal'));
  check(await ev(t, () => !!document.querySelector('[data-cal-entry][data-cal-kind="activity"] [data-cal-proposed]')), 'teacher’s calendar: hers shows “For approval”');
  await until(h, () => calEvLoaded && ppaAll().some(p => p.status === 'proposed'), 'head has the proposal', 8000);
  await ev(h, () => { setHeadTab('approve'); renderHeadView(); });
  await until(h, () => !!document.querySelector('#hdBody [data-hd-pane="approve"] [data-ppa-prop]'), 'Approve tab card');
  await shot(h, 'head-approve');
  check(await ev(h, () => document.getElementById('hdApproveCount').textContent === '1' && /From Ana Reyes/.test(document.querySelector('[data-hd-pane="approve"] [data-ppa-prop]').textContent)), 'School Head · Approve: the proposal from Ana Reyes (1)');
  check(await notif(h, /Proposal from Ana Reyes: Storytelling contest/), 'School Head notified: “Proposal from Ana Reyes: …”');
  await until(a, () => ppaAll().some(p => p.status === 'proposed'), 'AO has it');
  await ev(a, () => setCalPage('plan'));
  check(await ev(a, () => !!document.querySelector('[data-ppa-prop]') && !document.querySelector('[data-ppa-approve]') && /Waiting for the School Head/.test(document.querySelector('[data-ppa-prop]').textContent)), 'AO: sees it, waiting for the School Head (no Approve)');
  h.dialogs.prompt = 'Please add the prizes to the budget';
  await ev(h, () => document.querySelector('[data-hd-pane="approve"] [data-ppa-return]').click());
  await waitNode(() => prop().status === 'returned');
  check(prop().decision.note === 'Please add the prizes to the budget' && prop().decision.ok === false, 'returned with the note');
  await until(t, () => loadNotifs().items.some(n => /^Returned: Storytelling contest/.test(n.title)), 'teacher notified (returned)', 8000);
  check(true, 'teacher notified: “Returned: Storytelling contest”');
  await ev(t, () => setCalPage('plan'));
  check(await ev(t, () => /Please add the prizes/.test(document.querySelector('[data-ppa-prop][data-ppa-status="returned"] [data-ppa-note]').textContent) && document.querySelector('[data-cal-page="plan"] [data-ppa-wait-n]').textContent === '1'), 'teacher: the note, and Plan · 1');
  await ev(t, id => ppaEdit(id), prop().id);
  await fill(t, { budget: '2500' });
  await waitNode(() => prop().status === 'proposed' && prop().budget === 2500);
  check(/sent again/.test(prop().log[prop().log.length - 1].x), 'fixed and sent again (₱2,500)');
  await until(h, () => !!document.querySelector('[data-hd-pane="approve"] [data-ppa-approve]'), 'back in Approve');
  await ev(h, () => document.querySelector('[data-hd-pane="approve"] [data-ppa-approve]').click());
  await waitNode(() => prop().status === 'planned');
  check(prop().decision.ok === true && prop().decision.role === 'head', 'approved by the School Head: on the plan');
  await until(t, () => loadNotifs().items.some(n => /^Approved: Storytelling contest/.test(n.title)), 'teacher notified (approved)', 8000);
  check(true, 'teacher notified: “Approved: Storytelling contest”');
  await until(a, () => !!document.querySelector(`[data-ppa-project] [data-ppa-row="${ppaAll().find(p => p.title === 'Storytelling contest').id}"]`), 'AO plan shows it');
  check(await ev(a, () => !!document.querySelector('[data-ppa-src="pta"]')), 'AO: on the plan under Project READ, PTA in the totals');

  out('6 a suggested change; withdraw');
  await ev(t, id => { openCalSheet('ppa', id); }, camp().id);
  check(await ev(t, () => !!document.querySelector('[data-ppa-act="suggest"]') && !document.querySelector('[data-ppa-act="edit"]')), 'teacher: Suggest a change (not Change)');
  await ev(t, () => document.querySelector('[data-ppa-act="suggest"]').click());
  await fill(t, { from: iso(3), venue: 'Grade 4 classroom' });
  await waitNode(() => ppas(sid).some(p => p.changeOf === camp().id));
  const sug = () => ppas(sid).find(p => p.changeOf === camp().id);
  check(sug().status === 'proposed' && sug().from === iso(3), 'saved: a suggested change (a proposal)');
  check(await ev(t, () => calEntries(calCurSy()).filter(e => e.title === 'Reading camp').length === 1), 'not a second entry on the calendar');
  await until(h, () => !!document.querySelector('[data-hd-pane="approve"] [data-ppa-diff]'), 'head sees the changes');
  check(await ev(h, () => /When:/.test(document.querySelector('[data-ppa-diff]').textContent) && /Venue: Grade 4 classroom/.test(document.querySelector('[data-ppa-diff]').textContent)), 'School Head: what changes (When, Venue)');
  await ev(h, () => document.querySelector('[data-hd-pane="approve"] [data-ppa-approve]').click());
  await waitNode(() => sug().status === 'merged' && camp().from === iso(3) && camp().venue === 'Grade 4 classroom');
  check(camp().moved.length === 1 && camp().moved[0].from === tom && /as Ana Reyes suggested/.test(camp().log[camp().log.length - 1].x), 'approved: the activity moved, with its history');
  await until(t, () => loadNotifs().items.some(n => /Your suggested change was approved/.test(n.title)), 'teacher notified (change approved)', 8000);
  check(true, 'teacher notified: “Your suggested change was approved”');
  await ev(t, () => { closeCalModal(); document.getElementById('ppaProposeProject').click(); });
  await fill(t, { title: 'Math Olympiad club', objective: 'More learners in contests' });
  await waitNode(() => ppas(sid).some(p => p.title === 'Math Olympiad club'));
  await until(t, () => !!document.querySelector('[data-ppa-withdraw]'), 'withdraw button');
  await ev(t, () => document.querySelector('[data-ppa-withdraw]').click());
  await waitNode(() => ppas(sid).find(p => p.title === 'Math Olympiad club').status === 'withdrawn');
  check(true, 'teacher withdrew a proposal');
  check(await refused(t, (F, id) => F.updateDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'ppas', id), { status: 'planned' }), ppas(sid).find(p => p.title === 'Math Olympiad club').id), 'rules: a teacher can’t approve her own');

  out('7 the AO moves and cancels: the teacher is told');
  await ev(a, id => ppaEdit(id), copy.id);
  await fill(a, { from: iso(9) });
  await waitNode(() => ppas(sid).find(p => p.id === copy.id).from === iso(9));
  await until(t, () => loadNotifs().items.some(n => /^Moved: Reading camp \(Grade 5\)/.test(n.title)), 'teacher: moved', 8000);
  check(true, 'teacher notified: “Moved: Reading camp (Grade 5)”');
  await ev(a, id => ppaSetStatus(id, 'cancelled'), copy.id);
  await until(t, () => loadNotifs().items.some(n => /^Cancelled: Reading camp \(Grade 5\)/.test(n.title)), 'teacher: cancelled', 8000);
  check(true, 'teacher notified: “Cancelled: Reading camp (Grade 5)”');
  await ev(a, id => ppaRemove(id), reps[0].id);
  await waitNode(() => ppas(sid).find(p => p.id === reps[0].id).removed === true);
  check(await ev(a, id => !ppaAll().some(p => p.id === id), reps[0].id), 'removed: off the plan (kept, removed: true)');

  out('8 on a computer: the plan uses the width');
  await a.setViewport({ width: 1366, height: 900 });
  await sleep(300);
  await ev(a, () => { setCalPage('plan'); });
  await shot(a, 'laptop');
  check(await ev(a, () => document.getElementById('viewCalendar').classList.contains('cal-plan') && getComputedStyle(document.querySelector('[data-ppa-tree]')).display === 'grid'), 'computer: a wider page, the plan in columns');

  const bad = backend.denied.filter(d => !/ppa write|ppa body/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 400)})`);
  check(!errors.length, `no page errors (${errors.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('plan-ppa');
  await closeAll();
}
