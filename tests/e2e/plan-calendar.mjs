// School Planning pilot, part D1 (Nov 2026): the school calendar. The AO (Calendar page) and the
// School Head (Plan tab) load the DepEd calendar for SY 2026-2027, check the class days (201),
// add school events and days without classes; teachers read it in a Calendar tab and are
// notified of new, moved and cancelled events and of days without classes.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead, refused } from './lib/school-setup.mjs';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const year = (sid, sy = '2026-2027') => backend.store.get(`schools/${sid}/planYears/${sy}`);
const ppas = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/ppas/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const notif = (page, re) => ev(page, src => loadNotifs().items.some(n => new RegExp(src).test(n.title)), re.source);
const turnOn = page => ev(page, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); });
const text = (page, sel) => ev(page, s => (document.querySelector(s) || {}).textContent || '', sel);

// Fill in the open event sheet and save it
async function fillEvent(p, { title, from, to, time = '', venue = '' }) {
  await until(p, () => !!document.getElementById('calEventSave'), 'event sheet');
  await ev(p, (ti, f, t2, tm, v) => {
    calTitle.value = ti; calFrom.value = f; calTo.value = t2 || f;
    calAllDay.checked = !tm; calEventAllDay();
    if (tm) calStart.value = tm;
    calVenue.value = v;
    document.getElementById('calEventSave').click();
  }, title, from, to || from, time, venue);
}

