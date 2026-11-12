// A teacher's My Items: what was released to them (ICS equipment, RIS supplies), "Received",
// "Report a problem" and "Return", and the custodian's "From teachers" inbox resolving them.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, setOffline, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const reports = () => backend.docs('schools/').filter(d => /\/teacherReports\//.test(d.path));
const rels = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
async function joinAsTeacher(page, schoolId, name, position, office) {
  await page.goto(BASE_URL + '#join=' + schoolId, { waitUntil: 'networkidle0' });
  await until(page, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(page, (n, p, o) => { joinName.value = n; joinPosition.value = p; joinOffice.value = o; }, name, position, office);
  await page.click('#joinBtn');
  await until(page, () => reqRole && reqRole.role === 'teacher' && cloud.user, 'joined');
  return ev(page, () => cloud.user.uid);
}
async function release(a, uid, lines) {
  await ev(a, (uid, lines) => openRelease({ teacherUid: uid, lines }), uid, lines);
  await sleep(200);
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
}
const paneText = page => ev(page, () => document.getElementById('rqItemsPane').innerText);

try {
  out('1 custodian, two teachers');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rosa Villanueva'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); }); // signed out: the sign-in screen carries the form
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const P = '45111609-MM-P01', D = '45121517-DO-C02', S = '12191601-AL-E04';
  await ev(a, codes => codes.forEach(c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }), [P, D]);

  const t = await openPhone('teacher-ana', backend);
  const ana = await joinAsTeacher(t, sid, 'Ana Reyes', 'Teacher III', 'Grade 7 – Science');
  const j = await openPhone('teacher-juan', backend);
  const juan = await joinAsTeacher(j, sid, 'Juan Dela Cruz', 'Teacher I', 'Grade 9');
  check(await ev(j, () => teacherTab) === 'requests' && await ev(j, () => !document.getElementById('rqRequestsPane').classList.contains('hidden')), 'teacher with nothing released opens on Requests');
  await until(a, (x, y) => teacherRoster().filter(t => t.joined).length === 2, 'roster', 8000);

  out('2 custodian releases to Ana (RIS + ICS) and to Juan');
  await release(a, ana, [{ code: S, qty: 5 }, { code: P, qty: 2 }]);
  await release(a, juan, [{ code: D, qty: 1 }]);
  const anaUnits = await ev(a, (c, uid) => getUnits(c).filter(u => u.toUid === uid).map(u => ({ id: u.id, no: u.no })), P, ana);
  check(anaUnits.length === 2, `2 projectors with Ana (${anaUnits.map(u => u.no).join(', ')})`);

  out('3 Ana’s My Items');
  await t.reload({ waitUntil: 'networkidle0' });
  await ev(t, () => setTeacherTab('items'));
  await until(t, () => myReleases.length === 2, 'Ana’s releases', 8000);
  let txt = await paneText(t);
  check(await ev(t, () => document.getElementById('rqTitle').textContent) === 'My items', 'title: My items');
  check(/New from the property custodian/.test(txt) && (txt.match(/Received/g) || []).length >= 2, '“New from the property custodian” with 2 slips to confirm');
  check(txt.includes(anaUnits[0].no) && txt.includes(anaUnits[1].no) && /MULTIMEDIA PROJECTOR/.test(txt), 'accountable equipment: both projectors with property numbers');
  check(/Supplies received/i.test(txt) && /ALCOHOL, Ethyl, 500 mL/.test(txt) && /RIS No\./.test(txt), 'supplies received: the RIS');
  check(!/DOCUMENT CAMERA/.test(txt), 'Juan’s document camera is not on Ana’s list');
  check(await ev(t, () => document.getElementById('rqItemsCount').textContent) === '2' && await ev(t, () => !document.getElementById('rqItemsDot').classList.contains('hidden')), 'tab shows 2 items and a new-items dot');
  await t.screenshot({ path: '/tmp/e2e_t_items.png' });
  const juanTxt = await (async () => { await until(j, () => myReleases.length === 1, 'Juan releases', 8000); await ev(j, () => setTeacherTab('items')); return paneText(j); })();
  check(/DOCUMENT CAMERA/.test(juanTxt) && !/PROJECTOR/.test(juanTxt), 'Juan sees only his document camera');

  out('4 Received');
  await ev(t, () => { const r = myReleases.find(x => x.kind === 'ICS'); ackRelease(r.id); ackRelease(r.id); });
  await ev(t, () => ackRelease(myReleases.find(x => x.kind === 'RIS').id));
  await waitNode(() => reports().filter(r => r.kind === 'received').length === 2, 'acks');
  check(reports().filter(r => r.kind === 'received').length === 2 && reports().every(r => /\/ack-/.test(r.path)), 'one “received” per slip (double tap ignored)');
  await until(t, () => !/New from the property custodian/.test(document.getElementById('rqItemsPane').innerText), 'banner gone', 8000);
  txt = await paneText(t);
  check(!/New from the property custodian/.test(txt) && /Received/.test(txt), 'banner gone; RIS shows Received');

  out('5 report a problem → custodian marks for repair');
  await ev(t, uid => { const r = myReleases.find(x => x.kind === 'ICS'); openTeacherReport('problem', r.id, uid); }, anaUnits[0].id);
  check(await ev(t, () => !document.getElementById('tReportModal').classList.contains('hidden') && tReportDraft.reason === 'repair'), 'report sheet opens with “Needs repair”');
  await ev(t, () => { document.getElementById('trNote').value = 'No display since Monday'; });
  await t.screenshot({ path: '/tmp/e2e_t_report.png' });
  await t.click('#trSend');
  await until(t, no => document.getElementById('rqItemsPane').innerText.includes('Reported: Needs repair'), 'reported chip', 8000, anaUnits[0].no);
  check(true, 'Ana’s card: “Reported: Needs repair”');
  await until(a, () => openTeacherReports().length === 1, 'inbox', 8000);
  await ev(a, () => { switchMainView('REQUESTS'); });
  await sleep(200);
  let inbox = await ev(a, () => document.getElementById('reqViewBody').innerText);
  check(/From teachers · 1/.test(inbox) && /Ana Reyes reports needs repair/.test(inbox) && inbox.includes(anaUnits[0].no) && /No display since Monday/.test(inbox), 'custodian inbox shows the report with the note');
  check(await ev(a, () => /1 from teachers/.test(document.getElementById('homeReqSub').textContent)), 'Home card: 1 from teachers');
  await a.screenshot({ path: '/tmp/e2e_t_inbox.png' });
  await a.click('[data-treport] button');
  await sleep(300);
  const cond = await ev(a, (c, id) => ({ cond: getUnits(c).find(u => u.id === id).cond, repair: items.find(i => i.code === c).repair }), P, anaUnits[0].id);
  check(cond.cond === 'R' && cond.repair >= 1, 'unit marked for repair in My Items');
  await until(t, () => /Custodian: Marked for repair/.test(document.getElementById('rqItemsPane').innerText), 'Ana sees reply', 8000);
  check(true, 'Ana sees “Custodian: Marked for repair”');

  out('6 return → received back');
  await ev(t, uid => { openTeacherReport('return', myReleases.find(x => x.kind === 'ICS').id, uid); document.getElementById('trNote').value = 'Moving to the new building'; sendTeacherReport(); }, anaUnits[1].id);
  await until(t, () => /Return requested/.test(document.getElementById('rqItemsPane').innerText), 'return chip', 8000);
  check(await ev(t, id => document.querySelector(`button[onclick="openTeacherReport('return', '${myReleases.find(x => x.kind === 'ICS').id}', '${id}')"]`).disabled, anaUnits[1].id), 'Return button disabled while waiting');
  await until(a, () => openTeacherReports().some(x => x.kind === 'return'), 'return in inbox', 8000);
  inbox = await ev(a, () => document.getElementById('reqViewBody').innerText);
  check(/Ana Reyes is returning/.test(inbox) && /Moving to the new building/.test(inbox), 'inbox: Ana Reyes is returning');
  await ev(a, () => acceptTeacherReturn(openTeacherReports().find(x => x.kind === 'return').id));
  const back = await ev(a, (c, id) => getUnits(c).find(u => u.id === id), P, anaUnits[1].id);
  check(!back.to && !back.toUid && !back.ics, 'unit back in stock, not assigned');
  await waitNode(() => rels().some(r => r.kind === 'RETURN' && r.source === 'returned' && r.teacherUid === ana), 'RETURN record');
  check(rels().some(r => r.kind === 'RETURN' && r.source === 'returned' && r.lines[0].units[0].id === anaUnits[1].id), 'RETURN record kept');
  await until(t, no => !document.getElementById('rqItemsPane').innerText.includes(no), 'gone from Ana', 8000, anaUnits[1].no);
  check(await ev(t, () => document.getElementById('rqItemsCount').textContent) === '1', 'Ana now has 1 item');

  out('7 return declined');
  await ev(t, uid => { openTeacherReport('return', myReleases.find(x => x.kind === 'ICS').id, uid); sendTeacherReport(); }, anaUnits[0].id);
  await until(a, () => openTeacherReports().some(x => x.kind === 'return'), 'second return', 8000);
  a.dialogs.prompt = 'Please have it repaired first';
  await ev(a, () => declineTeacherReport(openTeacherReports().find(x => x.kind === 'return').id));
  await until(t, () => /Please have it repaired first/.test(document.getElementById('rqItemsPane').innerText), 'decline reply', 8000);
  txt = await paneText(t);
  check(txt.includes(anaUnits[0].no) && /Custodian: Please have it repaired first/.test(txt), 'Ana sees why; the item stays on her list');

  out('8 supplies: report fewer than released');
  await ev(t, () => { openTeacherReport('problem', myReleases.find(x => x.kind === 'RIS').id); });
  check(await ev(t, () => tReportDraft.reason === 'short' && /Fewer than released/.test(document.getElementById('trReasons').innerText)), 'supply reasons offered');
  await ev(t, () => { document.getElementById('trNote').value = 'Got 4, not 5'; sendTeacherReport(); });
  await until(a, () => openTeacherReports().some(x => x.reason === 'short'), 'supply report', 8000);
  await ev(a, () => resolveTeacherReport(openTeacherReports().find(x => x.reason === 'short').id, 'noted'));
  await until(t, () => /Custodian: Noted/.test(document.getElementById('rqItemsPane').innerText), 'noted', 8000);
  check(true, 'Ana sees “Custodian: Noted” on the RIS');
  check(await ev(a, () => openTeacherReports().length) === 0 && !(await ev(a, () => /From teachers/.test(document.getElementById('reqViewBody').innerText))), 'inbox empty again');

  out('9 offline report is sent later');
  await setOffline(j, true);
  await ev(j, () => { const r = myReleases[0]; openTeacherReport('problem', r.id, r.lines[0].units[0].id); tReportDraft.reason = 'lost'; sendTeacherReport(); });
  await sleep(600);
  check(/Sending…/.test(await paneText(j)), 'offline: “Sending…”');
  check(!reports().some(r => r.uid === juan && r.kind === 'problem'), 'not online yet');
  await setOffline(j, false);
  await waitNode(() => reports().some(r => r.uid === juan && r.reason === 'lost'), 'sent', 10000);
  check(reports().some(r => r.uid === juan && r.reason === 'lost'), 'sent when back online');
  await until(a, () => openTeacherReports().some(x => x.reason === 'lost'), 'lost in inbox', 8000);
  check(await ev(a, () => /Juan Dela Cruz reports lost or missing/.test(document.getElementById('reqViewBody').innerText)), 'inbox: Juan reports lost or missing');

  out('10 Requests tab and permissions');
  await ev(t, () => setTeacherTab('requests'));
  check(await ev(t, () => document.getElementById('rqTitle').textContent === 'Request supplies' && !document.getElementById('rqRequestsPane').classList.contains('hidden') && document.getElementById('rqItemsPane').classList.contains('hidden')), 'Requests tab shows the request screen');
  const perm = await ev(t, async sid => {
    const F = cloud.sdk;
    const r = {};
    try { await F.getDocs(F.query(F.collection(cloud.db, 'schools', sid, 'teacherReports'))); r.listAll = 'allowed'; } catch (e) { r.listAll = e.code; }
    try { await F.updateDoc(F.doc(cloud.db, 'schools', sid, 'teacherReports', 'ack-' + myReleases[0].id), { status: 'done' }); r.update = 'allowed'; } catch (e) { r.update = e.code; }
    try { await F.setDoc(F.doc(F.collection(cloud.db, 'schools', sid, 'teacherReports')), { uid: 'someone-else', name: 'X', kind: 'problem', units: [], status: 'open', desc: '', note: '' }); r.forge = 'allowed'; } catch (e) { r.forge = e.code; }
    return r;
  }, sid);
  check(perm.listAll === 'permission-denied', 'teacher cannot list other teachers’ reports');
  check(perm.update === 'permission-denied', 'teacher cannot mark her own report resolved');
  check(perm.forge === 'permission-denied', 'teacher cannot send a report as someone else');
  const appDenied = backend.denied.filter(x => !/list teacher reports|teacher report update|teacher report create/.test(x));
  check(appDenied.length === 0, `app flows refused 0 times (${appDenied.length}) ${appDenied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('teacher-items');
  await closeAll();
}
