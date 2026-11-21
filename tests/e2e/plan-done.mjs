// School Planning, part D4 (Nov 2026): Done / Moved / Cancelled, overdue reminders and the
// monitoring report. The AO adds activities (some past their date); they show as overdue (Home,
// the Plan page, a reminder the day after and every week). A teacher marks hers Done with the
// accomplishment report (actual date, what was done, cost, participants, remarks, a photo made
// small on the phone); the AO is told, can undo it, moves one (new date + reason) and cancels one
// (reason). The monitoring report by term / mid-year / year-end, printed with the photos. The
// rules refuse a teacher marking someone else's activity or changing more than the report.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead, refused } from './lib/school-setup.mjs';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const ppas = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/ppas/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const notifs = (page, re) => ev(page, src => loadNotifs().items.filter(n => new RegExp(src).test(n.title)).map(n => `${n.title} | ${n.body || ''}`), re.source);
const turnOn = page => ev(page, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); });
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: `/tmp/done-${name}.png`, fullPage: false }) : null);
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const body = page => ev(page, () => document.getElementById('calModalBody').textContent);

async function fill(p, f) {
  await until(p, () => !!document.getElementById('ppaSave'), 'ppa sheet');
  await ev(p, f => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    set('ppaParent', f.parent); set('ppaTitle', f.title); set('ppaObjective', f.objective);
    set('ppaFrom', f.from); set('ppaTo', f.to || f.from); set('ppaBudget', f.budget); set('ppaSource', f.source); set('ppaMoveWhy', f.why);
    (f.who || []).forEach(n => { document.getElementById('ppa_who_in').value = n; ppaPersonAdd('who'); });
    document.getElementById('ppaSave').click();
  }, f);
}