try {
  out('1 a school in the pilot: the AO, a teacher and the School Head');
  const { page: a, sid } = await custodian(backend);
  const { page: t } = await teacher(backend, sid);
  await turnOn(a); await turnOn(t);
  await ev(a, () => { calNav(); });
  const { page: h } = await schoolHead(backend, a, sid);
  await turnOn(h);
  await ev(h, () => renderHeadView());
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-school-calendar' && r.pilot === 'plan') && wnList().some(r => r.id === '2026-11-school-calendar')), 'What’s new: the school calendar (pilot)');
  check(await ev(a, () => document.getElementById('moreCalItem').style.display === '' && document.getElementById('sideCalendar').style.display === ''), 'AO: School calendar in More and in the sidebar');

  out('2 the AO sets up SY 2026-2027 from the DepEd calendar');
  await ev(a, () => openCalendar());
  await until(a, () => activeMainView === 'CALENDAR' && !!document.querySelector('[data-cal-setup]'), 'setup card', 8000);
  check(await ev(a, () => /DepEd Order No\. 009/.test(document.querySelector('[data-cal-setup]').textContent) && !!document.getElementById('calLoadBtn')), 'Set up SY 2026–2027: Load the DepEd calendar (DO 009 s. 2026)');
  await ev(a, () => document.getElementById('calLoadBtn').click());
  await waitNode(() => !!year(sid));
  const Y = () => year(sid);
  check(Y().start === '2026-06-08' && Y().end === '2027-04-08' && Y().terms.length === 3 && Y().days.length === 71 && Y().days.every(d => d.src === 'deped') && Y().depedV === 2, 'saved: Jun 8, 2026 to Apr 8, 2027, three terms, 71 DepEd dates');
  await until(a, () => !!document.querySelector('[data-cal-strip]'), 'term strip');
  check(/Term 2/.test(await text(a, '[data-cal-strip]')), `strip: Term 2 (${await text(a, '[data-cal-today]')})`);
  check(await ev(a, () => calClassDays(calYears['2026-2027']).total === 201), 'class days: 201, as in the DepEd order');
  await ev(a, () => document.getElementById('calDaysBtn').click());
  await until(a, () => !!document.querySelector('[data-cal-total]'), 'class days sheet');
  const months = await ev(a, () => [...document.querySelectorAll('[data-cal-mo]')].map(x => x.textContent).join(','));
  check(await text(a, '[data-cal-total]') === '201' && months === '16,23,19,22,22,19,13,20,20,21,6', `class days by month (${months})`);
  check(await ev(a, () => /Within the law/.test(document.getElementById('calModalBody').textContent) && ['1', '2', '3'].every(n => +document.querySelector(`[data-cal-term="${n}"]`).textContent > 50)), 'within the law (200 to 220); each term counted');
  await ev(a, () => closeCalModal());
  check(await ev(a, () => document.querySelectorAll('[data-cal-entry]').length > 3 && !!document.querySelector('[data-cal-kind="holiday"]')), 'agenda: what is coming up, holidays included');
  const D = (title, from) => Y().days.find(d => d.title === title && (!from || d.from === from));
  check(!!D('Term 1 examinations', '2026-08-28') && !!D('Term 1 examinations', '2026-09-01') && D('Term 1 examinations', '2026-08-28').to === '2026-08-28', 'DO 009: Term 1 exams on Aug 28 and Sep 1 (two days, not a span)');
  check(D('Term 3 examinations (moving up / graduating learners)').from === '2027-03-15' && D('Term 3 examinations (other grade levels)').from === '2027-03-22', 'DO 009: Term 3 exams Mar 15–16 (moving up) and Mar 22–23');
  check(D('Year-End Break (wellness break of learners and teachers)').to === '2026-12-31' && Y().days.filter(d => d.kind === 'inset').length === 4 && Y().days.filter(d => /teacher-made summative/.test(d.title)).length === 6 && Y().days.filter(d => /^PTA meeting/.test(d.title)).length === 3,
    'DO 009: Year-End Break Dec 19–31, 4 INSET dates, 6 summative tests, 3 PTA meetings');
  check(await ev(a, () => { const f = calFilter; calFilter = 'all'; const all = calEntries('2026-2027').filter(calMatch).some(e => /Palarong|NAT for/.test(e.title)); calFilter = 'deped'; const dep = calEntries('2026-2027').filter(calMatch).some(e => /Palarong/.test(e.title)); calFilter = f; return !all && dep; }), 'national activities (NAT, Palaro…) show under DepEd, not under All');

  out('3 the teacher: a read-only Calendar tab');
  await ev(t, () => setTeacherTab('calendar'));
  await until(t, () => !!calYears['2026-2027'] && document.querySelectorAll('#rqCalPane [data-cal-entry]').length > 3, 'teacher sees the calendar', 10000);
  check(await ev(t, () => !document.getElementById('rqTab-calendar').classList.contains('hidden') && document.getElementById('rqTabs').classList.contains('rq-five')), 'five tabs: Calendar');
  check(await ev(t, () => !document.getElementById('calAddEvent') && !document.getElementById('calAddDate') && !document.getElementById('calYearBtn') && /Term 2/.test(document.querySelector('#rqCalPane [data-cal-strip]').textContent)), 'read only: no Add buttons; the term strip');
  await ev(t, () => openCalSheet('view', document.querySelector('#rqCalPane [data-cal-kind="holiday"]').dataset.calEntry));
  check(await ev(t, () => !document.querySelector('[data-cal-actions]') && /DepEd calendar/.test(document.getElementById('calModalBody').textContent)), 'a holiday: details, nothing to change');
  await ev(t, () => closeCalModal());
  await ev(t, () => { localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId); renderRequesterView(); });
  check(await ev(t, () => document.getElementById('rqTabs').classList.contains('rq-six') && document.getElementById('rqTabs').classList.contains('grid-cols-6')), 'with Leave too: six tabs');
  await ev(t, () => { localStorage.removeItem(LEAVE_PILOT_KEY); renderRequesterView(); });

  out('4 the School Head: a Plan tab, adds an event');
  await until(h, () => !document.getElementById('hdTab-plan').classList.contains('hidden'), 'Plan tab', 8000);
  await ev(h, () => setHeadTab('plan'));
  check(await ev(h, () => document.getElementById('hdTitle').textContent === 'School calendar'), 'Plan: School calendar');
  await until(h, () => !!document.querySelector('[data-hd-pane="plan"] #calAddEvent'), 'head can add', 10000);
  await ev(h, () => document.querySelector('[data-hd-pane="plan"] #calAddEvent').click());
  await until(h, () => !!document.getElementById('calEventSave'), 'event sheet');
  await ev(h, () => { calTitle.value = ''; document.getElementById('calEventSave').click(); });
  check(/what the event is/.test(await text(h, '#calErr')), 'the event needs a name');
  await fillEvent(h, { title: 'Parent–Teacher Conference', from: '2026-12-11', time: '13:00', venue: 'School gym' });
  await waitNode(() => ppas(sid).length === 1);
  const E = () => ppas(sid)[0];
  check(E().kind === 'event' && E().sy === '2026-2027' && E().status === 'planned' && E().by.role === 'head' && E().startTime === '13:00' && E().venue === 'School gym', 'saved: an event by the School Head, 1:00 PM at the gym');
  await until(t, () => loadNotifs().items.some(n => /On the school calendar: Parent/.test(n.title)), 'teacher notified', 10000);
  check(await notif(t, /On the school calendar: Parent–Teacher Conference/), 'teacher: notified of the new event');
  await until(t, () => /Parent–Teacher Conference/.test(document.getElementById('rqCalPane').textContent), 'teacher sees the event');
  check(/1:00 PM/.test(await text(t, '#rqCalPane [data-cal-kind="event"]')), 'the teacher’s agenda shows the time');
  check(!(await notif(h, /On the school calendar/)), 'the head is not notified of their own event');

  out('5 the AO moves it, cancels it, puts it back');
  await until(a, () => calEvents.length === 1, 'AO sees the event', 8000);
  await ev(a, () => openCalSheet('view', 'e:' + calEvents[0].id));
  check(await ev(a, () => /School Head/.test(document.getElementById('calModalBody').textContent) && !!document.querySelector('[data-cal-act="edit"]')), 'details: added by the School Head; Change');
  await ev(a, () => document.querySelector('[data-cal-act="edit"]').click());
  await until(a, () => !!document.getElementById('calEventSave') && calTitle.value === 'Parent–Teacher Conference', 'edit sheet with the event');
  await ev(a, () => { calFrom.value = '2026-12-14'; calTo.value = '2026-12-14'; document.getElementById('calEventSave').click(); });
  await waitNode(() => E().from === '2026-12-14');
  check(/Moved to/.test(E().log.slice(-1)[0].x), 'history: moved');
  await until(t, () => loadNotifs().items.some(n => /^Moved: Parent/.test(n.title)), 'teacher: moved', 10000);
  check(true, 'teacher: notified it was moved');
  await ev(a, () => calEventStatus(calEvents[0].id, 'cancelled'));
  await waitNode(() => E().status === 'cancelled');
  await until(t, () => loadNotifs().items.some(n => /^Cancelled: Parent/.test(n.title)), 'teacher: cancelled', 10000);
  check(await ev(t, () => !!document.querySelector('#rqCalPane [data-cal-kind="event"].opacity-60')), 'teacher: notified, and it shows as cancelled');
  await ev(a, () => calEventStatus(calEvents[0].id, 'planned'));
  await waitNode(() => E().status === 'planned');
  await until(t, () => loadNotifs().items.some(n => /^Back on: Parent/.test(n.title)), 'teacher: back on', 10000);
  check(true, 'teacher: notified it is back on');

  out('6 a class suspension: no classes, counted again');
  await ev(a, () => document.getElementById('calAddDate').click());
  await until(a, () => !!document.getElementById('calDateSave'), 'date sheet');
  check(await ev(a, () => calKind.value === 'suspension' && /no classes/i.test(calKindNote.textContent)), 'starts at Class suspension (no classes)');
  await ev(a, () => { calTitle.value = 'Typhoon Ada · classes suspended'; calFrom.value = '2027-01-15'; calTo.value = '2027-01-14'; document.getElementById('calDateSave').click(); });
  check(/before the first day/.test(await text(a, '#calErr')), 'the last day can’t be before the first');
  await ev(a, () => { calTo.value = '2027-01-15'; calNote.value = 'Division Memo No. 12, s. 2027'; document.getElementById('calDateSave').click(); });
  await waitNode(() => Y().days.length === 72);
  const S = () => Y().days.find(d => d.src === 'school');
  check(S().kind === 'suspension' && S().from === '2027-01-15' && S().by.role === 'ao', 'saved on the school year');
  check(await ev(a, () => calClassDays(calYears['2026-2027']).total === 200), 'class days: 200 now');
  await until(t, () => loadNotifs().items.some(n => /^No classes: Typhoon Ada/.test(n.title)), 'teacher: no classes', 10000);
  check(true, 'teacher: notified there are no classes');
  await ev(a, () => { setCalMode('month'); calMonth = '2027-01'; setCalDay('2027-01-15'); });
  check(await ev(a, () => !!document.querySelector('[data-cal-day="2027-01-15"][data-cal-off]') && !!document.querySelector('[data-cal-day="2027-01-01"][data-cal-off]')
    && /Typhoon Ada/.test(document.querySelector('[data-cal-selected]').textContent) && /No classes/.test(document.querySelector('[data-cal-dayno]').textContent)), 'month: Jan 15 and Jan 1 have no classes; the day lists the suspension');
  await ev(a, () => setCalDay('2027-01-14'));
  check(/Class day \d+ of 200/.test(await text(a, '[data-cal-dayno]')), `month: a school day shows its number (${await text(a, '[data-cal-dayno]')})`);
  await ev(a, () => setCalMode('agenda'));
  await ev(a, i => calRemoveDate(i), S().id);
  await waitNode(() => Y().days.length === 71);
  check(await ev(a, () => calClassDays(calYears['2026-2027']).total === 201), 'removed: back to 201');

  out('7 school year dates; removing an event');
  await ev(a, () => openCalSheet('year'));
  await until(a, () => !!document.getElementById('calYearSave'), 'year sheet');
  check(await ev(a, () => calYStart.value === '2026-06-08' && calT3To.value === '2027-04-08'), 'the dates are filled in');
  await ev(a, () => { calYEnd.value = '2026-05-01'; document.getElementById('calYearSave').click(); });
  check(/before the first day/.test(await text(a, '#calErr')), 'a last day before the first is refused');
  await ev(a, () => { calYEnd.value = '2027-04-08'; calT2To.value = '2027-05-01'; document.getElementById('calYearSave').click(); });
  check(/outside the school year/.test(await text(a, '#calErr')), 'a term outside the school year is refused');
  await ev(a, () => closeCalModal());
  await ev(a, () => calRemoveEvent(calEvents[0].id));
  await waitNode(() => E().removed === true);
  await until(a, () => !document.querySelector('[data-cal-kind="event"]'), 'event gone');
  check(true, 'removed: the event is gone from the calendar (kept with removed: true)');

  out('8 a school year loaded from the first DepEd list: Update');
  const OLD = [['deped', '2026-06-01', '2026-06-05', 'Brigada Eskwela'], ['holiday', '2026-06-12', '', 'Independence Day', 'regular'], ['holiday', '2026-08-21', '', 'Ninoy Aquino Day', 'special'],
    ['exam', '2026-08-28', '2026-09-01', 'Term 1 examinations'], ['holiday', '2026-08-31', '', 'National Heroes Day', 'regular'], ['holiday', '2026-11-01', '', 'All Saints’ Day', 'special'],
    ['holiday', '2026-11-02', '', 'All Souls’ Day', 'special'], ['holiday', '2026-11-30', '', 'Bonifacio Day', 'regular'], ['exam', '2026-12-03', '2026-12-04', 'Term 2 examinations'],
    ['holiday', '2026-12-08', '', 'Feast of the Immaculate Conception of Mary', 'special'], ['break', '2026-12-21', '2027-01-03', 'Christmas break'], ['holiday', '2026-12-24', '', 'Christmas Eve', 'special'],
    ['holiday', '2026-12-25', '', 'Christmas Day', 'regular'], ['holiday', '2026-12-30', '', 'Rizal Day', 'regular'], ['holiday', '2026-12-31', '', 'Last Day of the Year', 'special'],
    ['holiday', '2027-01-01', '', 'New Year’s Day', 'regular'], ['holiday', '2027-02-06', '', 'Chinese New Year', 'special'], ['working', '2027-02-25', '', 'EDSA People Power Revolution Anniversary'],
    ['exam', '2027-03-22', '2027-03-23', 'Term 3 examinations'], ['holiday', '2027-03-25', '', 'Maundy Thursday', 'regular'], ['holiday', '2027-03-26', '', 'Good Friday', 'regular'],
    ['holiday', '2027-03-27', '', 'Black Saturday', 'special'], ['deped', '2027-04-06', '2027-04-07', 'End-of-School-Year rites']];
  await ev(a, old => {
    const F = cloud.sdk, y = calYears['2026-2027'];
    const days = old.map(([kind, from, to, title, sub], i) => ({ id: `deped${i}`, kind, from, to: to || from, title, sub: sub || '', src: 'deped', ms: 1, ...(title === 'Christmas break' ? { changedBy: 'Rhea' } : {}) }))
      .concat([{ id: 'own1', kind: 'noclass', from: '2027-01-29', to: '2027-01-29', title: 'Town fiesta', src: 'school', ms: 2 }]);
    return F.setDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'planYears', '2026-2027'), { sy: '2026-2027', start: y.start, end: y.end, memo: y.memo, terms: y.terms, days });
  }, OLD);
  await waitNode(() => Y().days.length === 24 && !Y().depedV);
  await until(a, () => !!document.getElementById('calDepedBtn'), 'Update banner', 8000);
  check(await ev(a, () => calClassDays(calYears['2026-2027']).total === 200), 'old list plus a town fiesta: 200 class days');
  check(!(await ev(t, () => !!document.getElementById('calDepedBtn'))), 'teachers don’t see the Update banner');
  await ev(a, () => document.getElementById('calDepedBtn').click());
  await until(a, () => !!document.getElementById('calDepedSave'), 'update sheet');
  const dp = await ev(a, () => ({ add: document.querySelector('[data-cal-dp-add]').dataset.calDpAdd, drop: document.querySelector('[data-cal-dp-drop]').dataset.calDpDrop, kept: document.querySelector('[data-cal-dp-kept]').textContent }));
  check(dp.add === '51' && dp.drop === '2' && /Christmas break/.test(dp.kept), `preview: 51 added, 2 replaced, Christmas break kept as changed (${JSON.stringify(dp)})`);
  await ev(a, () => document.getElementById('calDepedSave').click());
  await waitNode(() => Y().depedV === 2);
  check(Y().days.length === 73 && !!D('Town fiesta') && !!D('Christmas break') && !D('Term 3 examinations') && !Y().days.some(d => d.title === 'Term 1 examinations' && d.to === '2026-09-01' && d.from === '2026-08-28'),
    'updated: 73 dates; the school’s own and the changed one stay; the old exam spans are gone');
  check(await ev(a, () => calClassDays(calYears['2026-2027']).total === 200 && !document.getElementById('calDepedBtn')), 'still 200 class days (the fiesta); the banner is gone');
  check(new Set(Y().days.map(d => d.id)).size === Y().days.length, 'every date has its own id');

  out('9 outside the pilot, and the rules');
  check(await refused(t, F => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'ppas')), { kind: 'event', title: 'Mine', sy: '2026-2027', from: '2026-12-01', to: '2026-12-01', status: 'planned', log: [] })), 'rules: a teacher can’t add events yet');
  check(await refused(t, F => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'planYears'), '2026-2027'), { sy: '2026-2027', terms: [], days: [] })), 'rules: a teacher can’t change the school year');
  check(await refused(a, F => F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'planYears'), '2026-2027'), { sy: '2027-2028', terms: [], days: [] })), 'rules: the document is the school year it says');
  check(await ev(a, () => RESET_SUBS.includes('planYears') && RESET_SUBS.includes('ppas')), 'Reset app erases the calendar too');
  await ev(t, () => { localStorage.removeItem(PLAN_PILOT_KEY); PLAN_PILOT.length = 0; renderRequesterView(); });
  check(await ev(t, () => document.getElementById('rqTab-calendar').classList.contains('hidden') && teacherTab !== 'calendar' && document.getElementById('rqTabs').classList.contains('grid-cols-4')), 'another school: no Calendar tab');
  await ev(a, () => { localStorage.removeItem(PLAN_PILOT_KEY); PLAN_PILOT.length = 0; calNav(); switchMainView('CALENDAR'); });
  check(await ev(a, () => activeMainView !== 'CALENDAR' && document.getElementById('moreCalItem').style.display === 'none' && !wnList().some(r => r.pilot === 'plan')), 'another school: no Calendar page, no note');
  const bad = backend.denied.filter(d => !/ppa write|plan year write/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 300)})`);
  const errs = errors.filter(e => /cal|plan|ppa/i.test(e));
  check(!errs.length, `no page errors about the calendar (${errs.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('plan-calendar');
  await closeAll();
}
