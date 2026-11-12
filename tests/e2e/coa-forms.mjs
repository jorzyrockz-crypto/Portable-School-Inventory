// Government forms and the small additions: the welcome tour after the first custodian
// sign-in, the invite poster, PAR for equipment of ₱50,000 and up, transfers between teachers
// and rooms (ITR / PTR) with each unit's history, RRSP for take-backs, the physical count
// report (RPCPPE / RPCSP) and unserviceable property (IIRUP / IIRUSP), the slips list, the
// dark-mode switches and art, and the update check while the app is closed (sw.js).
// Also: Stock Card, Property Card / SPC, RegSPI, RSPI / RSMI, RLSDDP / RLSDDSP and the reorder list.
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '/tmp';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const backend = createBackend();
const rel = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
const ym = new Date().toISOString().slice(0, 7);
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
const printed = page => ev(page, () => document.getElementById('printPrSection').innerText.replace(/\u00ad/g, ''));
// A4 at 96 dpi less the page margins: 718 px portrait, 1047 px for the landscape forms.
async function printShot(page, file) {
  const wide = await ev(page, () => { document.body.classList.add('printing-pr'); return !!document.querySelector('#printPrSection .pr-wide'); });
  const vp = page.viewport();
  await page.emulateMediaType('print');
  await page.setViewport({ ...vp, width: wide ? 1047 : 718, height: wide ? 718 : 1047 });
  await sleep(300);
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: true });
  await page.setViewport(vp);
  await page.emulateMediaType('screen');
  await ev(page, () => document.body.classList.remove('printing-pr'));
  await sleep(300);
}

