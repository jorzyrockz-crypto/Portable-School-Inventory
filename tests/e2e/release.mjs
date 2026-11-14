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
  await until(page, () => reqRole && reqRole.role === 'teacher' && cloud.user && myMemberLoaded && myMemberStatus() === 'active', 'joined and approved', 8000);
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
  await ev(a, () => { loadSampleInventory(); schoolInfo.numbering = 'unit'; /* a school set up before the COA default */ schoolInfo.custodian = 'Rosa Villanueva'; schoolInfo.position = 'Property Custodian'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); }); // signed out: the sign-in screen carries the form
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
  check(after.equip === pick.equip.qty, 'equipment stays in Inventory');
  check(after.units.length === 1 && after.units[0].to === 'Ana Reyes' && after.units[0].toUid === anaUid && after.units[0].ics === `${ym}-001`, 'unit marked With Ana Reyes · ICS no.');
  check(/Released to Ana Reyes/.test(after.done), 'done screen');
  await waitNode(() => rel().length >= 2, 'release docs online');
  const ris = rel().find(d => d.kind === 'RIS'), ics = rel().find(d => d.kind === 'ICS');
  check(ris && ris.teacherUid === anaUid && ris.lines[0].qty === 4 && ris.no === `${ym}-001`, 'RIS saved online for Ana');
  check(ics && ics.lines[0].units.length === 1 && ics.lines[0].units[0].no, 'ICS saved with the property number');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'released'), 'request released', 8000, reqId);
  const rq = reqs().find(d => d.path.endsWith(reqId));
  check(rq.status === 'released' && rq.releaseNos.join() === `RIS ${ym}-001,ICS ${ym}-001`, 'request marked Released with the slip numbers');
  // Item history: the release shows under each item (supply and equipment), once
  await until(a, () => releaseList.some(r => r.kind === 'RIS' && !r.sending) && releaseList.some(r => r.kind === 'ICS' && !r.sending), 'slips listed', 8000);
  const hist = await ev(a, (s, e) => {
    const view = code => { openHistory(code); setHistoryKind('release'); const t = document.getElementById('historyList').innerText; closeHistory(); return t; };
    const sup = view(s), eq = view(e);
    // as on another phone (or before this device's history began): only the account's slips
    const keep = changeHistory; changeHistory = changeHistory.filter(x => x.k !== 'release');
    const other = view(s); const otherEq = view(e);
    changeHistory = keep;
    return { sup, eq, other, otherEq };
  }, pick.supply.code, pick.equip.code);
  check(/Released to Ana Reyes/i.test(hist.sup) && (hist.sup.match(/Released/gi) || []).length === 1, `supply history (Releases) shows the release once: “${hist.sup.split('\n').find(l => /Released/i.test(l))}”`);
  check(/Released to Ana Reyes/i.test(hist.eq), 'equipment history shows it too (units handed out, quantity unchanged)');
  check(new RegExp(`Released 4 .* to Ana Reyes · RIS ${ym}-001 \\(request\\)`, 'i').test(hist.other) && /school account/i.test(hist.other), `made on another device: from the school account (“${hist.other.split('\n').find(l => /Released/i.test(l))}”)`);
  check(new RegExp(`ICS ${ym}-001`).test(hist.otherEq), 'equipment: the ICS slip with its property number');
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

  out('4 Inventory shows who has it');
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(300);
  check(await ev(a, code => /with Ana Reyes/i.test(document.querySelector(`#dashboardLedgerContainer .inv-row[data-code="${code}"]`).innerText), pick.equip.code), 'row label: With Ana Reyes');
  await ev(a, code => openItemSheet(code), pick.equip.code);
  const chipText = await ev(a, () => {
    const b = [...document.querySelectorAll('#itemSheet button')].find(b => /openTeachersView\(/.test(b.getAttribute('onclick') || ''));
    return b ? b.innerText.replace(/\s+/g, ' ').trim() : '';
  });
  check(chipText.includes('Ana Reyes') && chipText.includes(`ICS ${ym}-001`), `item sheet: “${chipText}”`);
  await ev(a, code => { closeItemSheet(); openItemSheet(code); }, pick.supply.code);
  check(await ev(a, () => !!document.getElementById('isRelease').offsetParent), 'Release button in the item sheet');
  await ev(a, () => itemSheetGo('release'));
  await sleep(200);
  check(await ev(a, () => !document.getElementById('releaseModal').classList.contains('hidden') && document.getElementById('itemSheet').classList.contains('hidden')), 'Release opens the release form (sheet closes)');
  await ev(a, () => closeRelease());
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
  // Cancel PR: a PR saved by mistake is kept (Cancelled) and its request goes back to To purchase
  await ev(a, () => { setReqTab('approved'); openPrFromPicked(); savePr(); });
  await until(a, () => prList.length === 1, 'first PR saved', 8000);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'pr'), 'request on first PR', 8000, req2);
  const firstPr = await ev(a, () => ({ id: prList[0].id, prNo: prList[0].prNo }));
  await ev(a, () => setReqTab('prs'));
  check(await ev(a, id => !!document.querySelector(`button[onclick="cancelPr('${id}')"]`) && !!document.querySelector(`button[onclick="editPr('${id}')"]`), firstPr.id), 'saved PR has Edit and Cancel PR');
  a.dialogs.prompt = 'Saved by mistake';
  await ev(a, id => { cancelPr(id); }, firstPr.id);
  await until(a, id => prList.some(p => p.id === id && p.status === 'cancelled'), 'PR cancelled', 8000, firstPr.id);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'approved'), 'request back to To purchase', 8000, req2);
  a.dialogs.prompt = '';
  await sleep(300);
  const cx = await ev(a, (id, rid) => ({ pr: prList.find(p => p.id === id), req: reqList.find(r => r.id === rid),
    html: prList.filter(p => p.id === id).map(prCardHTML).join(''), hist: changeHistory.some(e => /Cancelled Purchase Request .* Saved by mistake/.test(e.x)) }), firstPr.id, req2);
  check(cx.pr.cancelReason === 'Saved by mistake' && !cx.req.prNo && !cx.req.prId, 'cancelled PR keeps the reason; the request leaves the PR');
  check(/Cancelled/.test(cx.html) && !/editPr|cancelPr|markPrDelivered/.test(cx.html), 'cancelled PR shows Cancelled and can no longer be changed or delivered');
  check(cx.hist, 'cancelling is in the change history');
  await ev(a, () => { setReqTab('approved'); openPrFromPicked(); savePr(); });
  await until(a, () => prList.filter(p => p.status !== 'cancelled').length === 1, 'PR saved', 8000);
  check(await ev(a, no => prList[0].prNo !== no, firstPr.prNo), 'the cancelled PR No. is not used again');
  const prLines = await ev(a, () => prList[0].lines);
  check(prLines.find(l => l.code === lowItem.code).qty === 6, 'PR buys only what is not in stock (6)');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'pr'), 'request on PR', 8000, req2);
  // Save as Excel: Appendix 60 laid out like the printed form, with live formulas
  await ev(a, () => setReqTab('prs'));
  await until(a, id => !!document.querySelector(`button[onclick="exportPrXlsxById('${id}')"]`), 'Excel button', 5000, await ev(a, () => prList[0].id));
  const xl = await ev(a, async () => {
    const pr = prList[0];
    const bytes = await buildXlsx(prSheet(pr));   // loads fflate
    const files = fflate.unzipSync(bytes);
    const sheet = fflate.strFromU8(files['xl/worksheets/sheet1.xml']);
    const n = pr.lines.length, padIdx = pr.lines.findIndex(l => !l.stockNo);
    return { parts: Object.keys(files).sort().join(','), sheet, n, prNo: pr.prNo, padIdx, office: pr.office, html: prPrintHTML(pr) };
  });
  check(xl.parts.includes('xl/workbook.xml') && xl.parts.includes('xl/styles.xml') && xl.parts.includes('[Content_Types].xml'), 'Excel file has a workbook, a sheet and styles');
  check(/Appendix 60/.test(xl.sheet) && /PURCHASE REQUEST/.test(xl.sheet) && xl.sheet.includes(`>${xl.prNo}<`) && /paperSize="9"/.test(xl.sheet), 'laid out as Appendix 60 on A4, with the PR No.');
  check(xl.sheet.includes('<f>D9*E9</f>') && xl.sheet.includes(`<f>SUM(F9:F${8 + Math.max(15, xl.n)})</f>`), 'Total Cost = Quantity × Unit Cost and the total are live formulas');
  check(xl.padIdx < 0 || (xl.html.includes(`<td class="pr-sn c">${xl.padIdx + 1}</td>`) && xl.sheet.includes(`<t xml:space="preserve">${xl.padIdx + 1}</t>`)), 'a line with no stock no. shows its line number (print and Excel)');
  await ev(a, id => exportPrXlsxById(id), await ev(a, () => prList[0].id));
  await sleep(300);
  check(/saved as an Excel file/.test(await ev(a, () => document.getElementById('appToastText').innerText)), 'Excel button saves the file');
  // Edit a saved PR: add an item, change a quantity and the PR No.; Change History says what changed
  const pre = await ev(a, () => ({ id: prList[0].id, prNo: prList[0].prNo, n: prList[0].lines.length, total: prList[0].total }));
  await ev(a, id => editPr(id), pre.id);
  check(await ev(a, () => !document.getElementById('prModal').classList.contains('hidden') && /Changing PR No/.test(document.getElementById('prSub').textContent)
    && /Save changes/.test(document.getElementById('prSaveLabel').textContent)), 'Edit opens the saved PR');
  const ed = await ev(a, () => {
    const box = document.getElementById('prAdd');
    box.value = 'Whiteboard marker, refillable'; addPrLine(box);
    const l = prDraft.lines[prDraft.lines.length - 1];
    setPrLine(l.id, 'qty', '4'); setPrLine(l.id, 'unitCost', '35');
    const listed = document.getElementById('prItemList').options.length;
    document.getElementById('prNo').value = 'EDITED-01';
    return { added: { ...l }, listed, rows: document.querySelectorAll('#prLines > div').length };
  });
  check(ed.added.desc === 'Whiteboard marker, refillable' && !ed.added.code && ed.rows === pre.n + 1 && ed.listed > 0, 'Add item on the PR screen (typed new item; Inventory items listed)');
  const invAdd = await ev(a, () => {
    const it = items.find(i => !prDraft.lines.some(l => l.code === i.code));
    const box = document.getElementById('prAdd'); box.value = `${it.name} · ${it.code}`; addPrLine(box);
    const l = prDraft.lines[prDraft.lines.length - 1];
    const ok = l.code === it.code && l.unit === (it.unit || 'piece');
    removePrLine(l.id);
    return ok;
  });
  check(invAdd, 'picking an Inventory item fills its stock no. and unit');
  await ev(a, () => { savePr(); });
  await until(a, id => { const p = prList.find(x => x.id === id); return p && p.prNo === 'EDITED-01' && p.editedMs; }, 'PR changed', 8000, pre.id);
  await until(a, id => reqList.some(r => r.id === id && r.prNo === 'EDITED-01'), 'request follows the new PR No.', 8000, req2);
  const af = await ev(a, id => ({ pr: prList.find(x => x.id === id), n: prList.length, hist: (changeHistory.find(e => /Changed Purchase Request EDITED-01/.test(e.x)) || {}).x || '' }), pre.id);
  check(af.n === 2 && af.pr.lines.length === pre.n + 1 && Math.abs(af.pr.total - (pre.total + 140)) < 0.01, `PR updated in place (no new PR), total ₱${af.pr.total}`);
  check(/PR No\. .* → EDITED-01/.test(af.hist) && /\+ Whiteboard marker \(4\)/.test(af.hist) && /total ₱/.test(af.hist), `change history says what changed (${af.hist.slice(0, 90)})`);
  // take the marker off again so the delivery below is unchanged
  await ev(a, id => { editPr(id); const l = prDraft.lines.find(x => /Whiteboard marker/.test(x.desc)); removePrLine(l.id); savePr(); }, pre.id);
  await until(a, (id, n) => prList.find(x => x.id === id).lines.length === n, 'line removed', 8000, pre.id, af.pr.lines.length - 1);
  check(/− Whiteboard marker/.test(await ev(a, () => changeHistory.filter(e => /Changed Purchase Request/.test(e.x)).pop().x)), 'removed line in the change history');
  await ev(a, () => { setReqTab('prs'); markPrDelivered(prList[0].id); });
  await sleep(500);
  const stocked = await ev(a, c => ({ low: items.find(i => i.code === c).qty, pad: items.find(i => /RUBBER STAMP PAD/.test(i.name)) }), lowItem.code);
  check(stocked.low === lowItem.qty + 6, `delivered stock added (${lowItem.qty} → ${stocked.low})`);
  check(stocked.pad && stocked.pad.qty === 3 && stocked.pad.price === 45, 'item not in Inventory added as a new item (3 at ₱45)');
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
  await until(a, c => items.find(i => i.code === c).qty === 0, 'stock updated', 5000, lowItem.code).catch(() => {});
  const leftQty = await ev(a, c => items.find(i => i.code === c).qty, lowItem.code);
  check(leftQty === 0, `released supplies left the stock (qty ${leftQty})`);
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

  out('9b remove a typed name with no units left (a test slip)');
  const sup = await ev(a, () => { const i = items.find(x => x.type !== 'EQUIPMENT' && x.qty >= 3); return { code: i.code, qty: i.qty }; });
  await ev(a, () => openRelease());
  await ev(a, () => { setRelTeacher('__other'); relOtherName.value = 'lol'; });
  await ev(a, code => { const inp = document.getElementById('relAdd'); inp.value = `x · ${code}`; addRelItem(inp); }, sup.code);
  await ev(a, () => { releaseDraft.lines[0].qty = 2; });
  await a.click('#relSaveBtn');
  await until(a, () => releaseList.filter(r => r.teacherName === 'lol').length === 1, 'lol release', 8000);
  await ev(a, () => closeRelease());
  const lolRel = rel().find(d => d.teacherName === 'lol');
  const lolNo = lolRel && lolRel.no;
  check(lolRel && lolRel.kind === 'RIS' && lolRel.lines[0].qty === 2, `RIS ${lolNo} for “lol” (2 out of stock)`);
  check(await ev(a, c => items.find(i => i.code === c).qty, sup.code) === sup.qty - 2, 'stock went down by 2');
  await ev(a, () => openTeachersView('n:lol'));
  await until(a, () => !!document.getElementById('tvRemoveName'), 'remove button', 4000);
  check(await ev(a, () => !!document.getElementById('tvRemoveName')), 'typed name with no units: Remove button on its page');
  check(await ev(a, () => /Typed on a slip/.test(document.getElementById('tvList').innerText)), 'list says “Typed on a slip”');
  await ev(a, () => openTeachersView(accountabilityPeople().find(p => p.name === 'Lorna Bautista').key));
  check(await ev(a, () => !document.getElementById('tvRemoveName')), 'no Remove for a typed name still holding units (Lorna)');
  await ev(a, () => openTeachersView('n:lol'));
  await until(a, () => !!document.getElementById('tvRemoveName'), 'remove button again', 4000);
  a.dialogs.length = 0;
  await a.click('#tvRemoveName');
  await until(a, () => !accountabilityPeople().some(p => p.name === 'lol'), 'lol gone', 6000);
  check(a.dialogs.some(d => /Remove “lol” from the list/.test(d) || /marked Cancelled/.test(d)), 'asks first (slips cancelled, not deleted)');
  check(await ev(a, () => !accountabilityPeople().some(p => p.name === 'lol') && teachersSel === null), '“lol” is off the list');
  await waitNode(() => (rel().find(d => d.teacherName === 'lol') || {}).void === true, 'void on the server');
  const voided = rel().find(d => d.teacherName === 'lol');
  check(voided && voided.void === true && voided.voidedMs > 0 && !!voided.voidedByUid, 'the slip is kept on the server, marked cancelled (who and when)');
  check(await ev(a, c => items.find(i => i.code === c).qty, sup.code) === sup.qty, 'the 2 go back to stock');
  await waitNode(() => invQty(sup.code) === sup.qty, 'stock synced');
  check(invQty(sup.code) === sup.qty, 'stock back in the school inventory');
  check(await ev(a, () => changeHistory.some(e => /Removed “lol” from Teachers/.test(e.x))), 'in the change history');
  check(await ev(a, () => !/Typed on a slip/.test(document.getElementById('tvList').innerText) || !document.getElementById('tvList').innerText.includes('lol')), 'not shown in the list');
  check(await ev(a, (no, ym) => nextReleaseNo('RIS', ym + '-15') !== no, lolNo, ym), 'its RIS number is not reused');
  await ev(a, () => switchMainView('HOME'));

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