try {
  out('1 the AO adds activities, some past their date');
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
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-plan-done' && r.pilot === 'plan') && wnList().some(r => r.id === '2026-11-plan-done')), 'What’s new: Done, Move and the monitoring report (pilot)');
  await ev(a, () => setCalPage('plan'));
  await ev(a, () => ppaNew('program'));
  await fill(a, { title: 'Reading Program' });
  await waitNode(() => ppas(sid).some(p => p.kind === 'program'));
  const prog = ppas(sid).find(p => p.kind === 'program');
  await ev(a, x => ppaNew('project', x), prog.id);
  await fill(a, { parent: prog.id, title: 'Project READ', objective: 'Halve the frustration readers' });
  await waitNode(() => ppas(sid).some(p => p.kind === 'project'));
  const proj = ppas(sid).find(p => p.kind === 'project');
  const add = async f => { await ev(a, () => ppaNew('activity')); await fill(a, f); await waitNode(() => ppas(sid).some(p => p.title === f.title)); };
  await add({ parent: proj.id, title: 'Reading camp', from: iso(-3), who: ['Ana Reyes'], budget: '5000', source: 'mooe' });
  await add({ parent: proj.id, title: 'Parents meeting', from: iso(-10), who: ['Ana Reyes'] });
  await add({ title: 'Science fair', from: iso(5), who: ['Pedro Cruz'], budget: '2000', source: 'pta' });
  await add({ title: 'Clean-up drive', from: iso(-2) });
  const by = title => ppas(sid).find(p => p.title === title);
  check(['Reading camp', 'Parents meeting', 'Science fair', 'Clean-up drive'].every(x => by(x).status === 'planned'), 'saved: 4 activities (3 past their date)');

  out('2 overdue: the Plan page, Home, the reminders');
  await until(a, () => !!document.querySelector('[data-ppa-overdue-card="3"]'), 'overdue card on the Plan page');
  check(true, 'Plan page: “Overdue: 3 activities”');
  check(await ev(a, () => /0 of 4 activities done/.test(document.querySelector('[data-ppa-progress]').textContent) && /3 overdue/.test(document.querySelector('[data-ppa-progress]').textContent) && !!document.getElementById('ppaReportBtn')), 'summary: 0 of 4 done · 3 overdue · Monitoring report');
  check(await ev(a, () => document.querySelectorAll('[data-ppa-badge="overdue"]').length === 3), 'rows: 3 marked Overdue');
  await ev(a, () => document.querySelector('[data-ppa-overdue-card]').click());
  check(await ev(a, () => ppaFilter === 'overdue' && document.querySelectorAll('[data-ppa-overdue-list] [data-ppa-row]').length === 3 && /Overdue · 3/.test(document.querySelector('[data-ppa-filter="overdue"]').textContent)), 'tap it: the Overdue list (3)');
  await shot(a, 'ao-overdue');
  await ev(a, () => setPpaFilter('all'));
  check(await ev(a, () => homeAttention().some(x => x.key === 'ppa-overdue' && /Overdue: 3 activities/.test(x.text))), 'AO’s Home: “Overdue: 3 activities to mark Done or move”');
  await sleep(600);
  check((await notifs(a, /^Overdue/)).length === 0, 'just added by the AO (filling in the plan): no reminder yet');
  const day = 86400000;
  check((await ev(a, d => { notifPpaOverdue(Date.now() + d); return loadNotifs().items.filter(n => /^Overdue: 3 activities to mark Done or move/.test(n.title)).length; }, 1.5 * day)) === 1, 'the next day: the AO reminded once for all (“Overdue: 3 activities to mark Done or move”)');
  check((await ev(a, d => { notifPpaOverdue(Date.now() + d); return loadNotifs().items.filter(n => /^Overdue/.test(n.title)).length; }, 1.6 * day)) === 1, 'the same day: no second reminder');
  check((await ev(a, d => { notifPpaOverdue(Date.now() + d); return loadNotifs().items.filter(n => /^Overdue/.test(n.title)).length; }, 8.6 * day)) === 2, 'a week later: reminded again');
  await until(t, () => calEvLoaded && ppaAll().some(p => p.title === 'Clean-up drive'), 'teacher has the plan', 8000);
  await until(t, () => loadNotifs().items.filter(n => /^Overdue:/.test(n.title)).length === 2, 'teacher reminded', 8000);
  const tn = await notifs(t, /^Overdue:/);
  check(tn.some(x => /Overdue: Reading camp \|.*mark it Done/.test(x)) && tn.some(x => /Parents meeting/.test(x)) && !tn.some(x => /Clean-up/.test(x)), 'teacher reminded for her 2 (not the others)');
  await until(h, () => calEvLoaded && ppaAll().length >= 6, 'head has the plan', 8000);
  check(await ev(h, () => headAttention(null, []).some(x => x.key === 'ppa-overdue' && /Overdue: 3/.test(x.text))), 'School Head: “Overdue: 3 activities…” under Needs your attention');

  out('3 the teacher marks hers Done with the report and a photo');
  await ev(t, () => { setTeacherTab('calendar'); setCalPage('plan'); });
  check(await ev(t, () => !!document.querySelector('#rqCalPane [data-ppa-overdue-card="2"]') && /with your name/.test(document.querySelector('[data-ppa-overdue-card]').textContent)), 'teacher’s Plan: “Overdue: 2 activities with your name”');
  await ev(t, id => openCalSheet('ppa', id), by('Science fair').id);
  check(await ev(t, () => !document.querySelector('[data-ppa-act="done"]') && !!document.querySelector('[data-ppa-act="suggest"]')), 'not hers, not yet due: no Mark Done (Suggest a change)');
  await ev(t, id => openCalSheet('ppa', id), by('Clean-up drive').id);
  check(await ev(t, () => !document.querySelector('[data-ppa-act="done"]') && /Waiting for the people responsible/.test(document.querySelector('[data-ppa-banner="overdue"]').textContent)), 'not hers: no Mark Done');
  await ev(t, id => openCalSheet('ppa', id), by('Reading camp').id);
  check(await ev(t, () => !!document.querySelector('[data-ppa-banner="overdue"]') && !!document.querySelector('[data-ppa-act="done"]')), 'hers: Overdue, Mark Done');
  await ev(t, () => document.querySelector('[data-ppa-act="done"]').click());
  await until(t, () => !!document.getElementById('pdSave') && !!document.getElementById('pdAddPhoto'), 'Done sheet');
  check(await ev(t, d => document.getElementById('pdOn').value === d && /budget ₱5,000\.00/.test(document.getElementById('calModalBody').textContent), iso(-3)), 'the sheet: the planned date, the budget');
  await ev(t, () => document.getElementById('pdSave').click());
  check(/Write what was done/.test(await ev(t, () => document.getElementById('calErr').textContent)), 'an accomplishment is needed');
  // a big photo from the phone's camera: made small (≤ 150 KB)
  await ev(t, async () => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const g = c.getContext('2d'), img = g.createImageData(2400, 1800);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = (i / 4) % 255; img.data[i + 2] = 120; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const blob = await (await fetch(c.toDataURL('image/png'))).blob();
    await ppaDonePick({ files: [new File([blob], 'camp.png', { type: 'image/png' })], value: '' });
  });
  await until(t, () => document.querySelectorAll('[data-pd-thumb]').length === 1, 'thumbnail', 15000);
  check(await ev(t, () => calSheet.photos[0].startsWith('data:image/jpeg') && (calSheet.photos[0].length - 23) * 0.75 <= 150 * 1024), 'photo: a JPEG of 150 KB or less');
  await ev(t, () => {
    document.getElementById('pdWhat').value = '38 of 40 Grade 4 learners read with a buddy; 12 frustration readers grouped for remedial reading.';
    document.getElementById('pdCost').value = '4,500';
    document.getElementById('pdPeople').value = '38';
    document.getElementById('pdRemarks').value = 'Held in the library because of rain';
    document.getElementById('pdSave').click();
  });
  await waitNode(() => by('Reading camp').status === 'done');
  const d1 = by('Reading camp').done;
  check(d1.byUid === tUid && d1.byName === 'Ana Reyes' && d1.cost === 4500 && d1.people === 38 && d1.photos === 1 && d1.on === iso(-3) && /library/.test(d1.remarks), 'saved: Done, the report by Ana (₱4,500, 38 participants, 1 photo)');
  await waitNode(() => !!backend.store.get(`schools/${sid}/ppaPhotos/${by('Reading camp').id}`));
  const ph = backend.store.get(`schools/${sid}/ppaPhotos/${by('Reading camp').id}`);
  check(ph.photos.length === 1 && ph.photos[0].startsWith('data:image/jpeg') && ph.byUid === tUid, 'the photo kept apart (ppaPhotos), read only when opened');
  check(/Marked Done/.test(by('Reading camp').log.slice(-1)[0].x), 'history: “Marked Done”');
  await until(t, () => !!document.querySelector('[data-ppa-done]') && !!document.querySelector('[data-ppa-act="report"]'), 'teacher sees the report');
  check(await ev(t, () => !document.querySelector('[data-ppa-act="propose-here"]') && !document.querySelector('[data-ppa-act="suggest"]')), 'done: no Suggest a change or Propose here');
  check(await ev(t, () => /Actual cost ₱4,500\.00 of ₱5,000\.00/.test(document.querySelector('[data-ppa-done-cost]').textContent)), 'the sheet: Done, ₱4,500.00 of ₱5,000.00, Change my report');
  await shot(t, 'teacher-done');
  check(await refused(t, (F, id) => F.updateDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'ppas', id), { status: 'done', done: { on: '2026-11-01', what: 'x', byUid: cloud.user.uid, byName: 'Ana Reyes' }, log: [] }), by('Clean-up drive').id), 'rules: she can’t mark someone else’s activity Done');
  check(await refused(t, (F, id) => F.updateDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'ppas', id), { status: 'done', title: 'Renamed', done: { on: '2026-11-01', what: 'x', byUid: cloud.user.uid, byName: 'Ana Reyes' } }), by('Parents meeting').id), 'rules: Done plus another change is refused');
  check(await refused(t, (F, id) => F.setDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'ppaPhotos', id), { ppaId: id, photos: [], byUid: cloud.user.uid, byName: 'Ana Reyes' }), by('Clean-up drive').id), 'rules: no photos on someone else’s activity');

  out('4 the AO: told, sees the report and the photo, undoes it');
  await until(a, () => loadNotifs().items.some(n => /^Done: Reading camp/.test(n.title)), 'AO told', 8000);
  check((await notifs(a, /^Done: Reading camp/)).some(x => /Ana Reyes · 38 of 40/.test(x)), 'AO notified: “Done: Reading camp · Ana Reyes · 38 of 40…”');
  await ev(a, id => openCalSheet('ppa', id), by('Reading camp').id);
  await until(a, () => document.querySelectorAll('[data-ppa-photos] img').length === 1, 'the photo loads', 8000);
  check(await ev(a, () => !!document.querySelector('[data-ppa-act="report"]') && !!document.querySelector('[data-ppa-act="undo-done"]') && !document.querySelector('[data-ppa-act="move"]')), 'AO: the report, the photo, Change the report · Not done');
  await shot(a, 'ao-done');
  await ev(a, () => document.querySelector('[data-ppa-photos] button').click());
  check(await ev(a, () => !document.getElementById('ppaPhotoBig').classList.contains('hidden') && !!document.querySelector('#ppaPhotoBig img')), 'tap the photo: shown big');
  await ev(a, () => document.getElementById('ppaPhotoBig').click());
  await ev(a, () => document.querySelector('[data-ppa-act="undo-done"]').click());
  await waitNode(() => by('Reading camp').status === 'planned' && by('Reading camp').done === null);
  check(/Not done after all/.test(by('Reading camp').log.slice(-1)[0].x), 'Not done: back on the plan (the report in the history)');
  await until(t, () => ppaById(ppaAll().find(p => p.title === 'Reading camp').id).status === 'planned', 'teacher sees it back');
  await ev(t, id => ppaDoneOpen(id), by('Reading camp').id);
  await until(t, () => !!document.getElementById('pdSave') && calSheet.photosReady, 'Done sheet again');
  check(await ev(t, () => (calSheet.photos || []).length === 1), 'marking it again: the photo is still there');
  await ev(t, () => { document.getElementById('pdWhat').value = 'Reading camp held; 38 learners.'; document.getElementById('pdCost').value = '4500'; document.getElementById('pdSave').click(); });
  await waitNode(() => by('Reading camp').status === 'done');
  check(true, 'the teacher marks it Done again');

  out('5 move (new date + reason) and cancel (reason)');
  await ev(a, id => ppaMoveOpen(id), by('Parents meeting').id);
  await until(a, () => !!document.getElementById('pmSave'), 'Move sheet');
  await ev(a, d => { document.getElementById('pmFrom').value = d; document.getElementById('pmTo').value = d; document.getElementById('pmSave').click(); }, iso(4));
  check(/why it is moved/.test(await ev(a, () => document.getElementById('calErr').textContent)), 'a reason is needed');
  await ev(a, () => { document.getElementById('pmWhy').value = 'Class suspension (typhoon)'; document.getElementById('pmSave').click(); });
  await waitNode(() => by('Parents meeting').from === iso(4));
  const pm = by('Parents meeting');
  check(pm.status === 'moved' && pm.moved.length === 1 && pm.moved[0].from === iso(-10) && pm.moved[0].why === 'Class suspension (typhoon)', 'moved: new date, status Moved, the old date and the reason kept');
  await until(t, () => loadNotifs().items.some(n => /^Moved: Parents meeting/.test(n.title)), 'teacher told (moved)', 8000);
  check((await notifs(t, /^Moved: Parents meeting/)).some(x => /typhoon/.test(x)), 'teacher notified: “Moved: Parents meeting · … typhoon”');
  await ev(a, id => openCalSheet('ppa', id), pm.id);
  check(await ev(a, () => /first planned/.test(document.querySelector('[data-ppa-moved]').textContent) && /typhoon/.test(document.querySelector('[data-ppa-moved]').textContent)), 'the sheet: Moved once, first planned …, the reason');
  // the Change form: a new date needs a reason too
  await ev(a, id => ppaEdit(id), by('Science fair').id);
  await fill(a, { from: iso(6) });
  check(/write why it is moved/.test(await ev(a, () => document.getElementById('calErr').textContent)), 'Change with a new date: the reason is asked');
  await ev(a, () => { document.getElementById('ppaMoveWhy').value = 'The judges are not available'; document.getElementById('ppaSave').click(); });
  await waitNode(() => by('Science fair').from === iso(6));
  check(by('Science fair').status === 'moved' && by('Science fair').moved[0].why === 'The judges are not available', 'changed: Moved, with the reason');
  a.dialogs.prompt = 'No volunteers this month';
  await ev(a, id => ppaSetStatus(id, 'cancelled'), by('Clean-up drive').id);
  await waitNode(() => by('Clean-up drive').status === 'cancelled');
  check(by('Clean-up drive').cancelWhy === 'No volunteers this month' && /Cancelled: No volunteers/.test(by('Clean-up drive').log.slice(-1)[0].x), 'cancelled with the reason');
  await until(a, () => ppaOverdueMine(calCurSy()).length === 0, 'nothing overdue', 8000);
  check(true, 'nothing overdue now');

  out('6 the monitoring report');
  check(await ev(a, () => { const p = ppaPeriods('2026-2027'); const g = k => p.find(x => x.k === k); return p.map(x => x.k).join() === 't1,t2,t3,mid,year' && g('t1').from === '2026-06-01' && g('t1').to === '2026-09-15' && g('t2').to === '2027-01-03' && g('t3').to === '2027-05-31' && g('mid').to === '2027-01-03' && g('year').from === '2026-06-01'; }), 'periods: Terms 1–3 (end to end), mid-year (to the end of Term 2), year-end');
  await ev(a, () => { setCalPage('plan'); });
  await ev(a, () => document.getElementById('ppaReportBtn').click());
  await until(a, () => !!document.querySelector('[data-ppa-periods]'), 'report sheet');
  check(await ev(a, () => document.querySelector('[data-ppa-period][aria-pressed="true"]').dataset.ppaPeriod === 't2'), 'opens on the term of today (Term 2)');
  await ev(a, () => ppaSetPeriod('year'));
  check(await ev(a, () => /^\s*33%/.test(document.querySelector('[data-ppa-rep-pct]').textContent) && /1 of 3 activities done/.test(document.getElementById('calModalBody').textContent) && /1 cancelled/.test(document.getElementById('calModalBody').textContent)), 'year-end: 33% (1 of 3 done, 1 cancelled)');
  check(await ev(a, () => /₱4,500\.00/.test(document.querySelector('[data-ppa-rep-cost]').textContent) && /2\s*Moved/.test(document.querySelector('[data-ppa-rep="moved"]').textContent)), 'actual cost ₱4,500.00 · 2 moved');
  check(await ev(a, () => /Project READ/.test(document.querySelector('[data-ppa-rep-projects]').textContent) && /50%/.test(document.querySelector('[data-ppa-rep-projects]').textContent)), 'by project: Project READ 50%');
  check(await ev(a, () => document.querySelectorAll('[data-ppa-rep-row]').length === 4 && /Target/.test(document.querySelector('[data-ppa-rep-list]').textContent)), 'activities: target and actual dates');
  await shot(a, 'ao-report');
  await ev(a, () => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await ev(a, () => ppaReportPrint());
  await until(a, () => window.__printed === 1, 'printed', 8000);
  const pr = await ev(a, () => document.getElementById('printPrSection').textContent);
  check(/MONITORING REPORT ON THE IMPLEMENTATION OF THE ANNUAL IMPLEMENTATION PLAN/.test(pr) && /Year-end report/.test(pr) && /PROGRAM: Reading Program/.test(pr) && /Project: Project READ/.test(pr), 'print: title, year-end, program and project');
  check(/Reading camp/.test(pr) && /Done/.test(pr) && /Moved: Class suspension/.test(pr) && /Cancelled: No volunteers/.test(pr) && /4,500\.00/.test(pr), 'print: each activity with status, reasons and the actual cost');
  check(await ev(a, () => /PHOTO DOCUMENTATION/.test(document.getElementById('printPrSection').textContent) && document.querySelectorAll('#printPrSection img').length === 1), 'print: the photo documentation');
  if (process.env.SHOTS) { await ev(a, () => document.body.classList.add('printing-pr')); await a.setViewport({ width: 1123, height: 794 }); await a.emulateMediaType('print'); await shot(a, 'print'); await a.emulateMediaType('screen'); await a.setViewport({ width: 390, height: 844 }); await ev(a, () => document.body.classList.remove('printing-pr')); }
  await ev(a, () => closeCalModal());
  check(await ev(t, () => !document.getElementById('ppaReportBtn')), 'teachers: no monitoring report');

  out('7 phone layout');
  check(await ev(a, () => document.documentElement.scrollWidth <= window.innerWidth + 1), 'AO: no sideways scrolling');
  check(await ev(t, () => document.documentElement.scrollWidth <= window.innerWidth + 1), 'teacher: no sideways scrolling');

  const bad = backend.denied.filter(d => !/ppa write|ppa photos write|ppa body/.test(d));
  check(!bad.length, `no refused writes besides the test’s own (${bad.join(' | ').slice(0, 400)})`);
  check(!errors.length, `no page errors (${errors.join(' | ').slice(0, 300)})`);
  await sleep(100);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('plan-done');
  await closeAll();
}
