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
  await until(t, () => reqRole && reqRole.role === 'teacher' && cloud.user && myMemberLoaded && myMemberStatus() === 'active', 'joined and approved', 8000);
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
  txt = await ev(a, () => document.getElementById('tvList').innerText);
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

  out('7 Inventory: the item sheet opens the person');
  await release(a, ana, [{ code: D, qty: 1 }]);
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(200);
  await ev(a, code => openItemSheet(code), D);
  const sel = await ev(a, uid => !!document.querySelector(`#itemSheet button[onclick="closeItemSheet(); openTeachersView('${uid}')"]`), ana);
  check(sel, '“Ana Reyes” in the item sheet links to her page');
  await a.click(`#itemSheet button[onclick="closeItemSheet(); openTeachersView('${ana}')"]`);
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

  out('10 filters and sorting');
  await ev(a, () => openTeachersView());
  await sleep(200);
  const names = async () => (await ev(a, () => [...document.querySelectorAll('#tvList [data-tvrow]')].map(r => r.querySelector('.block.text-sm').textContent)));
  check(await ev(a, () => document.querySelectorAll('#tvChips [data-tvf]').length === 8 && !!document.querySelector('#tvChips [data-tvf="lost"]')), 'eight filter chips, incl. Lost');
  await a.click('[data-tvf="confirm"]');
  check(JSON.stringify(await names()) === '["Ana Reyes"]', 'To confirm: Ana only');
  await a.click('[data-tvf="noacct"]');
  check(JSON.stringify(await names()) === '["Pedro Santos"]', 'No account: Pedro only');
  await a.click('[data-tvf="reports"]');
  check(JSON.stringify(await names()) === '["Ana Reyes"]', 'Open reports: Ana only');
  await a.click('[data-tvf="reports"]'); // tap again: all
  check(await ev(a, () => teachersFilter) === 'all', 'tapping the chip again shows everyone');
  await ev(a, () => setTeachersSort('value'));
  const byValue = await names();
  check(byValue[0] === 'Ana Reyes', `sort by value: Ana first (${byValue.join(', ')})`);
  await ev(a, () => setTeachersSort('oldest'));
  check((await names())[0] === 'Ana Reyes', 'sort by oldest unconfirmed slip: Ana first');
  await ev(a, () => setTeachersSort('name'));

  out('11 ICS not confirmed → Remind');
  await until(t, () => !!notifScope() && loadNotifs().primed.releases, 'teacher notifications primed', 8000);
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  check(/not confirmed/.test(await ev(a, () => document.getElementById('tvRemind')?.innerText || '')), 'Ana’s page: “… not confirmed …” note');
  await a.click('#tvRemindBtn');
  await waitNode(() => rels().some(r => r.teacherUid === ana && r.remindMs), 'remindMs on the slips');
  check(rels().filter(r => r.teacherUid === ana && r.remindMs).length >= 1, 'unconfirmed slips carry the reminder');
  await until(t, () => loadNotifs().items.some(n => /Reminder from the property custodian/.test(n.title)), 'teacher bell', 8000);
  check(await ev(t, () => loadNotifs().items.some(n => /Reminder from the property custodian/.test(n.title) && /tap Received/.test(n.body))), 'Ana gets “Reminder from the property custodian” in the bell');
  check(/Reminded/.test(await ev(a, () => document.getElementById('tvRemind').innerText)), 'note says when she was reminded');

  out('12 condition summary links to the IIRUP');
  await ev(a, (c, id) => { const u = getUnits(c).find(x => x.id === id); u.cond = 'R'; u.condAt = Date.now(); saveStateWith({}); openTeachersView(); }, P, pedroUnit.id);
  await sleep(200);
  const cond = await ev(a, () => [...document.querySelectorAll('[data-tvcond]')].map(b => b.innerText).join('|'));
  check(/1 for repair/.test(cond), `list row: “1 for repair” (${cond.replace(/\s+/g, ' ')})`);
  await a.click('[data-tvcond]');
  await sleep(200);
  check(await ev(a, () => !document.getElementById('coaModal').classList.contains('hidden') && coaPage === 'unserv'), 'opens the IIRUP form');
  await ev(a, () => closeCoa());

  out('13 teachers count their items');
  const anaNow = await ev(a, uid => accountabilityPeople().find(p => p.key === uid).equipment.map(x => ({ id: x.unit.id, code: x.item.code })), ana);
  check(anaNow.length === 2, 'Ana holds 2 units');
  await ev(t, () => setTeacherTab('items'));
  await until(t, () => teacherHoldings(myReleases).equipment.length === 2, 'Ana’s phone: 2 items', 8000);
  await ev(t, () => openTeacherCount());
  await sleep(150);
  check(await ev(t, () => document.querySelectorAll('#tcList [data-tc]').length) === 6, 'count sheet: Here / Broken / Missing for each item');
  const missingId = anaNow.find(x => x.code === D).id;
  await t.click(`[data-tc="${missingId}"][data-s="missing"]`);
  check(/1 flagged/.test(await ev(t, () => document.getElementById('tcSend').innerText)), 'send button: 1 flagged');
  await t.click('#tcSend');
  await until(a, () => tReports.some(x => x.kind === 'count'), 'count arrives', 8000);
  await until(a, () => tReports.some(x => x.kind === 'count' && x.applied), 'count applied', 8000);
  const seen = await ev(a, (ids) => ids.map(x => !!(getUnits(x.code).find(u => u.id === x.id).seen)), anaNow);
  check(seen.filter(Boolean).length === 1 && !seen[anaNow.findIndex(x => x.id === missingId)], 'the unit she has is counted, the missing one is not');
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  const yr = await ev(a, () => countSince().year);
  check(new RegExp(`Counted ${yr}: 1 of 2`).test(await ev(a, () => document.getElementById('tvCounted').innerText)), `Ana’s page: “Counted ${yr}: 1 of 2”`);
  await ev(a, () => openTeachersView(null));
  await sleep(200);
  const inbox = await ev(a, () => document.getElementById('tvReview').innerText);
  check(/Year-end count/i.test(inbox) && /counted their items/.test(inbox) && /1 missing/.test(inbox) && /DOCUMENT CAMERA/i.test(inbox), 'To review: “Year-end count · Ana Reyes counted their items: 1 missing”');
  await ev(a, () => openTeachersView());
  await sleep(100);
  await a.click('[data-tvf="uncounted"]');
  const nc = await names();
  check(nc.includes('Ana Reyes') && nc.includes('Pedro Santos'), `Not counted yet: Ana (1 of 2) and Pedro (${nc.join(', ')})`);
  await ev(a, () => setTeachersFilter('all'));
  await until(t, () => document.getElementById('tcCard')?.dataset.tcState === 'done', 'Ana’s card', 8000);
  check(/1 present · 1 missing/.test(await ev(t, () => document.getElementById('tcCard').innerText)), 'Ana’s phone: “Counted … 1 present · 1 missing”');
  // found it: All present
  await ev(t, () => sendTeacherCount(true));
  await until(a, () => tReports.filter(x => x.kind === 'count').length === 2 && tReports.filter(x => x.kind === 'count').every(x => x.applied), 'second count applied', 8000);
  check(await ev(a, (ids) => ids.every(x => !!getUnits(x.code).find(u => u.id === x.id).seen), anaNow), 'All present: both units counted');
  await waitNode(() => backend.docs('schools/').some(d => /teacherReports/.test(d.path) && d.kind === 'count' && d.status === 'done' && d.resolution === 'counted'), 'all-present count closed');
  check(backend.docs('schools/').some(d => /teacherReports/.test(d.path) && d.kind === 'count' && d.status === 'done'), 'an all-present count needs nothing from the custodian');
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  check(new RegExp(`Counted ${yr}: 2 of 2`).test(await ev(a, () => document.getElementById('tvCounted').innerText)), `“Counted ${yr}: 2 of 2”`);
  check(await ev(a, () => countRows(false, countSince().ms).concat(countRows(true, countSince().ms)).filter(r => r.count && r.unit.toUid).length) >= 2, 'her units count on the RPCPPE / RPCSP');

  out('14 teachers print their own list');
  await ev(t, () => printMyList());
  await sleep(200);
  const mine = await ev(t, () => document.getElementById('printPrSection').innerText);
  check(/SUMMARY OF ACCOUNTABILITY/.test(mine) && /ANA REYES/.test(mine) && /MULTIMEDIA PROJECTOR/.test(mine) && /DOCUMENT CAMERA/.test(mine) && /ALCOHOL/.test(mine), 'Print my list: her equipment and supplies');
  check(/San Jose National High School/.test(mine) && /ICS \d{4}-\d{2}-\d{3}/.test(mine), 'with the school and ICS numbers');
  check(await ev(t, () => window.__printed) >= 1, 'print dialog opened on her phone');

  out('15 supply usage per teacher');
  await ev(a, () => openTeachersView('@usage'));
  await sleep(200);
  let use = await ev(a, () => document.getElementById('tvBody').innerText);
  check(/All teachers/i.test(use) && /ALCOHOL/.test(use) && /Ana Reyes/.test(use), 'usage page: all teachers and Ana');
  const q = await ev(a, () => `Q${Math.floor(new Date().getMonth() / 3) + 1}`);
  const cells = await ev(a, () => [...document.querySelector('.usage-table tbody tr').children].map(td => td.textContent.trim()));
  check(cells[Math.floor(new Date().getMonth() / 3) + 1] === '5' && cells[5] === '5', `5 bottles in ${q} (${cells.join(' | ')})`);
  await a.click('[data-usage-mode="sy"]');
  use = await ev(a, () => document.getElementById('usageYear').textContent);
  check(/^SY \d{4}–\d{2}$/.test(use), `school year view (${use})`);
  await ev(a, () => { window.__csvText = ''; const o = downloadText; window.downloadText = (t, f, ty) => { window.__csvText = t; window.__csvName = f; o(t, f, ty); }; });
  await a.click('[data-usage-csv]');
  const csv = await ev(a, () => window.__csvText);
  check(/"Teacher","Position","Office","Stock No\.","Item","Unit","Jun–Aug","Sep–Nov","Dec–Feb","Mar–May","Total qty"/.test(csv) && /"Ana Reyes"/.test(csv) && /"5"/.test(csv), 'CSV for the APP-CSE');
  await ev(a, () => setUsageMode('q'));

  out('16 same person as… (merge a typed name)');
  const typed = await ev(a, c => { const u = getUnits(c).find(x => !x.to && !x.toUid); setUnitField(c, u.id, 'to', 'A. Reyes'); saveStateWith({}); return u.id; }, D);
  await ev(a, () => { const F = cloud.sdk; return F.setDoc(F.doc(relCol()), cleanJSON(relBase({ uid: null, name: 'A. Reyes' }, { kind: 'RIS', no: nextReleaseNo('RIS', localISODate()), date: localISODate(), purpose: 'typed', lines: [{ code: '12191601-AL-E04', desc: 'ALCOHOL', unit: 'bottle', qty: 2, unitCost: 50, units: [] }], total: 100, createdMs: Date.now(), createdAt: F.serverTimestamp() }))); });
  await until(a, () => accountabilityPeople().some(p => p.name === 'A. Reyes' && p.equipment.length === 1 && p.ris.length === 1), 'A. Reyes listed', 8000);
  const typedKey = await ev(a, () => accountabilityPeople().find(p => p.name === 'A. Reyes').key);
  await ev(a, k => openTeachersView(k), typedKey);
  await sleep(200);
  await a.click('#tvMergeBtn');
  await sleep(200);
  check(await ev(a, () => !document.getElementById('pickModal').classList.contains('hidden')), 'picker opens');
  const firstPick = await ev(a, () => document.querySelector('#pickList [data-pick] .text-sm').textContent);
  check(firstPick === 'Ana Reyes', `same last name first (${firstPick})`);
  await a.click(`#pickList [data-pick="${ana}"]`);
  await until(a, uid => teachersSel === uid, 'Ana’s page after merge', 5000, ana);
  const mu = await ev(a, (c, id) => getUnits(c).find(u => u.id === id), D, typed);
  check(mu.toUid === ana && mu.to === 'Ana Reyes', 'unit now assigned to Ana’s account');
  check(await ev(a, () => !accountabilityPeople().some(p => p.name === 'A. Reyes')), '“A. Reyes” is gone from the list');
  await waitNode(() => rels().some(r => r.source === 'existing' && r.teacherUid === ana && r.mergedFrom === 'A. Reyes') && rels().some(r => r.kind === 'RIS' && r.teacherUid === ana && r.mergedFrom === 'A. Reyes'), 'slips moved');
  check(rels().some(r => r.kind === 'RIS' && r.teacherUid === ana && r.mergedFrom === 'A. Reyes'), 'the RIS under “A. Reyes” moved to Ana');
  check(rels().some(r => r.source === 'existing' && r.teacherUid === ana && r.lines.some(l => l.units.some(u => u.id === typed))), 'a linked ICS for the typed unit');
  await until(t, () => teacherHoldings(myReleases).equipment.length === 3, 'Ana’s My Items: 3 items', 8000);
  check(await ev(t, () => teacherHoldings(myReleases).equipment.length) === 3, 'Ana’s My Items shows the merged unit');

  out('17 property clearance');
  const pedroKey = await ev(a, () => accountabilityPeople().find(p => p.name === 'Pedro Santos').key);
  await ev(a, k => openTeachersView(k), pedroKey);
  await sleep(150);
  await a.click('#tvClearBtn');
  await sleep(150);
  check(await ev(a, () => document.getElementById('tvClearance')?.dataset.clear) === 'todo', 'Pedro is not cleared: 1 item to return or transfer');
  check(await ev(a, () => !!document.getElementById('tvXferAll') && !!document.getElementById('tvTakeAll')), 'Transfer all to… and Take back all');
  const before = rels().filter(r => r.source === 'taken-back').length;
  await a.click('#tvTakeAll');
  await sleep(300);
  check(await ev(a, (c, id) => { const u = getUnits(c).find(x => x.id === id); return !u.to && !u.toUid; }, P, pedroUnit.id), 'Take back all: his projector is back in stock');
  await waitNode(() => rels().filter(r => r.source === 'taken-back').length === before + 1, 'one RRSP');
  check(rels().some(r => r.source === 'taken-back' && r.teacherName === 'Pedro Santos' && /clearance/.test(r.purpose)), 'one RRSP for Pedro');
  check(await ev(a, () => document.getElementById('tvClearance').dataset.clear) === 'ok', 'now cleared');
  await a.click('#tvCertBtn');
  await sleep(200);
  const cert = await ev(a, () => document.getElementById('printPrSection').innerText);
  check(/CERTIFICATE OF NO PROPERTY ACCOUNTABILITY/.test(cert) && /PEDRO SANTOS/.test(cert) && /no outstanding property accountability/.test(cert) && /Taken back/.test(cert), 'Certificate of No Property Accountability, with what he returned');
  await ev(a, () => document.body.classList.add('printing-pr'));
  await a.emulateMediaType('print');
  await a.screenshot({ path: '/tmp/e2e_tv_cert.png' });
  await a.emulateMediaType('screen');
  await ev(a, () => document.body.classList.remove('printing-pr'));
  // Transfer all opens the transfer sheet with every unit ticked
  await ev(a, uid => { teachersClear = uid; openTeachersView(uid); }, ana);
  await sleep(150);
  await a.click('#tvXferAll');
  await sleep(200);
  check(await ev(a, () => xfer && xfer.unitIds.size === 3), 'Transfer all to…: all 3 of Ana’s units ticked');
  await ev(a, () => closeTransfer());

  out('18 computer: list on the left, the person on the right');
  await a.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(300);
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(300);
  const lay = await ev(a, () => {
    const l = document.getElementById('tvListPane').getBoundingClientRect(), d = document.getElementById('tvDetailPane').getBoundingClientRect();
    return { l: l.width, d: d.width, side: l.right <= d.left, backs: [...document.querySelectorAll('#viewTeachers .tv-back')].map(b => getComputedStyle(b).display), table: !!document.querySelector('#tvBody table.tv-eq [data-tunit]') || !!document.querySelector('#tvBody table.tv-eq tr[data-tunit]'), sel: !!document.querySelector('[data-tvrow][class*="ring-2"]') };
  });
  check(lay.side && lay.l > 250 && lay.d > lay.l, `two panes side by side (${Math.round(lay.l)} + ${Math.round(lay.d)} px)`);
  check(lay.backs.every(d => d === 'none'), '“Supply requests” and “All teachers” back links hidden');
  check(lay.table, 'equipment as a table');
  check(lay.sel, 'Ana highlighted in the list');
  await a.screenshot({ path: '/tmp/e2e_tv_laptop.png' });
  await ev(a, () => openTeachersView(null));
  await sleep(200);
  check(/pick someone on the left/i.test(await ev(a, () => document.getElementById('tvBody').innerText)), 'nothing picked: a hint on the right');
  // To review lives in the right pane while nobody is picked; the list keeps a row that brings it back
  const rv = await ev(a, () => {
    const box = document.getElementById('tvReview'), row = document.querySelector('#tvReviewRow button');
    const top = document.getElementById('tvListTitle').getBoundingClientRect().top;
    return { total: teachersToReview().total, inDetail: box.parentNode.id === 'tvDetailPane' && !box.classList.contains('hidden'), firstRight: document.getElementById('tvDetailPane').firstElementChild === box,
      sameTop: Math.abs(box.getBoundingClientRect().top - top) < 12, row: !!row && row.getAttribute('aria-current') === 'true' && /To review/.test(row.innerText) };
  });
  check(rv.total > 0, `something to review (${rv.total})`);
  check(rv.inDetail && rv.firstRight && rv.sameTop, 'To review: at the top of the right pane, level with the page title (not above both panes)');
  check(rv.row, 'the list has a “To review” row, marked current');
  await sleep(100);
  const arrows = await ev(a, () => { const t = document.getElementById('rvTrack'), ar = document.querySelector('.rv-arrows');
    return { n: t.querySelectorAll('.rv-card').length, over: t.scrollWidth > t.clientWidth + 4, shown: !!ar && getComputedStyle(ar).display !== 'none' && getComputedStyle(ar).visibility !== 'hidden' }; });
  if (arrows.n > 1 && arrows.over) {
    check(arrows.shown && await ev(a, () => document.getElementById('rvPrev').disabled), `computer: ${arrows.n} cards, ‹ › arrows, ‹ off at the start`);
    await a.click('#rvNext');
    await sleep(700);
    check(await ev(a, () => document.getElementById('rvTrack').scrollLeft > 0 && !document.getElementById('rvPrev').disabled), '› scrolls the row');
  } else check(!arrows.shown, `computer: ${arrows.n} card(s) all fit → no arrows`);
  check(await ev(a, () => [...document.querySelectorAll('#rvTrack .rv-card')].every(c => { const t = c.querySelector('[data-rv-tile] i'); return t && /ph-duotone/.test(t.className); })), 'each card has its category icon tile');
  const list = await ev(a, () => { const l = document.getElementById('tvListPane'); return { bar: l.offsetWidth - l.clientWidth, sw: getComputedStyle(l).scrollbarWidth, scrolls: l.scrollHeight > l.clientHeight + 4, fade: l.classList.contains('tv-more-below') }; });
  check(list.bar === 0 && list.sw === 'none', 'the list has no visible scrollbar');
  check(!list.scrolls || list.fade, `list ${list.scrolls ? 'scrolls: faded at the bottom' : 'fits: no fade'}`);
  // a large monitor: the page widens and the cards share the row instead of leaving a gap
  await a.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(400);
  const big = await ev(a, () => { const t = document.getElementById('rvTrack'), cs = [...t.querySelectorAll('.rv-card')]; const used = cs.reduce((n, c) => n + c.getBoundingClientRect().width, 0) + (cs.length - 1) * 12;
    return { n: cs.length, fill: used / t.clientWidth, view: document.getElementById('viewTeachers').getBoundingClientRect().width, over: t.scrollWidth > t.clientWidth + 4 }; });
  check(big.view > 1300 && big.fill > 0.97 && !big.over, `1920 px: page ${Math.round(big.view)} px wide, ${big.n} cards fill the row (${Math.round(big.fill * 100)}%)`);
  await a.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(300);
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  const picked = await ev(a, () => ({ hidden: document.getElementById('tvReview').classList.contains('hidden'), rowOn: document.querySelector('#tvReviewRow button').hasAttribute('aria-current'), inline: !!document.querySelector('#tvBody [data-treport]'), note: /under To review above/.test(document.getElementById('tvBody').innerText) }));
  check(picked.hidden && !picked.rowOn, 'someone picked: their page replaces To review');
  check(picked.inline && !picked.note, 'their open report is shown on their page, with its buttons');
  await a.click('#tvReviewRow button');
  await sleep(200);
  check(await ev(a, () => !teachersSel && !document.getElementById('tvReview').classList.contains('hidden')), 'the To review row brings it back');
  check(await ev(a, () => [...document.querySelectorAll('#tvListTitle .tv-acts > button')].every(b => b.getBoundingClientRect().height < 44)), 'header buttons on one line (“Supply usage” does not wrap)');
  // (switching to touch reloads the page)
  await a.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  await sleep(500);
  await until(a, () => typeof openTeachersView === 'function' && reqRole && cloud.user && releasesLoaded && invReady, 'custodian back after reload', 15000);
  await ev(a, () => openTeachersView(null));
  await sleep(300);
  check(await ev(a, () => sidebarLayout() && getComputedStyle(document.getElementById('tvDetailPane')).display !== 'none' && getComputedStyle(document.querySelector('#viewTeachers .tv-back')).display === 'none'), 'tablet held sideways: two panes, back link hidden');
  await a.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(300);
  await until(a, () => typeof openTeachersView === 'function' && reqRole && cloud.user && releasesLoaded && invReady, 'custodian ready', 15000);
  await ev(a, () => openTeachersView(null));
  await sleep(300);
  check(await ev(a, () => getComputedStyle(document.getElementById('tvDetailPane')).display === 'none' && getComputedStyle(document.querySelector('#viewTeachers .tv-back')).display !== 'none'), 'phone: the list only, with the back link');
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  check(await ev(a, () => getComputedStyle(document.getElementById('tvListPane')).display === 'none' && !document.querySelector('#tvBody table.tv-eq')), 'phone: one person, equipment as cards');

  const appDenied = backend.denied;
  check(appDenied.length === 0, `no refused writes or reads (${appDenied.length}) ${appDenied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('teachers-overview');
  await closeAll();
}
