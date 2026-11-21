// School Planning, part D5 (Nov 2026): the plan linked to PRs, leave and inventory.
//  · PR "For activity": only this school year's approved activities with a budget; picking one
//    fills the Purpose. The activity shows Budget · PRs · Left (every PR not cancelled; waiting
//    ones apart; over budget in red) to the custodian / AO and the School Head, never to teachers.
//    Make a Purchase Request from the activity. The PR approval is unchanged.
//  · Approved leaves on the calendar as "On leave: Name" (never the kind) for the AO and the head
//    (the head reads them from dashboard/summary); not for teachers; not printed.
//  · Inventory dates (physical counts, ICS / PAR renewals, useful life, relief of lost units)
//    for the custodian and the head; not for teachers; not printed.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const LAPTOP = '43211503-LAP001';
const ppas = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/ppas/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const prDocs = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/purchaseRequests/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const dashOf = sid => backend.store.get(`schools/${sid}/dashboard/summary`);
const turnOn = page => ev(page, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId); });
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: `/tmp/links-${name}.png`, fullPage: false }) : null);
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sheet = page => ev(page, () => document.getElementById('calModalBody').textContent.replace(/\s+/g, ' '));

async function fill(p, f) {
  await until(p, () => !!document.getElementById('ppaSave'), 'ppa sheet');
  await ev(p, f => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    set('ppaParent', f.parent); set('ppaTitle', f.title); set('ppaFrom', f.from); set('ppaTo', f.to || f.from); set('ppaBudget', f.budget); set('ppaSource', f.source);
    (f.who || []).forEach(n => { document.getElementById('ppa_who_in').value = n; ppaPersonAdd('who'); });
    document.getElementById('ppaSave').click();
  }, f);
}

