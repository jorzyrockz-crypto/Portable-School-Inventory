// Useful life of ICS / PAR property (Nov 2026): end of useful life from the date acquired (or the
// ICS / PAR date) and the useful life; past / ending within 12 months / checked; the Home card and
// Needs your attention row; the Useful life sheet (Still serviceable, Unserviceable → IIRUP, Dates,
// Use the ICS date, Print); the monthly notification; a teacher's Working / Not working on their
// phone (applied on the custodian's device); the Teachers page; the School Head's School tab.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const LAPTOP = '43211503-LAP001';
const dashOf = sid => backend.store.get(`schools/${sid}/dashboard/summary`);
const reportsOf = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/teacherReports/`)).map(([, v]) => v);

try {
  out('1 a school: laptops acquired in 2019 (5 years), three released to Ana; one ends in 6 months, one is new');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: ana } = await teacher(backend, sid, 'Ana Reyes');
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, ana);
  const { page: h } = await schoolHead(backend, a, sid);
  await ev(a, l => { openUnitsModal(l); generateUnitTags(); closeUnitsModal(); }, LAPTOP);
  check(await ev(a, l => getUnits(l).length >= 3, LAPTOP), 'laptops tagged');
  await ev(a, l => { getUnits(l).forEach(u => { u.acq = '2019-01-15'; u.life = '5 years'; }); saveState(); }, LAPTOP);
  await ev(a, (uid, l) => { openRelease({ teacherUid: uid, lines: [{ code: l, qty: 3 }], purpose: 'Grade 4' }); __fillSerials(); confirmRelease(); closeRelease(); }, ana, LAPTOP);
  await until(a, () => releaseList.length >= 1, 'release saved', 8000);
  const ids = await ev(a, l => {
    const held = getUnits(l).filter(u => u.toUid);
    const today = localISODate();
    held[1].acq = isoAddMonths(today, -54);            // 4½ years ago: ends in 6 months
    held[2].acq = isoAddMonths(today, -12);            // 1 year ago: in use
    getUnits(l).filter(u => !u.toUid).forEach(u => { u.acq = today; });
    saveState();
    return held.map(u => u.id);
  }, LAPTOP);
  const status = id => ev(a, x => { const f = findUnitWithItem(x); return lifeInfo(f.item, f.unit).status; }, id);
  check(await status(ids[0]) === 'past' && await status(ids[1]) === 'soon' && await status(ids[2]) === 'ok', 'past (2019 + 5 years), ending within 12 months, in use');
  check(await ev(a, x => { const f = findUnitWithItem(x); return lifeInfo(f.item, f.unit).end; }, ids[0]) === '2024-01-15', 'end of useful life: 15 Jan 2024');
  check(await ev(a, () => { const u = { icsDate: '2022-03-01' }; const li = lifeInfo({ category: 'Furniture & Furnishings' }, u); return li.est && li.from === 'ics' && li.end === '2032-03-01'; }), 'no date acquired: the ICS date, furniture 10 years, marked est.');

  out('2 Home: the Useful life card and a Needs your attention row');
  await ev(a, () => { switchMainView('HOME'); renderHome(); });
  await until(a, () => !document.getElementById('homeLifeCard').classList.contains('hidden'), 'life card', 8000);
  const st = await ev(a, () => { const s = lifeStats(); return { p: s.past.length, s: s.soon.length, c: s.cost }; });
  const card = await ev(a, () => ({ life: document.getElementById('homeLifeCard').dataset.life, sub: document.getElementById('homeLifeSub').textContent, badge: document.getElementById('homeLifeBadge').textContent }));
  check(card.life === `${st.p}/${st.s}` && st.p >= 1 && st.s >= 1, `card: ${card.sub}`);
  check(/past/.test(card.sub) && /ending within 12 months/.test(card.sub) && /to replace/.test(card.sub) && card.badge === String(st.p), 'past · ending within 12 months · to replace, red badge');
  const row = await ev(a, () => (document.querySelector('[data-hatt="life"]') || {}).textContent || '');
  check(/past (its|their) useful life · still serviceable\?/.test(row.replace(/\s+/g, ' ')), `Needs your attention: ${row.replace(/\s+/g, ' ').trim().slice(0, 120)}`);

  out('3 a teacher’s phone: Past its useful life · Working / Not working');
  await ev(t, () => { switchMainView('REQUESTER'); setTeacherTab('items'); });
  await until(t, () => document.querySelectorAll('[data-t-life]').length === 3, 'life chips on the teacher phone', 10000);
  check(await ev(t, () => /Past its useful life/.test(document.querySelector('[data-t-life]').textContent) && /Jan 2024/.test(document.querySelector('[data-t-life]').textContent)), '“Past its useful life (ended Jan 2024). Is it still working?”');
  check(await ev(t, () => /3 past useful life/.test((document.querySelector('[data-tgroup]') || {}).textContent || '')), 'the group header: 3 past useful life');
  check(await ev(t, () => !!document.querySelector('[data-t-att="life"]') && /3 items past their useful life/.test(document.querySelector('[data-t-att="life"]').textContent)), 'My Items · Needs your attention: 3 items past their useful life');
  await ev(t, id => document.querySelector(`[data-t-life="${id}"] [data-t-life-ok]`).click(), ids[0]);
  await waitNode(() => reportsOf(sid).some(r => r.kind === 'life'));
  check(backend.denied.length === 0, `the “still working” report is allowed (${backend.denied.slice(-1)[0] || 'no refusals'})`);
  await until(t, id => !document.querySelector(`[data-t-life="${id}"]`), 'chip gone', 8000, ids[0]);
  check(await ev(t, () => document.querySelectorAll('[data-t-life]').length === 2 && !!document.querySelector('[data-t-life-done]')), 'that one says “You said it still works”; 2 left to answer');
  check(await ev(t, () => !document.querySelector('[data-t-askback], [data-tunit-row] .bg-rose-50')), 'no “Reported” chip for it');
  await ev(t, id => document.querySelector(`[data-t-life="${id}"] [data-t-life-bad]`).click(), ids[2]);
  check(await ev(t, () => !document.getElementById('tReportModal').classList.contains('hidden') && tReportDraft.reason === 'unserv' && /useful life/.test(document.getElementById('trNote').value)), 'Not working: the report sheet, “Not working · beyond repair” picked');
  await ev(t, () => closeTeacherReport());

  out('4 the custodian’s device applies it: still serviceable, asked again in a year');
  await until(a, id => (findUnitWithItem(id).unit.lifeOk || 0) > 0, 'applied', 10000, ids[0]);
  check(await status(ids[0]) === 'checked' && await ev(a, id => findUnitWithItem(id).unit.lifeBy === 'Ana Reyes', ids[0]), 'unit checked, by Ana Reyes');
  await waitNode(() => reportsOf(sid).some(r => r.kind === 'life' && r.status === 'done' && r.applied));
  check(true, 'the report is closed (done)');
  check(await ev(a, () => !openTeacherReports().some(x => x.kind === 'life')), 'not listed as a report waiting for the custodian');
  check(await ev(a, () => loadNotifs().items.some(n => /Ana Reyes: still working/.test(n.title))), 'notification: “Ana Reyes: still working”');

  out('5 the Useful life sheet');
  await ev(a, id => { findUnitWithItem(id).unit.lifeOk = Date.now() - 400 * 864e5; saveState(); }, ids[0]);   // a year later: asked again
  check(await status(ids[0]) === 'past', 'a year later it is asked again');
  await ev(a, () => openLifeSheet());
  await until(a, () => !!document.querySelector('[data-life-list]'), 'sheet', 8000);
  const sheet = await ev(a, ids => ({
    tiles: [...document.querySelectorAll('[data-life-tile]')].map(x => x.dataset.lifeTile + ':' + x.textContent.replace(/\s+/g, ' ').trim()),
    rows: [...document.querySelectorAll('#lifeRows [data-life-unit]')].map(x => x.dataset.lifeUnit),
    first: (document.querySelector(`[data-life-unit="${ids[0]}"]`) || {}).textContent || '',
    cost: Number(document.querySelector('[data-life-cost]').dataset.lifeCost)
  }), ids);
  check(sheet.tiles.length === 4 && /past:\d+\s*Past/.test(sheet.tiles[0]), `tiles: ${sheet.tiles.join(' | ')}`);
  check(sheet.rows.includes(ids[0]) && sheet.rows.includes(ids[1]) && !sheet.rows.includes(ids[2]), 'Due: the past one and the one ending soon, not the new one');
  check(/Ended Jan 2024 · \d+ (years?|months?)/.test(sheet.first.replace(/\s+/g, ' ')) && /Acquired Jan 2019 · 5 years/.test(sheet.first) && /Ana Reyes/.test(sheet.first), 'row: Ended Jan 2024 · … ago, Acquired Jan 2019 · 5 years, Ana Reyes');
  check(sheet.cost > 0, `to replace in the next 12 months: ₱${sheet.cost}`);
  await ev(a, id => document.querySelector(`[data-life-unit="${id}"] [data-life-ok]`).click(), ids[0]);
  check(await status(ids[0]) === 'checked' && await ev(a, id => !document.querySelector(`[data-life-unit="${id}"]`), ids[0]), 'Still serviceable: off the Due list');
  await ev(a, () => document.querySelector('[data-life-filter="checked"]').click());
  check(await ev(a, id => /Still serviceable · checked/.test((document.querySelector(`[data-life-unit="${id}"]`) || {}).textContent || ''), ids[0]), 'under Checked: “Still serviceable · checked …”');
  await ev(a, id => { findUnitWithItem(id).unit.lifeOk = Date.now() - 400 * 864e5; saveState(); lifeView.f = 'due'; renderLifeSheet(); }, ids[0]);
  const toastTxt = await ev(a, id => { document.querySelector(`[data-life-unit="${id}"] [data-life-unserv]`).click(); return document.getElementById('appToast').textContent.replace(/\s+/g, ' '); }, ids[0]);
  check(await ev(a, id => findUnitWithItem(id).unit.cond === 'U' && !document.querySelector(`[data-life-unit="${id}"]`), ids[0]), 'Unserviceable: marked U, off the list (it goes on the IIRUP)');
  check(/IIRUP/.test(toastTxt), `toast offers the IIRUP (${toastTxt.trim()})`);

  out('6 search, filters, est. and Use the ICS date, Print');
  await ev(a, () => { lifeView.f = 'all'; renderLifeSheet(); });
  await ev(a, () => { const el = document.getElementById('lifeSearch'); el.value = 'Ana'; el.dispatchEvent(new Event('input')); });
  check(await ev(a, () => [...document.querySelectorAll('#lifeRows [data-life-unit]')].length === 2), 'search “Ana”: her 2 units left (the unserviceable one is out)');
  await ev(a, id => { const u = findUnitWithItem(id).unit; delete u.acq; u.icsDate = '2020-02-10'; saveState(); lifeView.q = ''; renderLifeSheet(); }, ids[2]);
  check(await status(ids[2]) === 'past' && await ev(a, () => !!document.querySelector('[data-life-est]') && !!document.querySelector('[data-life-icsdates]')), 'no date acquired: the ICS date (est.), and “Use the ICS / PAR date as the date acquired”');
  await ev(a, () => { lifeUseIcsDates(); });
  await until(a, id => findUnitWithItem(id).unit.acq === '2020-02-10', 'acq from the ICS date', 8000, ids[2]);
  check(a.dialogs.some(d => /Use the ICS \/ PAR date/.test(d) || /get the date of/.test(d)), 'asked first');
  await ev(a, () => { lifeView.f = 'due'; renderLifeSheet(); document.getElementById('lifePrint').click(); });
  await until(a, () => (window.__printed || 0) >= 1, 'printed', 8000);
  const pr = await ev(a, () => document.getElementById('printPrSection').textContent.replace(/\s+/g, ' '));
  check(/PROPERTY PAST OR NEAR THE END OF ESTIMATED USEFUL LIFE/.test(pr) && /End of useful life/.test(pr) && /TOTAL \(\d+\)/.test(pr) && /Noted:/.test(pr), 'print: the list with end dates, total, Prepared by / Noted');
  await ev(a, id => document.querySelector(`[data-life-unit="${id}"] [data-life-dates]`).click(), ids[1]);
  check(await ev(a, () => document.getElementById('lifeModal').classList.contains('hidden') && !document.getElementById('unitsModal').classList.contains('hidden')), 'Dates: the item’s units, to set the date acquired and useful life');
  await ev(a, () => closeUnitsModal && closeUnitsModal());

  out('7 the monthly notification, Teachers page, Year-end');
  const before = await ev(a, () => loadNotifs().items.filter(n => n.go === 'life').length);
  check(before >= 1, 'the app already sent this month’s reminder on its own');
  await ev(a, () => { const s = loadNotifs(); Object.keys(s.seen).filter(k => k.startsWith('ul:')).forEach(k => delete s.seen[k]); saveNotifs(); notifYearEnd(Date.now()); notifYearEnd(Date.now()); });
  const nf = await ev(a, () => loadNotifs().items.filter(n => n.go === 'life').map(n => `${n.title} · ${n.body}`));
  check(nf.length === before + 1 && /past (its|their) useful life/.test(nf[0]) && /to replace/.test(nf[0]), `once a month: ${nf[0]}`);
  await ev(a, () => goToNotifTarget(loadNotifs().items.find(n => n.go === 'life')));
  check(await ev(a, () => !document.getElementById('lifeModal').classList.contains('hidden') && lifeView.f === 'due'), 'tapping it opens Useful life');
  await ev(a, () => closeLifeSheet());
  check(await ev(a, () => personAttention(accountabilityPeople().find(p => p.name === 'Ana Reyes')).some(x => x.key === 'life')), 'Teachers page: Ana · units past their useful life');
  await ev(a, () => openYearEnd());
  check(await ev(a, () => !!document.querySelector('[data-ye-section="life"]') && /Open Useful life/.test(document.querySelector('[data-ye-section="life"]').textContent)), 'Year-end & reminders: a Useful life section');
  await ev(a, () => closeYearEnd());

  out('8 the School Head: the School tab');
  await ev(a, () => publishDash());
  await waitNode(() => { const d = dashOf(sid); return !!(d && d.life && d.life.t > 0 && d.life.p >= 1); }, 20000);
  const L = dashOf(sid).life;
  check(L.p >= 1 && L.s >= 1 && L.c > 0, `summary: ${L.p} past, ${L.s} soon, ${L.k} checked, ₱${L.c} to replace`);
  await until(h, () => dashDoc && dashDoc.life && dashDoc.life.t > 0, 'head summary', 12000);
  await h.click('#hdTab-school');
  await sleep(300);
  const hl = await ev(h, () => (document.querySelector('[data-head-life]') || {}).textContent || '');
  check(/Useful life of tagged units/.test(hl) && /past, to check/.test(hl) && /PPMP \/ APP/.test(hl), 'School tab: Useful life with the replacement estimate');
  check(await ev(h, () => !!document.querySelector('[data-att="life"]')), 'Needs your attention: units past their useful life');

  out('9 a phone-width window');
  await a.setViewport({ width: 390, height: 844 });
  await sleep(400);
  await ev(a, () => openLifeSheet('due'));
  await sleep(300);
  check(await ev(a, () => document.querySelector('[data-life-tile]').getBoundingClientRect().width > 120 && document.documentElement.scrollWidth <= 392), 'phone: 2 tiles per row, nothing wider than the screen');
  await a.screenshot({ path: '/tmp/life_phone.png' });
  await a.setViewport({ width: 1366, height: 860 });
  await sleep(400);
  await ev(a, () => openLifeSheet('due'));
  await sleep(300);
  await a.screenshot({ path: '/tmp/life_pc.png' });

  check(backend.denied.length === 0, `no refusals (${backend.denied.join(' | ')})`);
  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('useful-life');
}
