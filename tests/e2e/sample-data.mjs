// More → Load sample data: sample items plus sample teachers (slips, counts, reports) to try the
// Teachers page; nothing about the sample teachers reaches the school's account; Clear sample
// data removes them and puts the sample items back as they were.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const cloudDocs = re => backend.docs('schools/').filter(d => re.test(d.path));
const names = page => ev(page, () => [...document.querySelectorAll('#tvList [data-tvrow]')].map(r => r.querySelector('.block.text-sm').textContent));

try {
  out('1 custodian signs in, one real teacher joins');
  const a = await openPhone('custodian', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  // a real item counted before the sample (must survive Clear)
  await ev(a, () => { const it = items.find(i => i.code === '44121708-MW-B01'); it.qty = 7; userState[it.code] = { ...(userState[it.code] || {}), qty: 7 }; const o = items.find(i => i.code === '14111507-PP-M02'); o.qty = 3; userState[o.code] = { ...(userState[o.code] || {}), qty: 3 }; saveStateWith({}); });

  out('2 More → Load sample data');
  await ev(a, () => openMoreMenu());
  await sleep(150);
  check(await ev(a, () => document.getElementById('moreSampleClear').classList.contains('hidden')), 'no Clear button before loading');
  await a.click('#moreSampleLoad');
  await until(a, () => !!sampleStore(), 'sample loaded', 5000);
  await sleep(300);
  await ev(a, () => openTeachersView());
  await sleep(300);
  const list = await names(a);
  check(['Ana Reyes', 'Ben Cruz', 'Carla Mendoza', 'Liza Ramos', 'Pedro Santos', 'A. Reyes'].every(n => list.includes(n)), `sample teachers listed (${list.join(', ')})`);
  const txt = await ev(a, () => document.getElementById('tvList').innerText);
  check((txt.match(/to confirm/g) || []).length === 1 && /1 to confirm/.test(txt) && /1 open/.test(txt) && /Counted \d{4}: 2 of 2/.test(txt) && /No account/.test(txt), 'to confirm, open reports, counted, no account');
  check(await ev(a, () => [...document.querySelectorAll('[data-tvcond]')].map(b => b.innerText).join(' ')).then(t => /for repair/.test(t) && /unserviceable/.test(t)), 'condition summaries link to the IIRUP');
  check(await ev(a, () => !!document.getElementById('tvUsageBtn') && !document.getElementById('tvUsageBtn').disabled), 'Supply usage has data');
  const inbox = await ev(a, () => { openTeachersView(null); return document.getElementById('tvReview').innerText; });
  check(/Ben Cruz.*counted their items/s.test(inbox) && /1 broken/.test(inbox) && /Carla Mendoza/.test(inbox) && /Marco Villanueva/.test(inbox), 'To review: Ben’s count (1 broken), Carla’s report, Marco wants to join');
  await ev(a, () => openMoreMenu());
  check(await ev(a, () => !document.getElementById('moreSampleClear').classList.contains('hidden') && /loaded/.test(document.getElementById('moreSampleLoad').innerText)), 'More: “Sample data loaded” and Clear sample data');
  await ev(a, () => closeMoreMenu());

  out('3 trying things on the sample teachers stays on this phone');
  const ana = 'sample-ana';
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  const remindTxt = await ev(a, () => document.getElementById('tvRemind').innerText);
  check(/ICS SAMPLE-ICS-\d+ not confirmed for 12 days$/m.test(remindTxt), `Ana: “${remindTxt.split('\n')[0]}”`);
  await a.click('#tvRemindBtn');
  await sleep(300);
  check(await ev(a, () => sampleStore().releases.some(r => r.remindMs)), 'Remind recorded on the sample slip');
  await ev(a, () => { const x = tReports.find(r => r.kind === 'count' && r.sample); resolveTeacherReport(x.id, 'repair'); });
  await sleep(300);
  check(await ev(a, () => sampleStore().reports.find(r => r.kind === 'count').status === 'done'), 'Ben’s count answered (Mark broken for repair)');
  const liza = 'sample-liza';
  await ev(a, uid => { openTeachersView(uid); toggleClearance(uid); }, liza);
  await sleep(200);
  check(await ev(a, () => document.getElementById('tvClearance').dataset.clear) === 'ok', 'Liza: nothing left · cleared');
  await a.click('#tvCertBtn');
  await sleep(200);
  check(/CERTIFICATE OF NO PROPERTY ACCOUNTABILITY/.test(await ev(a, () => document.getElementById('printPrSection').innerText)), 'her certificate prints');
  const pedro = await ev(a, () => accountabilityPeople().find(p => p.name === 'Pedro Santos').key);
  await ev(a, k => { openTeachersView(k); toggleClearance(k); }, pedro);
  await sleep(150);
  await a.click('#tvTakeAll');
  await sleep(400);
  check(await ev(a, () => sampleStore().releases.some(r => r.source === 'taken-back' && r.teacherName === 'Pedro Santos')), 'Take back all: the RRSP stays with the sample');
  const areyes = await ev(a, () => accountabilityPeople().find(p => p.name === 'A. Reyes').key);
  await ev(a, k => openTeachersView(k), areyes);
  await sleep(150);
  await a.click('#tvMergeBtn');
  await sleep(200);
  await a.click(`#pickList [data-pick="${ana}"]`);
  await sleep(400);
  check(await ev(a, () => !accountabilityPeople().some(p => p.name === 'A. Reyes') && accountabilityPeople().find(p => p.key === 'sample-ana').equipment.length === 3), 'merge: “A. Reyes” → Ana Reyes (3 units)');
  await sleep(1500);
  check(cloudDocs(/\/(releases|teacherReports|members)\//).length === 0, `nothing about sample teachers in the account (${cloudDocs(/\/(releases|teacherReports|members)\//).map(d => d.path).join(', ')})`);
  check(await ev(a, () => !loadNotifs().items.some(n => /Ana Reyes|Ben Cruz|Carla|Liza/.test(n.title + n.body))), 'no notifications about sample teachers');

  out('4 Clear sample data');
  await ev(a, () => openMoreMenu());
  await a.click('#moreSampleClear');
  await until(a, () => !sampleStore(), 'cleared', 5000);
  await sleep(300);
  await ev(a, () => openTeachersView());
  await sleep(200);
  check(await ev(a, () => accountabilityPeople().length) === 0, 'Teachers page is empty again');
  check(await ev(a, () => releaseList.length === 0 && tReports.length === 0 && memberList.every(m => !m.sample)), 'no sample slips, reports or members left');
  const left = await ev(a, () => ({ dsk: items.find(i => i.code === '43211507-DSK001').qty, units: allTaggedUnits().length, mw: items.find(i => i.code === '44121708-MW-B01').qty, pp: items.find(i => i.code === '14111507-PP-M02').qty }));
  check(left.dsk === 0 && left.units === 0, `sample items back to how they were (desktops ${left.dsk}, tags ${left.units})`);
  check(left.mw === 7 && left.pp === 3, `items counted before the sample are back (markers ${left.mw}, bond paper ${left.pp})`);
  check(await ev(a, () => document.getElementById('moreSampleClear').classList.contains('hidden')), 'Clear button hidden again');
  await until(a, () => invStatus.state === 'synced', 'account updated', 10000);
  check(await ev(a, () => invStatus.state) === 'synced', 'the account has the cleared inventory');
  check(backend.denied.length === 0, `no refused writes (${backend.denied.length}) ${backend.denied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('sample-data');
  await closeAll();
}