try {
  out('1 a school with a plan: activities with and without a budget');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: ana } = await teacher(backend, sid, 'Ana Reyes');
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, ana);
  const { page: h, uid: headUid } = await schoolHead(backend, a, sid);
  for (const p of [a, t, h]) { await turnOn(p); await ev(p, () => { leaveStop(); leaveSync(); calSync(); }); }
  await ev(a, () => { calNav(); openCalendar(); });
  await until(a, () => activeMainView === 'CALENDAR' && !!document.getElementById('calLoadBtn'), 'calendar setup', 8000);
  await ev(a, () => document.getElementById('calLoadBtn').click());
  await waitNode(() => !!backend.store.get(`schools/${sid}/planYears/2026-2027`));
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-plan-links' && r.pilot === 'plan') && wnList().some(r => r.id === '2026-11-plan-links')), 'What’s new: PRs for activities, leaves and inventory dates (pilot)');
  await ev(a, () => setCalPage('plan'));
  const add = async f => { await ev(a, () => ppaNew('activity')); await fill(a, f); await waitNode(() => ppas(sid).some(p => p.title === f.title)); };
  await add({ title: 'Reading camp', from: iso(20), who: ['Ana Reyes'], budget: '5000', source: 'mooe' });
  await add({ title: 'Science fair', from: iso(30), budget: '2000', source: 'pta' });
  await add({ title: 'Flag ceremony', from: iso(7) });   // no budget
  await add({ title: 'Sports fest', from: iso(40), budget: '9000', source: 'mooe' });
  const by = title => ppas(sid).find(p => p.title === title);
  a.dialogs.prompt = 'No venue';
  await ev(a, id => ppaSetStatus(id, 'cancelled'), by('Sports fest').id);
  await waitNode(() => by('Sports fest').status === 'cancelled');
  await ev(t, () => { ppaNew('activity'); });
  await fill(t, { title: 'Teacher idea', from: iso(25), budget: '1000', source: 'mooe' });
  await waitNode(() => ppas(sid).some(p => p.title === 'Teacher idea' && p.status === 'proposed'));
  await until(a, () => calEvents.length >= 5, 'AO has all', 8000);
  check(true, 'saved: Reading camp ₱5,000, Science fair ₱2,000, Flag ceremony (no budget), Sports fest (cancelled), a teacher’s proposal');

  out('2 PR “For activity”');
  await ev(a, () => { closeCalModal(); openPrDraft({ lines: [{ id: newReqLineId(), code: null, stockNo: '', unit: 'ream', desc: 'Bond paper, A4', qty: 10, unitCost: 250 }], purpose: '' }); });
  const pick = await ev(a, () => ({ shown: !document.getElementById('prPpaWrap').classList.contains('hidden'), opts: [...document.getElementById('prPpa').options].map(o => o.textContent.split(' · ')[0]) }));
  check(pick.shown && pick.opts.join('|') === 'None|Reading camp|Science fair', `the choices: approved activities with a budget, by date (${pick.opts.join(', ')})`);
  await ev(a, id => { const s = document.getElementById('prPpa'); s.value = id; prPpaPick(id); }, by('Reading camp').id);
  const filled = await ev(a, () => ({ purpose: document.getElementById('prPurpose').value, hint: document.getElementById('prPpaHint').textContent }));
  check(/^For use in the Reading camp \(/.test(filled.purpose), `picking it fills the Purpose (“${filled.purpose}”)`);
  check(/Budget ₱5,000\.00 · PRs ₱0\.00 · Left ₱5,000\.00/.test(filled.hint), `under it: ${filled.hint}`);
  await ev(a, () => document.getElementById('prPurpose').scrollIntoView({ block: 'center' }));
  await shot(a, 'pr-form');
  await ev(a, id => { const s = document.getElementById('prPpa'); s.value = id; prPpaPick(id); }, by('Science fair').id);
  check(/^For use in the Science fair/.test(await ev(a, () => document.getElementById('prPurpose').value)), 'another activity: the Purpose follows (not typed by hand)');
  await ev(a, id => { document.getElementById('prPurpose').value = 'Reading materials for the camp'; const s = document.getElementById('prPpa'); s.value = id; prPpaPick(id); }, by('Reading camp').id);
  check(await ev(a, () => document.getElementById('prPurpose').value) === 'Reading materials for the camp', 'a Purpose typed by hand is kept');
  await ev(a, () => { document.getElementById('prNo').value = '2026-11-031'; savePr(); });
  await waitNode(() => prDocs(sid).length === 1, 'PR saved');
  const pr1 = prDocs(sid)[0];
  check(pr1.ppaId === by('Reading camp').id && pr1.ppaTitle === 'Reading camp' && pr1.approval.status === 'pending' && pr1.total === 2500, 'saved: ppaId, ppaTitle; waits for the School Head as before');
  await until(a, () => prList.length === 1, 'PR listed', 8000);
  await ev(a, () => { closePr(); switchMainView('REQUESTS'); setReqTab('prs'); });
  await until(a, () => !!document.querySelector('[data-pr-ppa]'), 'chip on the PR card', 8000);
  check(/For activity: Reading camp/.test(await ev(a, () => document.querySelector('[data-pr-ppa]').textContent)), 'PR card: “For activity: Reading camp”');

  out('3 the activity: Budget · PRs · Left');
  await ev(a, id => openCalSheet('ppa', id), by('Reading camp').id);
  await until(a, () => !!document.querySelector('[data-ppa-use]'), 'use block', 8000);
  let use = await ev(a, () => (document.querySelector('[data-ppa-use-line]').dataset.ppaUseLine + ' ' + document.querySelector('[data-ppa-use]').textContent.replace(/\s+/g, ' ')));
  check(/Budget ₱5,000\.00 · PRs ₱2,500\.00 \(₱2,500\.00 waiting\) · Left ₱2,500\.00/.test(use) && /PR No\. 2026-11-031 · waiting/.test(use), `AO: ${use.trim().slice(0, 110)}`);
  check(await ev(a, () => !!document.querySelector('[data-ppa-act="pr"]')), 'AO: Make a Purchase Request for it');
  await shot(a, 'ao-activity');
  await ev(a, () => document.querySelector('[data-ppa-act="pr"]').click());
  const draft2 = await ev(a, () => ({ open: !document.getElementById('prModal').classList.contains('hidden'), sel: document.getElementById('prPpa').value, purpose: document.getElementById('prPurpose').value, hint: document.getElementById('prPpaHint').textContent }));
  check(draft2.open && draft2.sel && /^For use in the Reading camp/.test(draft2.purpose) && /PRs ₱2,500\.00 \(₱2,500\.00 waiting\) · Left ₱2,500\.00/.test(draft2.hint), 'from the activity: a new PR with the activity and the Purpose filled in');
  await ev(a, () => { prDraft.lines.push({ id: newReqLineId(), code: null, stockNo: '', unit: 'set', desc: 'Story books', qty: 4, unitCost: 900 }); renderPrLines(); document.getElementById('prNo').value = '2026-11-032'; savePr(); });
  await waitNode(() => prDocs(sid).length === 2, 'PR 2 saved');
  await until(a, () => prList.length === 2, 'two PRs', 8000);
  // the head approves the first one (as before, in Approve)
  await until(h, () => prList.length === 2, 'head has the PRs', 8000);
  check(await ev(h, () => { setHeadTab('approve'); return /For activity: Reading camp/.test((document.querySelector('[data-head-pr] [data-pr-ppa]') || {}).textContent || ''); }), 'School Head’s PR card: “For activity: Reading camp”');
  await ev(h, id => headApplyPr(prList.find(p => p.id === id), true, ''), pr1.id);
  await waitNode(() => prDocs(sid).find(p => p.id === pr1.id).approval.status === 'approved');
  await until(a, id => prApproved(prList.find(p => p.id === id)), 'approved on the AO device', 8000, pr1.id);
  await ev(a, id => openCalSheet('ppa', id), by('Reading camp').id);
  use = await ev(a, () => (document.querySelector('[data-ppa-use-line]').dataset.ppaUseLine + ' ' + document.querySelector('[data-ppa-use]').textContent.replace(/\s+/g, ' ')));
  check(/Budget ₱5,000\.00 · PRs ₱6,100\.00 \(₱3,600\.00 waiting\) · Over by ₱1,100\.00/.test(use) && await ev(a, () => document.querySelector('[data-ppa-use]').classList.contains('border-rose-200')), `two PRs, one approved: ${use.trim().slice(0, 90)} (in red)`);
  await ev(a, async no => { const F = cloud.sdk; const p = prList.find(x => x.prNo === no); await F.updateDoc(F.doc(prCol(), p.id), { status: 'cancelled', cancelledMs: Date.now() }); }, '2026-11-032');
  check(await until(a, () => /PRs ₱2,500\.00 · Left ₱2,500\.00/.test((document.querySelector('[data-ppa-use-line]') || { dataset: {} }).dataset.ppaUseLine || ''), 'cancelled PR left out', 8000) !== false
    && /PRs ₱2,500\.00 · Left ₱2,500\.00/.test(await ev(a, () => document.querySelector('[data-ppa-use-line]').dataset.ppaUseLine)), 'a cancelled PR does not count (the open sheet updates): Left ₱2,500.00');
  await ev(h, () => setHeadTab('plan'));
  await until(h, id => ppaById(id) && prList.length === 2, 'head data', 8000, by('Reading camp').id);
  await ev(h, id => openCalSheet('ppa', id), by('Reading camp').id);
  await until(h, () => !!document.querySelector('[data-ppa-use]'), 'head use block', 8000);
  use = await ev(h, () => (document.querySelector('[data-ppa-use-line]').dataset.ppaUseLine + ' ' + document.querySelector('[data-ppa-use]').textContent.replace(/\s+/g, ' ')));
  check(/Budget ₱5,000\.00 · PRs ₱2,500\.00 · Left ₱2,500\.00/.test(use) && !/waiting/.test(use) && !(await ev(h, () => !!document.querySelector('[data-ppa-act="pr"]'))), 'School Head: Budget ₱5,000 · PRs ₱2,500 · Left ₱2,500 (no PR button)');
  await ev(h, () => closeCalModal());
  await ev(t, () => { setTeacherTab('calendar'); setCalPage('plan'); });
  await until(t, id => !!ppaById(id), 'teacher has it', 8000, by('Reading camp').id);
  await ev(t, id => openCalSheet('ppa', id), by('Reading camp').id);
  check(await ev(t, () => !document.querySelector('[data-ppa-use]') && !/PRs ₱/.test(document.getElementById('calModalBody').textContent) && ppaBudgetUse(ppaById(calSheet.key)) === null), 'teacher: no PRs or Left (only the budget as before)');
  await ev(t, () => closeCalModal());

  out('4 approved leaves: “On leave: Name” for the AO and the head');
  await ev(a, async (ana, headUid) => {
    const F = cloud.sdk, col = F.collection(cloud.db, 'schools', reqRole.schoolId, 'leaves');
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return localISODate(x); };
    const base = { reason: '', log: [], filedMs: Date.now(), createdAt: F.serverTimestamp(), by: 'teacher' };
    await F.setDoc(F.doc(col, 'lv1'), { ...base, uid: ana, name: 'Ana Reyes', type: 'sick', status: 'approved', from: d(3), to: d(4) });
    await F.setDoc(F.doc(col, 'lv2'), { ...base, uid: 'x2', name: 'Pedro Cruz', type: 'vacation', status: 'applied', from: d(5), to: d(5) });
    await F.setDoc(F.doc(col, 'lv3'), { ...base, uid: 'x3', name: 'Maria Lim', type: 'vacation', status: 'declined', from: d(6), to: d(6) });
    await F.setDoc(F.doc(col, 'lv4'), { ...base, uid: headUid, name: 'Jose Santos', type: 'vacation', status: 'done', from: d(8), to: d(10), by: 'head' });
  }, ana, headUid);
  await until(a, () => lvList.length >= 4, 'AO has the leaves', 8000);
  await ev(a, () => { closeCalModal(); openCalendar(); setCalPage('calendar'); setCalFilter('all'); setCalMode('agenda'); });
  await until(a, () => document.querySelectorAll('[data-cal-kind="leave"]').length === 2, 'leave rows', 8000);
  const lvRows = await ev(a, () => [...document.querySelectorAll('[data-cal-kind="leave"]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check(lvRows.some(x => /On leave: Ana Reyes/.test(x)) && lvRows.some(x => /On leave: Jose Santos/.test(x)), `AO calendar: approved leaves only (${lvRows.map(x => x.slice(0, 26)).join(' / ')})`);
  check(!lvRows.some(x => /sick|vacation/i.test(x)) && !(await ev(a, () => /Pedro Cruz|Maria Lim/.test(document.getElementById('calBody').textContent))), 'never the kind of leave; applied and declined leaves are left out');
  check(await ev(a, () => !!document.querySelector('[data-cal-filter="leave"]') && !!document.querySelector('[data-cal-filter="inv"]')), 'chips: On leave, Inventory');
  await ev(a, () => document.querySelector('[data-cal-kind="leave"]').click());
  const lvSheet = await sheet(a);
  check(/On leave: Ana Reyes/.test(lvSheet) && /Approved leave/.test(lvSheet) && !/sick/i.test(lvSheet) && /Only the School Head and the AO/.test(lvSheet), 'tap it: who and when, “Approved leave”, no kind');
  await shot(a, 'ao-leave');
  await ev(a, () => closeCalModal());
  check(await ev(a, () => cprEntries({ show: { nat: 1, holiday: 1, off: 1, exam: 1, event: 1, act: 1, sy: 1 }, mine: false }).every(e => !e.priv)), 'the printed calendar: no leaves or inventory dates');
  await waitNode(() => (dashOf(sid) || {}).lv && dashOf(sid).lv.length === 2, 12000);
  check(dashOf(sid).lv.every(l => Object.keys(l).sort().join() === 'f,n,t'), 'dashboard/summary: name and dates only (no kind)');
  await ev(h, () => { setHeadTab('plan'); setCalPage('calendar'); setCalFilter('all'); setCalMode('agenda'); renderHeadView(); });
  await until(h, () => document.querySelectorAll('#hdBody [data-cal-kind="leave"]').length === 2, 'head leave rows', 10000);
  check(true, 'School Head’s calendar: On leave: Ana Reyes, On leave: Jose Santos');
  await ev(t, () => { setTeacherTab('calendar'); setCalPage('calendar'); setCalFilter('all'); renderTeacherCalendar(); });
  check(await ev(t, () => !document.querySelector('[data-cal-kind="leave"]') && !document.querySelector('[data-cal-kind="inv"]') && calPrivEntries(calCurSy()).length === 0 && !document.querySelector('[data-cal-filter="leave"]')), 'teacher: no leaves or inventory dates (not even her own approved leave)');

  out('5 inventory dates for the custodian and the head');
  await ev(a, l => { openUnitsModal(l); generateUnitTags(); closeUnitsModal(); }, LAPTOP);
  await ev(a, (uid, l) => { openRelease({ teacherUid: uid, lines: [{ code: l, qty: 3 }], purpose: 'Grade 4' }); __fillSerials(); confirmRelease(); closeRelease(); }, ana, LAPTOP);
  await until(a, () => releaseList.length >= 1, 'release saved', 8000);
  await ev(a, l => {
    const held = getUnits(l).filter(u => u.toUid), today = localISODate();
    held[0].icsDate = isoAddMonths(today, -40);   // older than 3 years: renewal overdue
    held[1].icsDate = isoAddMonths(today, -30); held[1].acq = isoAddMonths(today, -54); held[1].life = '5 years';   // renewal in 6 months; useful life ends in 6 months
    held[2].icsDate = today; held[2].lostMs = Date.now() - 5 * 864e5;   // lost 5 days ago: relief due in 25 days
    saveState();
  }, LAPTOP);
  const ic = await ev(a, () => invCalList().map(r => `${r.k}:${r.o ? 'over' : r.f}:${r.c}:${r.x}`));
  check(ic.some(x => /^renew:over:1:Ana Reyes/.test(x)) && ic.some(x => /^renew:\d{4}-\d\d-\d\d:1:Ana Reyes/.test(x)) && ic.some(x => /^life:\d{4}/.test(x)) && ic.some(x => /^relief:\d{4}-\d\d-\d\d:1:/.test(x)), `inventory dates: ${ic.join(' / ')}`);
  await ev(a, () => { setCalFilter('inv'); calPaint(); });
  const invRows = await ev(a, () => [...document.querySelectorAll('[data-cal-kind="inv"]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check(invRows.some(x => /ICS \/ PAR renewal overdue: 1 unit/.test(x)) && invRows.some(x => /ICS \/ PAR renewal due: 1 unit/.test(x)) && invRows.some(x => /Useful life ends:/.test(x)) && invRows.some(x => /Relief application due:/.test(x)),
    `custodian: Inventory filter (${invRows.length}): renewal overdue / due, useful life, relief`);
  check(await ev(a, () => calViewEntries(calCurSy()).some(e => e.inv === 'count' && /Year-end physical count/.test(e.title) && e.from === '2026-12-31') && calViewEntries(calCurSy()).some(e => e.inv === 'count' && e.from === '2026-06-30')), 'the physical counts: year-end (31 Dec) and semestral (30 Jun)');
  await ev(a, () => [...document.querySelectorAll('[data-cal-kind="inv"]')].find(x => /renewal overdue/.test(x.textContent)).click());
  const invSheet = await sheet(a);
  check(/Overdue/.test(invSheet) && /Held by\s*Ana Reyes/.test(invSheet) && await ev(a, () => !!document.querySelector('[data-cal-act="inv-open"]')), 'tap it: Overdue, held by Ana Reyes, Open Year-end');
  await shot(a, 'ao-inventory');
  await ev(a, () => document.querySelector('[data-cal-act="inv-open"]').click());
  check(await ev(a, () => !document.getElementById('yearEndModal').classList.contains('hidden')), 'Open Year-end opens it');
  await ev(a, () => { closeYearEnd(); setCalFilter('all'); });
  await waitNode(() => ((dashOf(sid) || {}).ic || []).some(r => r.k === 'relief'), 12000);
  check(dashOf(sid).ic.some(r => r.k === 'renew' && r.o === 1), 'dashboard/summary: the inventory dates for the head');
  await ev(h, () => { setCalFilter('inv'); renderHeadView(); });
  await until(h, () => document.querySelectorAll('#hdBody [data-cal-kind="inv"]').length >= 4, 'head inventory rows', 10000);
  const hInv = await ev(h, () => [...document.querySelectorAll('#hdBody [data-cal-kind="inv"]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check(hInv.some(x => /renewal overdue/.test(x)) && hInv.some(x => /Relief application due/.test(x)) && hInv.some(x => /physical count/.test(x)), `School Head: inventory dates on the calendar (${hInv.length})`);
  await ev(h, () => [...document.querySelectorAll('#hdBody [data-cal-kind="inv"]')].find(x => /Relief/.test(x.textContent)).click());
  check(await ev(h, () => /Relief application due/.test(document.getElementById('calModalBody').textContent) && !document.querySelector('[data-cal-act="inv-open"]')), 'head: tap it to see it (no Open button)');
  await shot(h, 'head-inventory');
  await ev(h, () => closeCalModal());

  out('6 Plan off: nothing extra');
  check(await ev(a, () => { localStorage.removeItem(PLAN_PILOT_KEY); const r = dashPlanBits(); openPrDraft({ lines: [], purpose: '' }); const hidden = document.getElementById('prPpaWrap').classList.contains('hidden'); closePr(); localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); return !Object.keys(r).length && hidden; }), 'without the Plan: no For activity on the PR, nothing extra on the dashboard');

  check(backend.denied.length === 0, `no refusals (${backend.denied.slice(-1)[0] || 'none'})`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('plan-links');
}