try {
  out('1 first sign-in as the property custodian opens the welcome tour');
  const a = await openPhone('custodian', backend, { tour: true });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => gateGo('custodian'));
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in form');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian' && !document.getElementById('tourModal').classList.contains('hidden'), 'tour open');
  check(await ev(a, () => !document.getElementById('tourModal').classList.contains('hidden') && document.getElementById('inviteModal').classList.contains('hidden')),
    'tour shown instead of the bare invite sheet');
  check(await ev(a, () => document.getElementById('tourSchool').value) === 'San Jose National High School', 'step 1: school name carried over from sign-up');
  await ev(a, () => { tourCustodian.value = 'Rosa Villanueva'; tourPosition.value = 'Administrative Officer II'; tourHead.value = 'Dr. Elena Cruz'; });
  await sleep(250);
  await a.screenshot({ path: `${SHOTS}/tour-1-school.png` });
  await a.click('#tourNext');
  await until(a, () => document.getElementById('tourModal').dataset.step === '1', 'step 2');
  check(await ev(a, () => schoolInfo.custodian === 'Rosa Villanueva' && schoolInfo.head === 'Dr. Elena Cruz' && schoolInfo.position === 'Administrative Officer II'), 'school info saved from step 1');
  check(await ev(a, () => document.querySelectorAll('[data-tour-pick]').length) === 4, 'step 2: import / scan ICS / catalog / sample');
  await a.click('[data-tour-pick="sample"]');
  check(await ev(a, () => document.querySelector('[data-tour-pick="sample"]').getAttribute('aria-pressed')) === 'true', 'choice is marked');
  await a.screenshot({ path: `${SHOTS}/tour-2-items.png` });
  await a.click('#tourNext');
  await until(a, () => document.getElementById('tourModal').dataset.step === '2' && !!document.querySelector('#tourQr svg'), 'step 3 with QR');
  const sid = await ev(a, () => reqRole.schoolId);
  check((await ev(a, () => document.getElementById('tourBody').innerText)).includes(sid), 'step 3: school code and QR shown');
  check(/Finish · Look around first/.test(await ev(a, () => document.getElementById('tourNext').innerText)), 'finish button names the chosen start');
  await a.screenshot({ path: `${SHOTS}/tour-3-invite.png` });

  out('2 invite poster for the faculty room');
  await a.click('#tourPoster');
  await until(a, () => window.__printed === 1, 'poster print');
  const poster = await ev(a, () => ({ text: document.querySelector('#printPrSection .poster').innerText, qr: !!document.querySelector('#printPrSection .poster-qr svg') }));
  check(poster.qr && poster.text.includes(sid) && /San Jose National High School/.test(poster.text) && /Scan with your phone camera/.test(poster.text), 'poster: school, big QR, code and steps');
  check(/Rosa Villanueva/.test(poster.text), 'poster names the custodian to ask');
  await printShot(a, 'poster-print.png');
  await a.click('#tourNext');
  await until(a, () => document.getElementById('tourModal').classList.contains('hidden') && items.some(i => i.qty > 0), 'tour finished, sample loaded');
  check(await ev(a, () => localStorage.getItem('cp_welcome_tour_v1')) === 'done', 'tour remembered as done');
  check(await ev(a, () => Object.keys(localStorage).filter(k => k.startsWith('custodian_')).length > 0), 'inventory saved as usual');
  await a.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  check(await ev(a, () => document.getElementById('tourModal').classList.contains('hidden')), 'not shown again after relaunch');
  check(await ev(a, () => !!document.getElementById('moreTourItem') && !!document.getElementById('invitePoster')), 'tour in More, poster button in the invite sheet');
  await until(a, () => cloud.user && inventorySyncActive(), 'signed in again', 10000);

  out('3 set up: tagged equipment, one item of ₱50,000 or more, two teachers');
  const pick = await ev(a, () => {
    const eq = items.filter(i => i.type === 'EQUIPMENT' && i.qty >= 2 && i.qty <= 5).slice(0, 2);
    eq.forEach(i => { openUnitsModal(i.code); generateUnitTags(); closeUnitsModal(); });
    const [ppe, se] = eq;
    ppe.price = 65000; userState[ppe.code].customPrice = 65000;
    saveState();
    return { ppe: { code: ppe.code, name: ppe.name, units: getUnits(ppe.code).map(u => u.id) }, se: { code: se.code, name: se.name, units: getUnits(se.code).map(u => u.id) } };
  });
  check(pick.ppe.units.length >= 2 && pick.se.units.length >= 2, `two tagged items (${pick.ppe.name} at ₱65,000; ${pick.se.name})`);
  const t1 = await openPhone('teacher-ana', backend);
  const anaUid = await joinAsTeacher(t1, sid, 'Ana Reyes', 'Teacher III', 'Grade 7 – Science');
  const t2 = await openPhone('teacher-ben', backend);
  const benUid = await joinAsTeacher(t2, sid, 'Ben Torres', 'Teacher I', 'Grade 8 – Math');
  await until(a, (x, y) => teacherRoster().filter(t => [x, y].includes(t.uid) && t.joined).length === 2, 'both teachers in the roster', 8000, anaUid, benUid);

  out('4 PAR for equipment of ₱50,000 and up (Appendix 71)');
  await ev(a, (uid, p, s) => openRelease({ teacherUid: uid, purpose: 'Science laboratory', lines: [{ code: p, qty: 1 }, { code: s, qty: 1 }] }), anaUid, pick.ppe.code, pick.se.code);
  await until(a, () => !document.getElementById('releaseModal').classList.contains('hidden'), 'release sheet');
  const relSheet = await ev(a, () => ({ summary: document.getElementById('relSummary').innerText, lines: document.getElementById('relLines').innerText }));
  check(relSheet.summary.includes(`ICS ${ym}-001`) && relSheet.summary.includes(`PAR ${ym}-001`), `creates an ICS and a PAR: “${relSheet.summary}”`);
  check(/Equipment · PAR/i.test(relSheet.lines) && /Equipment · ICS/i.test(relSheet.lines), 'each line says which slip it goes on');
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  const issued = await ev(a, (p, s) => ({ ppe: getUnits(p).find(u => u.toUid), se: getUnits(s).find(u => u.toUid), done: document.getElementById('relDone').innerText }), pick.ppe.code, pick.se.code);
  check(issued.ppe && issued.ppe.doc === 'PAR' && issued.ppe.ics === `${ym}-001` && issued.ppe.to === 'Ana Reyes', 'PPE unit: With Ana Reyes · PAR no.');
  check(issued.se && !issued.se.doc && issued.se.ics === `${ym}-001`, 'semi-expendable unit stays on the ICS');
  await waitNode(() => rel().some(d => d.kind === 'PAR'), 'PAR online');
  const parDoc = rel().find(d => d.kind === 'PAR');
  check(parDoc.teacherUid === anaUid && parDoc.lines[0].units[0].no === issued.ppe.no && parDoc.total === 65000, 'PAR saved online for Ana');
  const parIdx = await ev(a, () => releaseDone.docs.findIndex(x => x.kind === 'PAR'));
  await ev(a, i => printReleaseDone(i), parIdx);
  await sleep(200);
  const parTxt = await printed(a);
  check(/Appendix 71/.test(parTxt) && /PROPERTY ACKNOWLEDGMENT RECEIPT/.test(parTxt) && /ANA REYES/.test(parTxt) && parTxt.includes(issued.ppe.no) && /ROSA VILLANUEVA/.test(parTxt), 'PAR printed: number, property no., end user, custodian');
  await printShot(a, 'par-print.png');
  await ev(a, () => closeRelease());
  await until(t1, () => teacherHoldings(myReleases).equipment.length === 2, 'Ana sees both units');
  const anaItems = await ev(t1, () => { setTeacherTab('items'); return document.getElementById('rqItemsPane').innerText; });
  check(anaItems.includes(`PAR ${ym}-001`) && /ICS \/ PAR/.test(anaItems), 'teacher’s My Items shows the PAR');
  check(await ev(t1, () => myReleases.filter(r => r.kind === 'PAR' && !tAcked(r.id)).length) === 1, 'teacher is asked to confirm the PAR');

  out('5 transfer from Ana to Ben (ITR + PTR), with history');
  await ev(a, uid => openTeachersView(uid), anaUid);
  await until(a, () => !!document.getElementById('tvTransfer'), 'Transfer button on Ana’s page');
  await a.click('#tvTransfer');
  await until(a, () => !document.getElementById('xferModal').classList.contains('hidden') && !!document.getElementById('xferUnits'), 'transfer sheet');
  await ev(a, () => xferAll(true));
  await a.select('#xferTo', benUid);
  await ev(a, () => { xferSet('loc', 'Room 12 · Grade 8'); xferSet('purpose', 'Ana moved to the senior high building'); renderTransfer(); });
  const xs = await ev(a, () => ({ summary: document.getElementById('xferSummary').innerText, disabled: document.getElementById('xferSave').disabled, type: document.querySelector('[data-xtype="reassignment"]').className }));
  check(xs.summary.includes(`ITR ${ym}-001`) && xs.summary.includes(`PTR ${ym}-001`) && !xs.disabled, `creates ITR and PTR: “${xs.summary}”`);
  check(/seg-on/.test(xs.type), 'Reassignment chosen by default');
  await sleep(200);
  await a.screenshot({ path: `${SHOTS}/transfer-sheet.png` });
  await a.click('#xferSave');
  await until(a, () => xfer && xfer.done, 'transferred');
  const moved = await ev(a, (p, s) => ({ ppe: getUnits(p).find(u => u.toUid), se: getUnits(s).find(u => u.toUid) }), pick.ppe.code, pick.se.code);
  check(moved.ppe.toUid === benUid && moved.ppe.doc === 'PTR' && moved.ppe.ics === `${ym}-001` && moved.ppe.loc === 'Room 12 · Grade 8', 'PPE unit now with Ben · PTR · Room 12');
  check(moved.se.toUid === benUid && moved.se.doc === 'ITR' && moved.se.to === 'Ben Torres', 'semi-expendable unit now with Ben · ITR');
  await waitNode(() => rel().filter(d => d.kind === 'ITR' || d.kind === 'PTR').length === 2 && rel().filter(d => d.source === 'transferred').length === 2, 'transfer docs online');
  const itr = rel().find(d => d.kind === 'ITR');
  check(itr.teacherUid === benUid && itr.fromUid === anaUid && itr.fromName === 'Ana Reyes' && itr.transferType === 'reassignment' && itr.loc === 'Room 12 · Grade 8', 'ITR made out to Ben, from Ana');
  check(itr.lines[0].units[0].doc === `ICS ${ym}-001`, 'ITR keeps the unit’s earlier ICS no.');
  const back = rel().find(d => d.source === 'transferred' && d.transferNo === `ITR ${ym}-001`);
  check(back && back.teacherUid === anaUid && back.kind === 'RETURN', 'Ana gets a “transferred out” record');
  await ev(a, () => printTransferDone(xfer.done.docs.findIndex(x => x.kind === 'ITR')));
  await sleep(200);
  const itrTxt = await printed(a);
  check(/Annex A\.5/.test(itrTxt) && /INVENTORY TRANSFER REPORT/.test(itrTxt) && /ANA REYES/.test(itrTxt) && /BEN TORRES/.test(itrTxt) && itrTxt.includes(`ICS ${ym}-001`) && /DR\. ELENA CRUZ/.test(itrTxt), 'ITR printed: from, to, earlier ICS, approved by the school head');
  check(/Ana moved to the senior high building/.test(itrTxt) && /Room 12/.test(itrTxt), 'reason and new room on the ITR');
  await printShot(a, 'itr-print.png');
  await ev(a, () => printTransferDone(xfer.done.docs.findIndex(x => x.kind === 'PTR')));
  await sleep(200);
  const ptrTxt = await printed(a);
  check(/Appendix 76/.test(ptrTxt) && /PROPERTY TRANSFER REPORT/.test(ptrTxt) && /Condition of PPE/.test(ptrTxt) && ptrTxt.includes(moved.ppe.no), 'PTR printed for the PPE unit');
  await ev(a, () => closeTransfer());
  await until(t1, () => teacherHoldings(myReleases).equipment.length === 0, 'Ana no longer holds them');
  await until(t2, () => teacherHoldings(myReleases).equipment.length === 2, 'Ben holds both');
  const benView = await ev(t2, () => { setTeacherTab('items'); return document.getElementById('rqItemsPane').innerText; });
  check(benView.includes(`ITR ${ym}-001`) && /from Ana Reyes/.test(benView) && /New from the property custodian/.test(benView), 'Ben sees the ITR, from Ana, to confirm');
  await until(t2, () => loadNotifs().items.some(n => /transferred to you/.test(n.title)), 'Ben’s notification', 6000);
  check(await ev(t2, () => loadNotifs().items.some(n => /Items transferred to you/.test(n.title))), 'Ben is notified: “Items transferred to you”');
  // Unit history in Property Numbers.
  const trail = await ev(a, (code, id) => { openUnitsModal(code, id); const d = document.querySelector(`#unitcard-${id} details.unit-trail`); d.open = true; return d.innerText; }, pick.se.code, moved.se.id);
  check(/Accountability history \(2\)/.test(trail) && /Issued to Ana Reyes/.test(trail) && /Transferred from Ana Reyes to Ben Torres/.test(trail), 'unit history: issued, then transferred');
  await sleep(200);
  await a.screenshot({ path: `${SHOTS}/unit-history.png` });
  await ev(a, () => closeUnitsModal());

  out('6 same person, new room only');
  const benKey = benUid;
  await ev(a, (k, id) => openTransfer({ fromKey: k, unitIds: [id] }), benKey, moved.se.id);
  await a.select('#xferTo', '__same');
  check(await ev(a, () => document.getElementById('xferSave').disabled), 'needs the new room first');
  await ev(a, () => { xferSet('loc', 'Library'); xferSet('type', 'relocate', true); });
  await a.click('#xferSave');
  await until(a, () => xfer && xfer.done, 'moved');
  const relocated = await ev(a, (s, id) => getUnits(s).find(u => u.id === id), pick.se.code, moved.se.id);
  check(relocated.loc === 'Library' && relocated.toUid === benUid && relocated.ics === `${ym}-002` && relocated.doc === 'ITR', 'still Ben’s, now in the Library (ITR no. 2)');
  await waitNode(() => rel().some(d => d.kind === 'ITR' && d.no === `${ym}-002`), 'relocation online');
  check(rel().find(d => d.no === `${ym}-002` && d.kind === 'ITR').sameHolder === true && rel().filter(d => d.source === 'transferred').length === 2, 'no “transferred out” record for a room change');
  await until(t2, () => myReleases.some(r => r.sameHolder), 'Ben’s phone gets the room change');
  check(await ev(t2, () => { renderTeacherTabs(); const r = myReleases.find(x => x.sameHolder); return !!r && !document.querySelector(`button[onclick="ackRelease('${r.id}')"]`) && /Library|ITR/.test(document.getElementById('rqItemsPane').innerText); }), 'room change is not a new item to confirm');
  await ev(a, () => closeTransfer());

  out('7 take back → RRSP (Annex A.6)');
  await ev(a, (s, id) => takeBackUnit(s, id), pick.se.code, moved.se.id);
  await waitNode(() => rel().some(d => d.kind === 'RETURN' && d.source === 'taken-back'), 'take-back online');
  const rrsp = rel().find(d => d.kind === 'RETURN' && d.source === 'taken-back');
  check(rrsp.no === `${ym}-001` && rrsp.teacherUid === benUid && rrsp.lines[0].units[0].doc === `ITR ${ym}-002`, `RRSP No. ${rrsp.no}, with the unit’s ITR`);
  await ev(a, uid => openTeachersView(uid), benUid);
  await until(a, () => /RRSP/.test(document.getElementById('tvBody').innerText), 'history shows the RRSP');
  const benHist = await ev(a, () => document.getElementById('tvBody').innerText);
  check(benHist.includes(`RRSP ${ym}-001`) && /Taken back/.test(benHist) && /Transferred in from Ana Reyes/.test(benHist) && /Moved/.test(benHist), 'Ben’s history: transferred in, moved, taken back');
  await ev(a, () => printReleaseById(releaseList.find(r => r.kind === 'RETURN' && r.source === 'taken-back').id));
  await sleep(200);
  const rrspTxt = await printed(a);
  check(/Annex A\.6/.test(rrspTxt) && /RECEIPT OF RETURNED SEMI-EXPENDABLE PROPERTY/.test(rrspTxt) && /BEN TORRES/.test(rrspTxt) && rrspTxt.includes(`ITR ${ym}-002`), 'RRSP printed with the returned unit’s ITR');
  // Ana's copy of the transfer prints the transfer itself.
  await ev(a, () => printReleaseById(releaseList.find(r => r.source === 'transferred' && /^ITR/.test(r.transferNo)).id));
  await sleep(200);
  check(/INVENTORY TRANSFER REPORT/.test(await printed(a)), 'the old holder’s record prints the ITR');

  out('8 physical count report (RPCPPE / RPCSP)');
  await ev(a, (p, ids) => { const u = getUnits(p); u[0].seen = Date.now(); u.slice(1).forEach(x => { x.seen = null; }); saveState(); }, pick.ppe.code);
  await ev(a, () => { switchMainView('REPORTS'); });
  await until(a, () => !!document.getElementById('coaPanel') && document.getElementById('coaPanel').offsetParent, 'forms card in Reports');
  await a.click('#coaPanel');
  await until(a, () => !document.getElementById('coaModal').classList.contains('hidden') && !!document.getElementById('coaGoCount'), 'forms hub');
  await sleep(200);
  await a.screenshot({ path: `${SHOTS}/forms-hub.png` });
  await a.click('#coaGoCount');
  await until(a, () => !!document.getElementById('coaCountStats'), 'count page');
  const nPpe = pick.ppe.units.length;
  const stats = await ev(a, () => document.getElementById('coaCountStats').innerText.replace(/\s+/g, ' '));
  check(stats.startsWith(`${nPpe} PER CARD 1 COUNTED ${nPpe - 1} NOT FOUND`) || stats.startsWith(`${nPpe} Per card 1 Counted ${nPpe - 1} Not found`), `RPCPPE counts from the scans: “${stats}”`);
  await ev(a, () => { document.querySelector('[data-coa="committee"]').value = 'Jose Ramos\nLiza Gomez\nMark Uy'; document.querySelector('[data-coa="coaRep"]').value = 'Atty. Carla Diaz'; document.querySelector('[data-coa="fund"]').value = '01'; });
  await sleep(200);
  await a.screenshot({ path: `${SHOTS}/count-report-sheet.png` });
  await a.click('#coaPrint');
  await sleep(200);
  const rpc = await ev(a, () => ({ text: document.getElementById('printPrSection').innerText, wide: !!document.querySelector('#printPrSection .pr-wide') }));
  check(rpc.wide && /Appendix 73/.test(rpc.text) && /REPORT ON THE PHYSICAL COUNT OF PROPERTY, PLANT AND EQUIPMENT/.test(rpc.text), 'RPCPPE printed on a landscape page');
  check(/Not found in the count/.test(rpc.text) && /JOSE RAMOS/.test(rpc.text) && /ATTY\. CARLA DIAZ/.test(rpc.text) && /ROSA VILLANUEVA/i.test(rpc.text), 'remarks, committee, COA representative and accountable officer');
  check(rpc.text.includes(`-${'65,000.00'}`) || rpc.text.includes('-65,000.00'), 'shortage value per missing unit');
  await printShot(a, 'rpcppe-print.png');
  await a.click('[data-coa-opt="countType:sep"]');
  await until(a, () => /RPCSP/.test(document.getElementById('coaPrint').innerText), 'RPCSP chosen');
  check(await ev(a, () => document.querySelector('[data-coa="committee"]').value) === 'Jose Ramos\nLiza Gomez\nMark Uy', 'typed names kept when switching');
  await a.click('#coaPrint');
  await sleep(200);
  const rpcsp = await printed(a);
  check(/Annex A\.8/.test(rpcsp) && /SEMI-EXPENDABLE PROPERTY/.test(rpcsp) && /Balance Per Card/.test(rpcsp), 'RPCSP printed for items below ₱50,000');
  check(await ev(a, () => JSON.parse(localStorage.getItem('custodian_coa_forms_v1')).coaRep) === 'Atty. Carla Diaz', 'names remembered for next year');

  out('9 unserviceable property (IIRUP / IIRUSP)');
  const unsNo = await ev(a, p => { const u = getUnits(p)[1]; setUnitCond(p, u.id, 'U'); return u.no; }, pick.ppe.code);
  await ev(a, () => coaGo('unserv'));
  await until(a, () => !!document.getElementById('coaUnservList'), 'unserviceable page');
  check((await ev(a, () => document.getElementById('coaUnservList').innerText)).includes(unsNo), `IIRUP lists ${unsNo}`);
  await a.click('#coaPrint');
  await sleep(200);
  const iirup = await printed(a);
  check(/Appendix 74/.test(iirup) && /INVENTORY AND INSPECTION REPORT OF UNSERVICEABLE PROPERTY/.test(iirup) && /Accumulated Depreciation/.test(iirup) && iirup.includes(unsNo) && /DR\. ELENA CRUZ/.test(iirup), 'IIRUP printed with the unit and the approving head');
  await printShot(a, 'iirup-print.png');
  await ev(a, s => { const u = getUnits(s)[0]; setUnitCond(s, u.id, 'U'); }, pick.se.code);
  await a.click('[data-coa-opt="unservType:sep"]');
  await until(a, () => /IIRUSP/.test(document.getElementById('coaPrint').innerText) && !document.getElementById('coaPrint').disabled, 'IIRUSP ready');
  await a.click('#coaPrint');
  await sleep(200);
  check(/Annex A\.10/.test(await printed(a)), 'IIRUSP printed for semi-expendable property');

  out('10 slips & receipts');
  await ev(a, () => coaGo('slips'));
  await until(a, () => !!document.getElementById('coaSlips'), 'slips page');
  const slips = await ev(a, () => document.getElementById('coaSlips').innerText);
  check([`PAR ${ym}-001`, `ICS ${ym}-001`, `ITR ${ym}-001`, `PTR ${ym}-001`, `RRSP ${ym}-001`].every(x => slips.includes(x)), 'PAR, ICS, ITR, PTR and RRSP listed');
  await a.click('[data-slip-kind="PAR"]');
  const onlyPar = await ev(a, () => document.getElementById('coaSlips').innerText);
  check(onlyPar.includes(`PAR ${ym}-001`) && !onlyPar.includes('ITR'), 'filter by form');

  out('10b more forms: stock / property cards, RegSPI, RSPI / RSMI, RLSDDSP, reorder list');
  await ev(a, () => closeCoa());
  // a supply: 3 more received (history), then an RIS of 2 to Ana
  const C = await ev(a, () => items.find(i => i.type !== 'EQUIPMENT' && i.qty >= 6 && i.price > 0).code);
  await ev(a, c => adjustQty(c, 3), C);
  await sleep(300);
  await ev(a, (uid, c) => openRelease({ teacherUid: uid, purpose: 'Classroom', lines: [{ code: c, qty: 2 }] }), anaUid, C);
  await until(a, () => !document.getElementById('releaseModal').classList.contains('hidden'), 'RIS sheet');
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'RIS released');
  await ev(a, () => closeRelease());
  await until(a, () => releaseList.some(r => r.kind === 'RIS' && !r.sending), 'RIS saved', 8000);
  const ris = await ev(a, c => { const e = changeHistory.filter(x => x.q && x.q[c] !== undefined).pop(); return { q: e && e.q[c], k: e && e.k, qty: items.find(i => i.code === c).qty, no: releaseList.find(r => r.kind === 'RIS').no }; }, C);
  check(ris.q === -2 && ris.k === 'release', `history keeps how much each item changed in a bulk save (RIS: ${ris.q})`);
  await ev(a, () => openCoa());
  await until(a, () => !!document.getElementById('coaGoStock'), 'hub');
  const hub = await ev(a, () => document.getElementById('coaBody').innerText);
  check(['PC · SPC', 'RegSPI', 'Stock Card', 'RSPI · RSMI', 'RLSDDP · RLSDDSP', 'List · PR'].every(x => hub.toUpperCase().includes(x.toUpperCase())), 'hub lists the new forms in sections');
  await a.screenshot({ path: `${SHOTS}/forms-hub-more.png` });
  // a printed card: rows (not blank) → [date, ref, …, balance, …]
  const cardRows = (code, balIdx) => ev(a, (code, i) => [...document.querySelectorAll(`#printPrSection .pr-form[data-card="${code}"] tr`)]
    .filter(tr => !tr.classList.contains('pr-blank') && tr.querySelector('td') && /^\d/.test((tr.cells[i] || {}).innerText || '') && !tr.querySelector('th'))
    .map(tr => [...tr.cells].map(td => td.innerText.trim())), code, balIdx);

  await ev(a, () => coaGo('stock'));
  await until(a, () => !!document.getElementById('coaItems'), 'stock page');
  await a.click(`[data-print-card="${C}"]`);
  await sleep(200);
  let txt = await printed(a);
  let rows = await cardRows(C, 5);
  check(/Appendix 58/.test(txt) && /STOCK CARD/.test(txt) && /Re-order Point/.test(txt), 'Stock Card printed (Appendix 58)');
  const risRow = rows.find(r => r[1] === `RIS ${ris.no}`);
  check(!!risRow && risRow[3] === '2' && /Ana Reyes/.test(risRow[4]), `RIS row: issued 2 to Ana (${risRow && risRow.join(' | ')})`);
  check(rows.some(r => r[1] === 'Added to stock' && r[2] === '3'), 'received 3 (from the history)');
  check(rows.filter(r => /^RIS/.test(r[1])).length === 1, 'the RIS is not counted twice');
  check(rows[rows.length - 1][5] === String(ris.qty), `last balance = on hand (${rows[rows.length - 1][5]} / ${ris.qty})`);
  await printShot(a, 'stock-card-print.png');

  await ev(a, () => { coaGo('cards'); coaSetOpt('cardType', 'ppe'); });
  await until(a, () => /PC/.test(document.getElementById('coaPrint').innerText), 'PC page');
  await a.click(`[data-print-card="${pick.ppe.code}"]`);
  await sleep(200);
  txt = await printed(a);
  rows = await cardRows(pick.ppe.code, 5);
  const ppeQty = await ev(a, c => items.find(i => i.code === c).qty, pick.ppe.code);
  check(/Appendix 69/.test(txt) && /PROPERTY CARD/.test(txt) && txt.includes(issued.ppe.no), 'Property Card printed with the property numbers');
  check(rows.some(r => r[1] === `PAR ${ym}-001` && /Ana Reyes/.test(r[4])) && rows.some(r => r[1] === `PTR ${ym}-001` && /Ben Torres/.test(r[4])), 'PAR to Ana and PTR to Ben');
  check(rows[rows.length - 1][5] === String(ppeQty) && rows[rows.length - 1][6] === (ppeQty * 65000).toLocaleString('en-PH', { minimumFractionDigits: 2 }), `balance ${ppeQty}, amount ₱${(ppeQty * 65000).toLocaleString()}`);
  await printShot(a, 'property-card-print.png');
  await ev(a, () => coaSetOpt('cardType', 'sep'));
  await a.click(`[data-print-card="${pick.se.code}"]`);
  await sleep(200);
  txt = await printed(a);
  rows = await cardRows(pick.se.code, 6);
  check(/Annex A\.1/.test(txt) && /SEMI-EXPENDABLE PROPERTY CARD/.test(txt), 'SPC printed (Annex A.1)');
  check(rows.some(r => r[1] === `ICS ${ym}-001`) && rows.some(r => r[1] === `ITR ${ym}-001` || r[1] === `ITR ${ym}-002`) && rows.some(r => r[1] === `RRSP ${ym}-001` && /Taken back/.test(r[8])), 'ICS, ITR and RRSP on the SPC');
  await a.click('#coaPrint');
  await sleep(200);
  const allCards = await ev(a, () => ({ n: document.querySelectorAll('#printPrSection .pr-pages > .pr-form').length, want: cardItems(false).length }));
  check(allCards.n === allCards.want && allCards.n >= 1, `Print all: one page per item (${allCards.n})`);

  await ev(a, () => coaGo('regspi'));
  await until(a, () => !!document.getElementById('coaRegStats'), 'RegSPI page');
  const reg = await ev(a, () => document.getElementById('coaRegStats').innerText.replace(/\s+/g, ' '));
  check(/^[1-9]\d* Issued [1-9]\d* Returned [1-9]\d* Re-issued/i.test(reg), `RegSPI counts: ${reg}`);
  await a.click('#coaPrint');
  await sleep(200);
  txt = await printed(a);
  check(/Annex A\.4/.test(txt) && /REGISTRY OF SEMI-EXPENDABLE PROPERTY ISSUED/.test(txt) && txt.includes(`ICS ${ym}-001`) && txt.includes(`RRSP ${ym}-001`) && (await ev(a, () => !!document.querySelector('#printPrSection .pr-wide'))), 'RegSPI printed (landscape) with ICS and RRSP');
  await printShot(a, 'regspi-print.png');

  await ev(a, () => coaGo('issued'));
  await until(a, () => !!document.getElementById('coaIssuedStats'), 'issued page');
  await a.click('#coaPrint');
  await sleep(200);
  txt = await printed(a);
  check(/Annex A\.7/.test(txt) && /REPORT OF SEMI-EXPENDABLE PROPERTY ISSUED/.test(txt) && txt.includes(issued.se.no) && !txt.includes(issued.ppe.no), 'RSPI: the ICS unit, not the PAR one');
  await ev(a, () => coaSetOpt('issuedType', 'sup'));
  await a.click('#coaPrint');
  await sleep(200);
  txt = await printed(a);
  check(/Appendix 64/.test(txt) && /REPORT OF SUPPLIES AND MATERIALS ISSUED/.test(txt) && txt.includes(ris.no) && /Recapitulation/.test(txt) && /UACS Object Code/.test(txt), 'RSMI: the RIS with the recapitulation');
  await printShot(a, 'rsmi-print.png');

  // Ben reports the PPE unit he holds as lost → preselected on the RLSDDP
  await ev(a, () => closeCoa());
  const lostUnit = await ev(a, (p, uid) => getUnits(p).find(u => u.toUid === uid), pick.ppe.code, benUid);
  await until(t2, () => myReleases.some(r => r.kind === 'PTR'), 'Ben has the PTR', 8000);
  await ev(t2, id => { const r = myReleases.find(x => x.kind === 'PTR'); openTeacherReport('problem', r.id, id); tReportDraft.reason = 'lost'; document.getElementById('trNote').value = 'Missing after the fire drill'; sendTeacherReport(); }, lostUnit.id);
  await until(a, id => tReports.some(x => x.reason === 'lost' && x.units.some(u => u.id === id)), 'lost report', 8000, lostUnit.id);
  await ev(a, () => { openCoa(); coaGo('lost'); coaSetOpt('lostType', 'ppe'); });
  await until(a, () => !!document.getElementById('coaLostUnits'), 'lost page');
  const lost = await ev(a, id => ({ ticked: !!document.querySelector(`[data-lost-unit="${id}"]`).checked, chip: /Reported lost/.test(document.getElementById('coaLostUnits').innerText),
    officer: document.querySelector('[data-coa="lostOfficer"]').value, desig: document.querySelector('[data-coa="lostDesig"]').value }), lostUnit.id);
  check(lost.ticked && lost.chip && lost.officer === 'Ben Torres' && lost.desig === 'Teacher I', `unit reported lost is ticked; officer ${lost.officer}, ${lost.desig}`);
  await a.click('[data-nature="lost"]');
  await ev(a, () => { document.querySelector('[data-coa="lostCirc"]').value = 'Last seen in Room 12 on 3 November.'; document.querySelector('[data-coa="lostPolice"]').value = 'no'; });
  await sleep(100);
  await a.screenshot({ path: `${SHOTS}/lost-sheet.png` });
  await a.click('#coaPrint');
  await sleep(200);
  txt = await printed(a);
  check(/Appendix 75/.test(txt) && /REPORT OF LOST, STOLEN, DAMAGED OR DESTROYED PROPERTY/.test(txt) && txt.includes(lostUnit.no) && /Last seen in Room 12/.test(txt) && /BEN TORRES/.test(txt) && txt.includes(`PTR ${ym}-001`), 'RLSDDP printed: unit, circumstances, officer, PTR no.');
  check(await ev(a, () => document.querySelectorAll('#printPrSection svg').length) >= 2, 'ticked boxes (Lost, police: No)');
  await printShot(a, 'rlsddp-print.png');
  await ev(a, () => coaSetOpt('lostType', 'sep'));
  check(/RLSDDSP/.test(await ev(a, () => document.getElementById('coaPrint').innerText)), 'RLSDDSP for semi-expendable property');

  // Reorder list → Purchase Request
  const low = await ev(a, c => { const i = items.find(x => x.type !== 'EQUIPMENT' && x.qty > 0 && x.minQty >= 3 && x.code !== c); setExactQty(i.code, i.minQty - 1); return { code: i.code, name: i.name, order: 2 * i.minQty - (i.minQty - 1) }; }, C);
  await ev(a, () => coaGo('reorder'));
  await until(a, () => !!document.getElementById('coaReorder'), 'reorder page');
  const ro = await ev(a, () => document.getElementById('coaReorder').innerText);
  check(ro.includes(low.name) && ro.includes(`Order ${low.order}`), `reorder list: ${low.name} · order ${low.order}`);
  check(await ev(a, () => reorderRows().every(x => x.item.type !== 'EQUIPMENT' && x.item.qty <= x.item.minQty) && reorderRows().length < 60), 'only supplies at or below the re-order point (not the whole catalog)');
  await a.click('#coaPrint');
  await sleep(200);
  txt = await printed(a);
  check(/SUPPLIES FOR REORDER/.test(txt) && txt.includes(low.name) && /ESTIMATED TOTAL/.test(txt), 'reorder list printed');
  await a.click('#coaReorderPr');
  await until(a, () => !document.getElementById('prModal').classList.contains('hidden'), 'PR sheet', 4000);
  const pr = await ev(a, c => ({ line: prDraft.lines.find(l => l.code === c), purpose: document.getElementById('prPurpose').value, coaClosed: document.getElementById('coaModal').classList.contains('hidden') }), low.code);
  check(pr.line && pr.line.qty === low.order && /Replenishment/.test(pr.purpose) && pr.coaClosed, `Purchase Request drafted from the list (${pr.line && pr.line.qty} ${pr.line && pr.line.unit})`);
  await ev(a, () => closePr());

  out('10c date acquired and useful life of each unit');
  await ev(a, () => closeCoa());
  await ev(a, p => openUnitsModal(p), pick.ppe.code);
  await until(a, () => document.querySelectorAll('#unitsList .unit-acq').length >= 2, 'unit cards with Date acquired');
  await ev(a, () => { const el = document.querySelector('#unitsList .unit-acq'); el.value = '2023-06-15'; el.dispatchEvent(new Event('change')); });
  await sleep(150);
  const toast10c = await ev(a, () => document.getElementById('appToastText').innerText + ' | ' + document.getElementById('appToastAction').innerText);
  check(/Same date acquired .* for the other \d+ units?\?/.test(toast10c) && /Use for all/.test(toast10c), `offers the same date for the other units: “${toast10c}”`);
  await a.click('#appToastAction');
  await sleep(150);
  const acq10c = await ev(a, p => getUnits(p).map(u => u.acq), pick.ppe.code);
  check(acq10c.every(d => d === '2023-06-15'), `Use for all → every unit acquired 2023-06-15 (${acq10c.join(', ')})`);
  await ev(a, () => { const el = document.querySelector('#unitsList .unit-life'); el.value = '10'; el.dispatchEvent(new Event('change')); });
  await sleep(150);
  await a.click('#appToastAction');
  await sleep(150);
  const life10c = await ev(a, p => getUnits(p).map(u => u.life), pick.ppe.code);
  check(life10c.every(l => l === '10 years'), `useful life “10” is saved as “10 years” on every unit (${life10c.join(', ')})`);
  check(await ev(a, () => document.querySelector('#unitsList .unit-life').value === '10 years' && /Date acquired/i.test(document.getElementById('unitsList').innerText)), 'unit card shows both fields');
  await a.screenshot({ path: `${SHOTS}/unit-acq-life.png` });
  await ev(a, () => closeUnitsModal());
  // Property Card: the first row is the receipt on the date acquired, not "Balance forward"
  await ev(a, () => { openCoa(); coaGo('cards'); coaSetOpt('cardType', 'ppe'); });
  await until(a, () => !!document.querySelector('[data-print-card]'), 'PC page');
  await a.click(`[data-print-card="${pick.ppe.code}"]`);
  await sleep(200);
  rows = await cardRows(pick.ppe.code, 5);
  const ppeUnits10c = await ev(a, p => getUnits(p).length, pick.ppe.code);
  const acqDate = await ev(a, () => fDate('2023-06-15'));
  check(rows[0][0] === acqDate && rows[0][1] === 'Received' && rows[0][2] === String(ppeUnits10c) && !/Balance forward/.test(await printed(a)), `card opens with “${rows[0].slice(0, 3).join(' | ')}” instead of Balance forward`);
  await printShot(a, 'property-card-acq.png');
  // IIRUP: Date Acquired column
  await ev(a, () => { coaGo('unserv'); coaSetOpt('unservType', 'ppe'); });
  await until(a, () => !document.getElementById('coaPrint').disabled, 'IIRUP ready');
  await a.click('#coaPrint');
  await sleep(200);
  const iirupRow = await ev(a, no => [...document.querySelectorAll('#printPrSection tr')].find(tr => tr.innerText.includes(no)).cells[0].innerText.trim(), unsNo);
  check(iirupRow === acqDate, `IIRUP Date Acquired filled (${iirupRow})`);
  // RegSPI: Estimated Useful Life (category estimate when nothing was written)
  await ev(a, () => coaGo('regspi'));
  await until(a, () => !document.getElementById('coaPrint').disabled, 'RegSPI ready');
  await a.click('#coaPrint');
  await sleep(200);
  const regLife = await ev(a, () => [...document.querySelectorAll('#printPrSection tr')].filter(tr => tr.cells.length >= 15 && !tr.classList.contains('pr-blank') && !tr.querySelector('th')).map(tr => tr.cells[4].innerText.trim()));
  check(regLife.length && regLife.every(x => /^\d+(\.\d+)? years?$/.test(x)), `RegSPI useful life column filled (${[...new Set(regLife)].join(', ')})`);
  await ev(a, () => closeCoa());

  out('11 dark mode: switches stand out, night art');
  await ev(a, () => { closeCoa(); setTheme('dark'); switchMainView('HOME'); });
  await sleep(300);
  const dark = await ev(a, () => {
    openMoreMenu();
    const on = document.querySelector('#moreTheme [data-theme-opt="dark"]');
    const off = document.querySelector('#moreTheme [data-theme-opt="light"]');
    return { on: getComputedStyle(on).backgroundColor, off: getComputedStyle(off).backgroundColor, onCls: on.className, art: getComputedStyle(document.body).backgroundImage };
  });
  check(/seg-on/.test(dark.onCls) && dark.on === 'rgb(58, 74, 107)' && dark.off !== dark.on, `selected theme option lifts off the track (${dark.on} vs ${dark.off})`);
  check(/login-portrait-dark\.webp/.test(dark.art), 'Home uses the night version of the art');
  await a.screenshot({ path: `${SHOTS}/more-dark-switch.png` });
  await ev(a, () => { closeMoreMenu(); openCoa(); });
  await sleep(250);
  await a.screenshot({ path: `${SHOTS}/forms-hub-dark.png` });
  await ev(a, () => { closeCoa(); openTransfer(); });
  await sleep(250);
  await a.screenshot({ path: `${SHOTS}/transfer-dark.png` });
  await ev(a, () => { closeTransfer(); openTour(); });
  await sleep(250);
  await a.screenshot({ path: `${SHOTS}/tour-dark.png` });
  await ev(a, () => { document.getElementById('tourModal').classList.add('hidden'); });
  const t2Shot = await ev(t2, () => { setTheme('dark'); setTeacherTab('items'); return getComputedStyle(document.getElementById('rqTab-items')).backgroundColor; });
  check(t2Shot === 'rgb(58, 74, 107)', 'teacher tabs: selected tab stands out in dark mode');
  await sleep(250);
  await t2.screenshot({ path: `${SHOTS}/teacher-items-dark.png` });
  // Signed-out phone in dark mode: the sign-in art is the night version.
  const g = await openPhone('new-phone', backend);
  await g.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await g.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await sleep(500);
  check(/login-portrait-dark\.webp/.test(await ev(g, () => getComputedStyle(document.querySelector('.gate-art')).backgroundImage)), 'sign-in screen: night art in dark mode');
  await g.screenshot({ path: `${SHOTS}/login-portrait-dark.png` });
  await g.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await sleep(500);
  check(/login-landscape-dark\.webp/.test(await ev(g, () => getComputedStyle(document.querySelector('.gate-art')).backgroundImage)), 'wide screens: landscape night art');
  await g.screenshot({ path: `${SHOTS}/login-landscape-dark.png` });

  out('12 update check while the app is closed');
  const bg = await ev(a, async () => {
    const realPerm = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });
    window.__ps = null;
    await registerBackgroundUpdateCheck({ periodicSync: { register: async (tag, o) => { window.__ps = [tag, o.minInterval]; } } });
    const on = bgSyncState;
    openAbout();
    const note = document.getElementById('aboutBgSync');
    const r = { on, ps: window.__ps, note: note && note.dataset.state };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'denied' }) } });
    await registerBackgroundUpdateCheck({ periodicSync: { register: async () => {} } });
    r.off = bgSyncState;
    await registerBackgroundUpdateCheck({});
    r.none = bgSyncState;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: realPerm });
    closeAbout();
    return r;
  });
  check(bg.on === 'on' && bg.ps && bg.ps[0] === 'app-update-check' && bg.ps[1] === 12 * 3600 * 1000, 'registers a 12-hour background check when Chrome allows it');
  check(bg.note === 'on' && bg.off === 'off' && bg.none === 'unsupported', 'About says whether it is on; off without permission; nothing on other browsers');
  await ev(a, () => runLaunchURL(new URL('?go=about', location.href)));
  await until(a, () => !document.getElementById('aboutPanel').classList.contains('hidden'), 'About from the notification', 3000);
  check(await ev(a, () => !document.getElementById('aboutPanel').classList.contains('hidden')), 'tapping “update ready” opens About');

  // sw.js itself, run in a sandbox: newer version online → download it and notify once.
  const swCode = fs.readFileSync(path.join(HERE, '..', '..', 'sw.js'), 'utf8');
  const version = swCode.match(/const CACHE = 'custodianpro-([^']+)'/)[1];
  const listeners = {}, shown = [], store = new Map();
  let updated = 0, html = '<meta name="app-version" content="abc123def456">', windows = [];
  const self = {
    addEventListener: (t, f) => { listeners[t] = f; },
    registration: { scope: 'https://x/', update: async () => { updated++; }, showNotification: async (t, o) => { shown.push([t, o]); } },
    clients: { matchAll: async () => windows, claim: async () => {} }, location: { origin: 'https://x' }, skipWaiting: () => {}
  };
  const Notification = { permission: 'granted' };
  self.Notification = Notification;
  const caches = { open: async () => ({ match: async k => (store.has(k) ? new Response(store.get(k)) : undefined), put: async (k, r) => { store.set(k, await r.text()); } }), keys: async () => [] };
  vm.runInNewContext(swCode, { self, caches, Notification, Response, Request, URL, console, setTimeout, clearTimeout, fetch: async () => new Response(html) });
  const sync = async () => { let p; listeners.periodicsync({ tag: 'app-update-check', waitUntil: x => { p = x; } }); await p; };
  await sync();
  check(updated === 1 && shown.length === 1 && shown[0][0] === 'CustodianPro update ready' && shown[0][1].data.go === 'about', 'newer version: downloaded and a phone notification shown');
  await sync();
  check(shown.length === 1, 'the same version is announced only once');
  html = `<meta name="app-version" content="${version}">`; store.clear();
  await sync();
  check(shown.length === 1 && updated === 1, 'no notification when already up to date');
  html = '<meta name="app-version" content="ffffffffffff">'; windows = [{ visibilityState: 'visible', url: 'https://x/' }];
  await sync();
  check(shown.length === 1, 'skipped while the app is open on screen (it tells the user itself)');
  let posted = null;
  windows = [{ url: 'https://x/', focus: async () => {}, postMessage: m => { posted = m; } }];
  let wait;
  listeners.notificationclick({ notification: { close() {}, data: { go: 'about' } }, waitUntil: x => { wait = x; } });
  await wait;
  check(posted && posted.type === 'launch' && posted.go === 'about', 'tapping it focuses the app and opens About');
} catch (e) {
  out('FAIL: exception', e && e.stack || e);
  process.exitCode = 1;
} finally {
  summary('coa-forms');
  await closeAll();
}
