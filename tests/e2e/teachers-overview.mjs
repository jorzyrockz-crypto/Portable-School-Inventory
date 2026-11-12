// "Released to teachers": who holds what (incl. names typed without an account), what each
// teacher confirmed, open reports, take back, and the printed summary of accountability.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const rels = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
async function release(a, uid, lines) {
  await ev(a, (uid, lines) => openRelease({ teacherUid: uid, lines }), uid, lines);
  await sleep(200);
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
}
const bodyText = page => ev(page, () => document.getElementById('viewTeachers').innerText);

try {
  out('1 works before signing in: names typed under Assigned to');
  const a = await openPhone('custodian', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  const P = '45111609-MM-P01', D = '45121517-DO-C02', S = '12191601-AL-E04';
  await ev(a, codes => { loadSampleInventory(); schoolInfo.custodian = 'Rosa Villanueva'; codes.forEach(c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }); }, [P, D]);
  const pedroUnit = await ev(a, c => { const u = getUnits(c)[3]; setUnitField(c, u.id, 'to', 'Pedro Santos'); setUnitField(c, u.id, 'serial', 'PJ-88213'); return { id: u.id, no: u.no }; }, P);
  await ev(a, () => { openMoreMenu(); });
  await sleep(150);
  await a.click('button[onclick="closeMoreMenu(); openTeachersView()"]');
  await sleep(200);
  let txt = await bodyText(a);
  check(/Released to teachers/.test(txt) && /Pedro Santos/.test(txt) && /No account/.test(txt), 'More → Released to teachers lists Pedro Santos (no account)');

  out('2 sign in, Ana joins, releases');
  await ev(a, () => { openRequestsView(); gateGo('custodian'); }); // signed out: the sign-in screen carries the form
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const t = await openPhone('teacher-ana', backend);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinBtn').disabled, 'join');
  await ev(t, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 7 – Science'; });
  await t.click('#joinBtn');
  await until(t, () => reqRole && reqRole.role === 'teacher' && cloud.user, 'joined');
  const ana = await ev(t, () => cloud.user.uid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'roster', 8000, ana);
  await release(a, ana, [{ code: S, qty: 5 }, { code: P, qty: 2 }]);
  await until(t, () => myReleases.length === 2, 'Ana sees releases', 8000);
  await ev(t, () => ackRelease(myReleases.find(r => r.kind === 'ICS').id));
  await until(a, () => tReports.some(x => x.kind === 'received'), 'ack arrives', 8000);

  out('3 the list');
  await ev(a, () => openTeachersView());
  await sleep(300);
  check(await ev(a, () => !!document.querySelector('#reqViewActions button[onclick="openTeachersView()"]')), 'Teachers button on Supply requests');
  txt = await bodyText(a);
  check(/Ana Reyes/.test(txt) && /Pedro Santos/.test(txt), 'Ana and Pedro listed');
  const anaRow = await ev(a, uid => document.querySelector(`button[onclick="openTeachersView('${uid}')"]`).innerText, ana);
  check(/\b2\b/.test(anaRow) && /units/i.test(anaRow) && /1 to confirm/.test(anaRow), `Ana: 2 units, 1 slip to confirm (“${anaRow.replace(/\s+/g, ' ')}”)`);
  check(/2 people · 3 equipment units/.test(txt), 'header: 2 people · 3 equipment units');
  await ev(a, () => { const i = document.getElementById('tvSearch'); i.focus(); i.value = 'PJ-882'; setTeachersQuery(i.value); });
  txt = await ev(a, () => document.getElementById('tvBody').innerText);
  check(/Pedro Santos/.test(txt) && !/Ana Reyes/.test(txt), 'search by serial finds Pedro only');
  check(await ev(a, () => document.activeElement.id === 'tvSearch'), 'search box keeps focus while the list updates');
  await ev(a, () => { setTeachersQuery(''); document.getElementById('tvSearch').value = ''; document.activeElement.blur(); });
  await a.screenshot({ path: '/tmp/e2e_tv_list.png' });

  out('4 Ana’s page');
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  txt = await bodyText(a);
  check(/All teachers/.test(txt) && /has the app/.test(txt), 'detail header');
  check((txt.match(/MULTIMEDIA PROJECTOR/g) || []).length >= 2 && (txt.match(/Confirmed/g) || []).length >= 2, 'both projectors, confirmed by Ana');
  check(/RIS No\. \d{4}-\d{2}-001/.test(txt) && /Not confirmed yet/.test(txt) && /5 bottle ALCOHOL/.test(txt), 'RIS listed, not confirmed yet');
  check(/History/i.test(txt) && /Released · RIS/.test(txt) && /Released · ICS/.test(txt), 'history shows both releases');
  await a.screenshot({ path: '/tmp/e2e_tv_detail.png', fullPage: true });

  out('5 open report shows up');
  await ev(t, () => { const r = myReleases.find(x => x.kind === 'ICS'); openTeacherReport('problem', r.id, r.lines[0].units[0].id); sendTeacherReport(); });
  await until(a, () => /1 open report/.test(document.getElementById('viewTeachers').innerText), 'open report banner', 8000);
  check(true, 'Ana’s page: “1 open report”');

  out('6 take back');
  const anaUnits = await ev(a, (c, uid) => getUnits(c).filter(u => u.toUid === uid).map(u => u.id), P, ana);
  await ev(a, (c, id) => takeBackUnit(c, id), P, anaUnits[1]);
  await sleep(300);
  const u = await ev(a, (c, id) => getUnits(c).find(x => x.id === id), P, anaUnits[1]);
  check(!u.to && !u.toUid, 'unit back in stock, unassigned');
  check(await ev(a, () => document.querySelectorAll('[data-tunit]').length) === 1, 'Ana’s page now shows 1 unit');
  await waitNode(() => rels().some(r => r.kind === 'RETURN' && r.source === 'taken-back'), 'taken-back record');
  check(rels().some(r => r.kind === 'RETURN' && r.source === 'taken-back' && r.teacherUid === ana), 'return record for Ana');
  await until(t, () => document.getElementById('rqItemsCount').textContent === '1', 'Ana’s phone updates', 8000);
  check(true, 'Ana’s phone now lists 1 item');
  check(/Taken back/.test(await bodyText(a)), 'history: Taken back');

  out('7 My Items chip opens the person');
  await release(a, ana, [{ code: D, qty: 1 }]);
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(200);
  const sel = await ev(a, uid => !!document.querySelector(`#masterLedgerSection button[onclick="openTeachersView('${uid}')"]`), ana);
  check(sel, 'chip “With Ana Reyes” links to her page');
  await a.click(`#masterLedgerSection button[onclick="openTeachersView('${ana}')"]`);
  await sleep(200);
  check(await ev(a, () => activeMainView === 'TEACHERS' && /Ana Reyes/.test(document.getElementById('tvHead').innerText)), 'opened Ana’s page');

  out('8 print accountability');
  await ev(a, uid => printAccountability(uid), ana);
  await sleep(200);
  let pr = await ev(a, () => document.getElementById('printPrSection').innerText);
  check(/SUMMARY OF ACCOUNTABILITY/.test(pr) && /ANA REYES/.test(pr) && /DOCUMENT CAMERA/.test(pr) && /MULTIMEDIA PROJECTOR/.test(pr) && /ALCOHOL/.test(pr), 'one person: equipment and supplies');
  check(/ROSA VILLANUEVA/.test(pr) && /Certified correct/.test(pr), 'signature block');
  await ev(a, () => document.body.classList.add('printing-pr'));
  await a.emulateMediaType('print');
  await a.screenshot({ path: '/tmp/e2e_tv_print.png' });
  await a.emulateMediaType('screen');
  await ev(a, () => document.body.classList.remove('printing-pr'));
  await ev(a, () => printAccountability());
  await sleep(200);
  check(await ev(a, () => document.querySelectorAll('#printPrSection .acct-page').length) === 2, 'Print all: one page each for Ana and Pedro');
  pr = await ev(a, () => document.getElementById('printPrSection').innerText);
  check(/PEDRO SANTOS/.test(pr) && pr.includes(pedroUnit.no) && /PJ-88213/.test(pr), 'Pedro’s page has his projector with serial');
  check(await ev(a, () => window.__printed) === 2, 'print dialog opened');

  out('9 release more');
  await ev(a, uid => openTeachersView(uid), ana);
  await a.click('button[onclick^="openRelease({ teacherUid"]');
  await sleep(200);
  check(await ev(a, uid => releaseDraft && releaseDraft.teacherUid === uid && /Ana Reyes/.test(document.getElementById('relTeacher').selectedOptions[0].textContent), ana), 'Release more: Ana preselected');
  await ev(a, () => closeRelease());

  const appDenied = backend.denied;
  check(appDenied.length === 0, `no refused writes or reads (${appDenied.length}) ${appDenied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('teachers-overview');
  await closeAll();
}
