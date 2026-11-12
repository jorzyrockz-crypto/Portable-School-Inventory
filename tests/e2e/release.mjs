// Teachers and releases: teachers join (roster), a request is approved and released from
// stock (RIS for supplies, ICS for equipment), slips print, names typed on ICS slips are
// linked when the teacher joins, "Assigned to" picks a teacher, a delivered PR adds stock,
// and teachers can read only their own releases.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const rel = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
const reqs = () => backend.docs('schools/').filter(d => /\/requests\//.test(d.path));
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
const invQty = code => { const d = backend.docs('schools/').find(x => /\/inventory\//.test(x.path) && x.code === code); return d ? parseInt(d.state.qty, 10) || 0 : null; };

async function joinAsTeacher(page, schoolId, name, position, office) {
  await page.goto(BASE_URL + '#join=' + schoolId, { waitUntil: 'networkidle0' });
  await until(page, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(page, (n, p, o) => { joinName.value = n; joinPosition.value = p; joinOffice.value = o; }, name, position, office);
  await page.click('#joinBtn');
  await until(page, () => reqRole && reqRole.role === 'teacher' && cloud.user, 'joined');
  return ev(page, () => cloud.user.uid);
}
async function teacherRequest(page, lines, purpose) {
  await ev(page, (lines, purpose) => {
    reqDraft = { lines: lines.map((l, i) => ({ id: 'L' + i, ...l })), forOther: false };
    document.getElementById('rfPurpose').value = purpose;
    sendRequest();
  }, lines, purpose);
}

try {
  out('1 custodian with inventory; teachers join');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rosa Villanueva'; schoolInfo.position = 'Property Custodian'; });
  await ev(a, () => openRequestsView());
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'inventory synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);

  // Inventory facts: a supply with stock, equipment with free tagged units.
  const pick = await ev(a, () => {
    const supply = items.find(i => i.type === 'CONSUMABLE' && i.qty >= 10);
    // Give two equipment items property numbers (the third stays untagged).
    items.filter(i => i.type === 'EQUIPMENT' && i.qty >= 2 && i.qty <= 4).slice(0, 2).forEach(i => { openUnitsModal(i.code); generateUnitTags(); closeUnitsModal(); });
    const equip = items.filter(i => i.type === 'EQUIPMENT' && getUnits(i.code).length >= 2 && getUnits(i.code).every(u => !u.to));
    return { supply: { code: supply.code, name: supply.name, qty: supply.qty, unit: supply.unit },
      equip: { code: equip[0].code, name: equip[0].name, qty: equip[0].qty, unit: equip[0].unit },
      equip2: equip[1] ? { code: equip[1].code, name: equip[1].name } : null };
  });
  check(!!pick.supply && !!pick.equip && !!pick.equip2, `sample has a supply (${pick.supply.code}) and equipment with property numbers`);

  // Before Juan joins: a scanned ICS said "MR. JUAN D. DELA CRUZ" for one unit of equip2.
  const typed = await ev(a, code => {
    const [u1, u2] = getUnits(code);
    setUnitField(code, u1.id, 'to', 'MR. JUAN D. DELA CRUZ');
    setUnitField(code, u1.id, 'ics', '2024-03-017');
    setUnitField(code, u2.id, 'to', 'Pedro Santos');
    return { u1: u1.id, u2: u2.id };
  }, pick.equip2.code);

  const t1 = await openPhone('teacher-ana', backend);
  const anaUid = await joinAsTeacher(t1, sid, 'Ana Reyes', 'Teacher III', 'Grade 7 – Science');
  await until(a, uid => teacherRoster().some(t => t.uid === uid && t.joined), 'Ana in roster', 8000, anaUid);
  const anaMember = backend.docs('schools/').find(d => d.path.endsWith('/members/' + anaUid));
  check(anaMember && anaMember.name === 'Ana Reyes' && anaMember.position === 'Teacher III', 'teacher’s phone wrote her roster card');

  out('2 approve a request and release it from stock');
  await teacherRequest(t1, [
    { code: pick.supply.code, desc: pick.supply.name, unit: pick.supply.unit, qty: 4 },
    { code: pick.equip.code, desc: pick.equip.name, unit: pick.equip.unit, qty: 1 }
  ], 'Science laboratory classes');
  await until(a, () => reqList.some(r => r.status === 'pending'), 'request arrives');
  const reqId = await ev(a, () => reqList.find(r => r.status === 'pending').id);
  await ev(a, id => { switchMainView('REQUESTS'); setReqTab('pending'); openReview(id); approveRequest(); setReqTab('approved'); }, reqId);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'approved'), 'approved', 8000, reqId);
  await until(a, id => !!document.querySelector(`button[onclick="openReleaseFromRequest('${id}')"]`), 'Release button on the approved card', 5000, reqId);
  check(await ev(a, id => !!document.querySelector(`button[onclick="openReleaseFromRequest('${id}')"]`), reqId), 'all-in-stock approved request has a Release button');
  await a.click(`button[onclick="openReleaseFromRequest('${reqId}')"]`);
  await until(a, () => !document.getElementById('releaseModal').classList.contains('hidden'), 'release sheet');
  const sheet = await ev(a, () => ({
    teacher: document.getElementById('relTeacher').selectedOptions[0].textContent,
    lines: releaseDraft.lines.map(l => ({ code: l.code, q: relQty(l), units: l.unitIds ? l.unitIds.length : null })),
    summary: document.getElementById('relSummary').innerText
  }));
  check(/Ana Reyes/.test(sheet.teacher), `teacher preselected (${sheet.teacher})`);
  check(sheet.lines.length === 2 && sheet.lines.find(l => l.code === pick.supply.code).q === 4 && sheet.lines.find(l => l.code === pick.equip.code).units === 1, 'approved lines prefilled (4 supplies, 1 tagged unit)');
  const ym = new Date().toISOString().slice(0, 7);
  check(sheet.summary.includes(`RIS ${ym}-001`) && sheet.summary.includes(`ICS ${ym}-001`), `creates RIS and ICS: “${sheet.summary}”`);
  // Asking for more than in stock is capped.
  await ev(a, c => setRelQty(c, 99999), pick.supply.code);
  check(await ev(a, c => relQty(releaseDraft.lines.find(l => l.code === c)), pick.supply.code) === pick.supply.qty, 'quantity capped at stock on hand');
  await ev(a, c => setRelQty(c, 4), pick.supply.code);
  await a.screenshot({ path: '/tmp/e2e_rel_sheet.png' });
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  const after = await ev(a, (s, e) => ({
    supply: items.find(i => i.code === s).qty, equip: items.find(i => i.code === e).qty,
    units: getUnits(e).filter(u => u.toUid), done: document.getElementById('relDone').innerText
  }), pick.supply.code, pick.equip.code);
  check(after.supply === pick.supply.qty - 4, `supplies left the stock count (${pick.supply.qty} → ${after.supply})`);
  check(after.equip === pick.equip.qty, 'equipment stays in My Items');
  check(after.units.length === 1 && after.units[0].to === 'Ana Reyes' && after.units[0].toUid === anaUid && after.units[0].ics === `${ym}-001`, 'unit marked With Ana Reyes · ICS no.');
  check(/Released to Ana Reyes/.test(after.done), 'done screen');
  await waitNode(() => rel().length >= 2, 'release docs online');
  const ris = rel().find(d => d.kind === 'RIS'), ics = rel().find(d => d.kind === 'ICS');
  check(ris && ris.teacherUid === anaUid && ris.lines[0].qty === 4 && ris.no === `${ym}-001`, 'RIS saved online for Ana');
  check(ics && ics.lines[0].units.length === 1 && ics.lines[0].units[0].no, 'ICS saved with the property number');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'released'), 'request released', 8000, reqId);
  const rq = reqs().find(d => d.path.endsWith(reqId));
  check(rq.status === 'released' && rq.releaseNos.join() === `RIS ${ym}-001,ICS ${ym}-001`, 'request marked Released with the slip numbers');
  await sleep(1500);
  check(invQty(pick.supply.code) === pick.supply.qty - 4, 'new stock count saved to the account');

  out('3 print RIS (Appendix 63) and ICS (Appendix 59)');
  await ev(a, () => printReleaseDone(0));
  await sleep(200);
  const risHTML = await ev(a, () => document.getElementById('printPrSection').innerText);
  check(/Appendix 63/.test(risHTML) && /REQUISITION AND ISSUE SLIP/.test(risHTML) && /ANA REYES/.test(risHTML) && risHTML.includes(`${ym}-001`) && /Science laboratory classes/.test(risHTML), 'RIS printed with number, purpose and receiver');
  check(/ROSA VILLANUEVA/.test(risHTML), 'custodian as Issued by');
  await ev(a, () => printReleaseDone(1));
  await sleep(200);
  const icsHTML = await ev(a, () => document.getElementById('printPrSection').innerText);
  check(/Appendix 59/.test(icsHTML) && /INVENTORY CUSTODIAN SLIP/.test(icsHTML) && icsHTML.includes(after.units[0].no), 'ICS printed with the inventory item no.');
  check(await ev(a, () => window.__printed) === 2, 'print dialog opened twice');
  await ev(a, () => { document.body.classList.add('printing-pr'); });
  await a.emulateMediaType('print');
  await a.screenshot({ path: '/tmp/e2e_rel_ics.png', fullPage: false });
  await a.emulateMediaType('screen');
  await ev(a, () => { document.body.classList.remove('printing-pr'); printRelease(releaseList.find(r => r.kind === 'RIS') || releaseDone.docs[0]); document.body.classList.add('printing-pr'); });
  await a.emulateMediaType('print');
  await a.screenshot({ path: '/tmp/e2e_rel_ris.png', fullPage: false });
  await a.emulateMediaType('screen');
  await ev(a, () => { document.body.classList.remove('printing-pr'); closeRelease(); });

  out('4 My Items shows who has it');
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(300);
  const chipText = await ev(a, code => {
    const row = [...document.querySelectorAll('#masterLedgerSection button')].find(b => b.getAttribute('onclick') === `openUnitsModal('${code}')` && /With|with/.test(b.innerText));
    return row ? row.innerText.trim() : '';
  }, pick.equip.code);
  check(chipText.includes('Ana Reyes') && chipText.includes(`ICS ${ym}-001`), `chip: “${chipText}”`);
  check(await ev(a, code => !!document.querySelector(`button[onclick="openReleaseForItem('${code}')"]`), pick.supply.code), 'Release button on My Items cards');
  await a.screenshot({ path: '/tmp/e2e_rel_items.png' });

  out('5 the teacher’s side');
  await until(t1, () => /Released to you/.test(document.getElementById('rqList').innerText), 'teacher sees Released', 8000);
  check(await ev(t1, () => /Released to you · RIS/.test(document.getElementById('rqList').innerText)), 'teacher’s request card: Released to you · RIS …');
  const tRead = await ev(t1, async sid => {
    const F = cloud.sdk;
    const mine = await F.getDocs(F.query(F.collection(cloud.db, 'schools', sid, 'releases'), F.where('teacherUid', '==', cloud.user.uid)));
    let all = 'allowed', members = 'allowed';
    try { await F.getDocs(F.query(F.collection(cloud.db, 'schools', sid, 'releases'))); } catch (e) { all = e.code; }
    try { await F.getDocs(F.query(F.collection(cloud.db, 'schools', sid, 'members'))); } catch (e) { members = e.code; }
    return { mine: mine.docs.length, all, members };
  }, sid);
  check(tRead.mine === 2, 'teacher reads her own 2 releases');
  check(tRead.all === 'permission-denied' && tRead.members === 'permission-denied', 'teacher cannot list all releases or the roster');

  out('6 name typed on an old ICS is linked when that teacher joins');
  const t2 = await openPhone('teacher-juan', backend);
  const juanUid = await joinAsTeacher(t2, sid, 'Juan Dela Cruz', 'Teacher I', 'Grade 9');
  await until(a, (c, id) => (getUnits(c).find(u => u.id === id) || {}).toUid, 'linked', 10000, pick.equip2.code, typed.u1);
  const linked = await ev(a, (c, ids) => getUnits(c).filter(u => [ids.u1, ids.u2].includes(u.id)).map(u => ({ id: u.id, to: u.to, toUid: u.toUid || null })), pick.equip2.code, typed);
  check(linked.find(u => u.id === typed.u1).toUid === juanUid, '“MR. JUAN D. DELA CRUZ” linked to Juan Dela Cruz’s account');
  check(!linked.find(u => u.id === typed.u2).toUid, 'a name with no account (Pedro Santos) stays as typed');
  await until(a, uid => releaseList.some(r => r.teacherUid === uid && r.source === 'existing'), 'link record', 8000, juanUid);
  const link = rel().find(d => d.teacherUid === juanUid && d.source === 'existing');
  check(link && /\/releases\/link-/.test(link.path) && link.no === '2024-03-017' && link.lines[0].units[0].id === typed.u1, 'an ICS record for Juan (old ICS no. kept)');
  const before = rel().length;
  await a.reload({ waitUntil: 'networkidle0' });
  await until(a, () => inventorySyncActive() && releasesLoaded, 'reloaded', 10000);
  await sleep(1500);
  check(rel().length === before, 'linked only once (no new records after reopening)');

  out('7 Assigned to: pick a teacher, then change it');
  const tl = await ev(a, () => [...document.querySelectorAll('#teacherNameList option')].map(o => o.value));
  check(tl.includes('Ana Reyes') && tl.includes('Juan Dela Cruz'), `pick-list has the teachers (${tl.join(', ')})`);
  const u3 = await ev(a, c => getUnits(c).find(u => !u.to).id, pick.equip.code);
  await ev(a, (c, id) => { openUnitsModal(c); setUnitField(c, id, 'to', 'juan dela cruz'); }, pick.equip.code, u3);
  await sleep(600);
  let u = await ev(a, (c, id) => getUnits(c).find(x => x.id === id), pick.equip.code, u3);
  check(u.toUid === juanUid && u.to === 'Juan Dela Cruz', 'typed “juan dela cruz” → linked, name written as Juan wrote it');
  check(await ev(a, id => document.getElementById(`unitcard-${id}`).innerText.includes('On Juan’s list'), u3), 'unit card: On Juan’s list');
  await ev(a, (c, id) => setUnitField(c, id, 'to', 'Ana Reyes'), pick.equip.code, u3);
  await sleep(1200);
  u = await ev(a, (c, id) => getUnits(c).find(x => x.id === id), pick.equip.code, u3);
  check(u.toUid === anaUid, 'reassigned to Ana');
  const unitRecs = rel().filter(d => d.lines.some(l => (l.units || []).some(x => x.id === u3)));
  check(unitRecs.some(d => d.kind === 'ICS' && d.teacherUid === juanUid && d.source === 'assigned') &&
        unitRecs.some(d => d.kind === 'RETURN' && d.teacherUid === juanUid) &&
        unitRecs.some(d => d.kind === 'ICS' && d.teacherUid === anaUid && d.source === 'assigned'), 'records: ICS to Juan, return from Juan, ICS to Ana');
  await ev(a, () => closeUnitsModal());

  out('8 delivered PR adds stock; then release to the teacher');
  const lowItem = await ev(a, () => { const i = items.find(x => x.type === 'CONSUMABLE' && x.qty > 0 && x.qty < 5); return { code: i.code, name: i.name, unit: i.unit, qty: i.qty }; });
  await teacherRequest(t1, [
    { code: lowItem.code, desc: lowItem.name, unit: lowItem.unit, qty: lowItem.qty + 6 },
    { code: null, desc: 'Rubber stamp pad, violet', unit: 'piece', qty: 3 }
  ], 'Grade 7 class records');
  await until(a, () => reqList.some(r => r.status === 'pending'), 'second request');
  const req2 = await ev(a, () => reqList.find(r => r.status === 'pending').id);
  await ev(a, id => {
    switchMainView('REQUESTS'); openReview(id);
    const pad = reviewState.lines.find(l => /stamp pad/i.test(l.desc));
    pad.code = null; pad.unitCost = 45;
    approveRequest();
  }, req2);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'approved'), 'approved 2', 8000, req2);
  await ev(a, () => { setReqTab('approved'); openPrFromPicked(); savePr(); });
  await until(a, () => prList.length === 1, 'PR saved', 8000);
  const prLines = await ev(a, () => prList[0].lines);
  check(prLines.find(l => l.code === lowItem.code).qty === 6, 'PR buys only what is not in stock (6)');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'pr'), 'request on PR', 8000, req2);
  await ev(a, () => { setReqTab('prs'); markPrDelivered(prList[0].id); });
  await sleep(500);
  const stocked = await ev(a, c => ({ low: items.find(i => i.code === c).qty, pad: items.find(i => /RUBBER STAMP PAD/.test(i.name)) }), lowItem.code);
  check(stocked.low === lowItem.qty + 6, `delivered stock added (${lowItem.qty} → ${stocked.low})`);
  check(stocked.pad && stocked.pad.qty === 3 && stocked.pad.price === 45, 'item not in My Items added as a new item (3 at ₱45)');
  await until(a, () => prList[0].deliveredMs, 'PR delivered', 8000);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'closed'), 'ready', 8000, req2);
  check(await ev(a, () => !document.querySelector('button[onclick^="markPrDelivered"]')), 'Items delivered can’t be pressed twice');
  await until(t1, () => /Ready · get it/.test(document.getElementById('rqList').innerText), 'teacher sees Ready', 8000);
  check(true, 'teacher sees “Ready · get it from the property custodian”');
  await ev(a, () => setReqTab('closed'));
  check(await ev(a, id => !!document.querySelector(`button[onclick="openReleaseFromRequest('${id}')"]`), req2), 'delivered request has a Release button');
  await ev(a, id => openReleaseFromRequest(id), req2);
  const d2 = await ev(a, () => releaseDraft.lines.map(l => ({ code: l.code, q: relQty(l) })));
  check(d2.length === 2 && d2.every(l => l.q > 0), 'both delivered items prefilled (new item matched by name)');
  await a.click('#relSaveBtn');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'released'), 'released 2', 8000, req2);
  check(await ev(a, c => items.find(i => i.code === c).qty, lowItem.code) === 0, 'released supplies left the stock');
  await ev(a, () => closeRelease());

  out('9 release to someone without an account');
  await ev(a, () => openRelease());
  await ev(a, () => { setRelTeacher('__other'); relOtherName.value = 'Lorna Bautista'; relOtherPos.value = 'Utility Worker'; });
  await ev(a, code => { const inp = document.getElementById('relAdd'); inp.value = `x · ${code}`; addRelItem(inp); }, pick.supply.code);
  const untagged = await ev(a, () => { const i = items.find(x => x.type === 'EQUIPMENT' && x.qty > 0 && !getUnits(x.code).length); return { code: i.code, qty: i.qty }; });
  await ev(a, code => { const inp = document.getElementById('relAdd'); inp.value = `x · ${code}`; addRelItem(inp); }, untagged.code);
  check(await ev(a, c => { const l = releaseDraft.lines.find(x => x.code === c); return l.newUnits === 1 && /new numbers are given/.test(document.getElementById('relLines').innerText); }, untagged.code), 'untagged equipment: a new property number will be given');
  await a.click('#relSaveBtn');
  await until(a, () => releaseList.filter(r => r.teacherName === 'Lorna Bautista').length === 2, 'other release', 8000);
  const lorna = rel().find(d => d.teacherName === 'Lorna Bautista' && d.kind === 'RIS');
  check(lorna && lorna.teacherUid === null && lorna.no === `${ym}-003`, `RIS ${ym}-003 for a person without an account`);
  const lornaIcs = rel().find(d => d.teacherName === 'Lorna Bautista' && d.kind === 'ICS');
  const newUnit = await ev(a, c => getUnits(c)[0], untagged.code);
  check(lornaIcs && lornaIcs.lines[0].units[0].no === newUnit.no && newUnit.to === 'Lorna Bautista' && !newUnit.toUid && /-\d{4}$/.test(newUnit.no), `ICS with a new property number (${newUnit.no})`);
  check(await ev(a, c => items.find(i => i.code === c).qty, untagged.code) === untagged.qty, 'equipment count unchanged');
  await ev(a, () => closeRelease());

  out('10 history and permissions');
  check(await ev(a, () => changeHistory.filter(e => e.k === 'release').length) >= 3, 'releases are in the change history');
  const appDenied = backend.denied.filter(x => !/list releases|read members/.test(x));
  check(appDenied.length === 0, `app flows refused 0 times (${appDenied.length}) ${appDenied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('release');
  await closeAll();
}
