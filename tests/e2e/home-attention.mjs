// The custodian's Home: Needs your attention (Nov 2026). Lost units with the days left for relief,
// supply requests and teacher reports waiting, slips teachers have not marked Received, items
// waiting for the School Head, ICS / PAR older than 3 years, bond ending, long repairs, low and
// out-of-stock supplies; each a tap away, the first 5 with Show all. Teachers never see it.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary, errors } from './lib/harness.mjs';
import { custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const LAPTOP = '43211503-LAP001';
const keys = page => ev(page, () => [...document.querySelectorAll('#homeAttention [data-hatt]')].map(e => e.dataset.hatt));
const boxText = page => ev(page, () => document.getElementById('homeAttention').innerText);
const refresh = page => ev(page, () => { switchMainView('HOME'); renderHomeAttention(); });

try {
  out('1 a new phone with nothing encoded: no attention box');
  const fresh = await openPhone('fresh', backend);
  await fresh.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await ev(fresh, () => document.getElementById('homeAttention').classList.contains('hidden')), 'hidden with no items');
  await fresh.close();

  out('2 custodian with the sample inventory and a teacher');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: ana } = await teacher(backend, sid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, ana);
  await refresh(a);
  check(await ev(a, () => !document.getElementById('homeAttention').classList.contains('hidden')), 'Home shows Needs your attention');
  let k = await keys(a);
  out(`   start: ${k.join(', ')}`);
  check(k.length >= 1, 'at least one line or All clear');

  out('3 equipment released to Ana; one unit lost 25 days ago, slip 5 days old');
  await ev(a, (uid, l) => { openRelease({ teacherUid: uid, lines: [{ code: l, qty: 2 }], purpose: 'Grade 4' }); __fillSerials(); confirmRelease(); closeRelease(); }, ana, LAPTOP);
  await until(a, () => releaseList.length >= 1, 'release saved', 8000);
  await ev(a, l => {
    const held = getUnits(l).filter(u => u.toUid);
    held[0].lostMs = Date.now() - 25 * 864e5;
    held[1].icsDate = '2021-06-01';
    saveState();
    releaseList = releaseList.map(r => ({ ...r, createdMs: Date.now() - 5 * 864e5 }));
  }, LAPTOP);
  await refresh(a);
  k = await keys(a);
  let txt = await boxText(a);
  check(k[0] === 'lost', `lost unit first (${k.join(', ')})`);
  check(/Lost: .+ \(with Ana Reyes\)/.test(txt) && /5 days left to apply for relief/.test(txt), '“Lost: … (with Ana Reyes) · 5 days left to apply for relief”');
  check(k.includes('unconf') && /1 slip not yet marked Received by teachers/.test(txt) && /Ana Reyes/.test(txt), 'slip not yet marked Received (5 days old)');
  check(k.includes('renew') && /1 unit on an ICS \/ PAR older than 3 years/.test(txt), 'ICS older than 3 years');

  out('4 bond ending, a request and a teacher report waiting, a long repair');
  await ev(a, l => {
    const z = new Date(Date.now() + 10 * 864e5);
    schoolInfo.bondUntil = localISODate(z);
    reqList = [...reqList, { id: 'rq-old', name: 'Juan Dela Cruz', status: 'pending', clientAt: Date.now() - 4 * 864e5, lines: [] }];
    const u = getUnits('45111609-MM-P01')[0] || null;
    if (u) { u.cond = 'R'; u.condAt = Date.now() - 40 * 864e5; }
  });
  await ev(t, () => setTeacherTab('items'));
  await until(t, () => myReleases.length === 1, 'Ana’s slip', 8000);
  await ev(t, () => { const r = myReleases[0]; const x = teacherHoldings(myReleases).equipment.find(e => !e.unit.lostMs); openTeacherReport('return', r.id, x.unit.id); sendTeacherReport(); });
  await until(a, () => openTeacherReports().length === 1, 'report in', 8000);
  await ev(a, () => { tReports = tReports.map(x => ({ ...x, createdMs: Date.now() - 4 * 864e5 })); });
  await refresh(a);
  k = await keys(a);
  txt = await boxText(a);
  check(/Your fidelity bond ends in 10 days/.test(await ev(a, () => homeAttention().map(x => x.text).join('|'))), 'bond ends in 10 days');
  const all = await ev(a, () => homeAttention().map(x => x.key));
  check(all.includes('reqs'), 'supply request waiting more than 2 days');
  check(all.includes('reports'), 'teacher report waiting more than 3 days');
  check(await ev(a, () => homeAttention().find(x => x.key === 'reports').sub.includes('1 return')), 'says it is a return');
  check(all.includes('repair') === (await ev(a, () => getUnits('45111609-MM-P01').length > 0)), 'long repair listed (when the unit exists)');

  await ev(a, () => window.scrollTo(0, 0));
  await a.setViewport({ width: 390, height: 1100 });
  await refresh(a);
  await a.screenshot({ path: '/tmp/e2e_home_att.png' });
  await a.setViewport({ width: 1100, height: 900 });
  out('5 first 5, then Show all');
  const n = all.length;
  check(n > 5 && k.length === 5, `${n} lines, 5 shown`);
  check(/Show all/.test(txt) && new RegExp(`· ${n}`).test(txt), `heading “Needs your attention · ${n}” and Show all`);
  await ev(a, () => document.getElementById('homeAttMore').click());
  check((await keys(a)).length === n, 'Show all shows every line');
  await ev(a, () => document.getElementById('homeAttMore').click());
  check((await keys(a)).length === 5, 'Show less');

  out('6 taps');
  await ev(a, () => document.querySelector('[data-hatt="lost"] button').click());
  check(await ev(a, () => activeMainView === 'TEACHERS' && teachersFilter === 'lost'), 'Lost opens Teachers with the Lost filter');
  await ev(a, () => { teachersFilter = 'all'; homeAttAll = true; switchMainView('HOME'); renderHomeAttention(); });
  await ev(a, () => document.querySelector('[data-hatt="renew"] button').click());
  check(await ev(a, () => yeIsOpen()), 'ICS renewal opens Year-end & reminders');
  await ev(a, () => { closeYearEnd(); switchMainView('HOME'); renderHomeAttention(); });
  await ev(a, () => document.querySelector('[data-hatt="reqs"] button').click());
  check(await ev(a, () => activeMainView === 'REQUESTS'), 'requests waiting opens Supply requests');

  out('7 the teacher’s phone never shows it');
  check(await ev(t, () => { renderHomeAttention(); return document.getElementById('homeAttention').classList.contains('hidden'); }), 'hidden on a teacher’s phone');

  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('home-attention');
}
