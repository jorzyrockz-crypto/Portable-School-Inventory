// Inspection & Acceptance (IAR, Appendix 62): a PR's delivery is inspected on a teacher's own
// phone (sent by the custodian) or on the custodian's phone, signed by tapping, then accepted:
// stock goes up, equipment gets property numbers and the school's own ICS (head → custodian,
// COA: SPLV / SPHV apart), short lines stay open for the next delivery, the requests become
// Ready, each teacher's share is released, and the Distribution List fills in with the
// teachers' "Received". Print and Excel for the IAR and the Distribution List.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const insps = () => backend.docs('schools/').filter(d => /\/inspections\//.test(d.path));
const prs = () => backend.docs('schools/').filter(d => /\/purchaseRequests\//.test(d.path));
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
  await until(page, () => reqRole && reqRole.role === 'teacher' && cloud.user && myMemberLoaded && myMemberStatus() === 'active', 'joined and approved', 8000);
  return ev(page, () => cloud.user.uid);
}

try {
  out('1 custodian (COA numbering), two teachers');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.numbering = 'coa'; schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'AO II'; schoolInfo.head = 'John Russell L. Guadalupe'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'Oquendo Elementary School'; rcEmail.value = 'rhea@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'inventory synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const ana = await openPhone('teacher-ana', backend);
  const anaUid = await joinAsTeacher(ana, sid, 'Jennabeth A. Calizo', 'Teacher IV', 'Grade II');
  const juan = await openPhone('teacher-juan', backend);
  const juanUid = await joinAsTeacher(juan, sid, 'Leonard Q. Fuentes', 'Teacher I', 'Grade I');
  await until(a, (x, y) => teacherRoster().some(t => t.uid === x) && teacherRoster().some(t => t.uid === y), 'both in roster', 8000, anaUid, juanUid);

  out('2 Juan’s request → PR');
  await ev(juan, () => {
    reqDraft = { lines: [
      { id: 'L0', code: null, desc: 'Water dispenser, hot and cold', unit: 'unit', qty: 2 },
      { id: 'L1', code: null, desc: 'Steel rack, 4 layers', unit: 'unit', qty: 1 },
      { id: 'L2', code: null, desc: 'Bond paper, A4, 70 gsm', unit: 'ream', qty: 10 }
    ], forOther: false };
    document.getElementById('rfPurpose').value = 'Grade I classroom';
    sendRequest();
  });
  await until(a, () => reqList.some(r => r.status === 'pending'), 'request arrived', 8000);
  const reqId = await ev(a, () => reqList.find(r => r.status === 'pending').id);
  await ev(a, id => {
    switchMainView('REQUESTS'); openReview(id);
    const cost = { 'Water dispenser': 8900, 'Steel rack': 4500, 'Bond paper': 230 };
    reviewState.lines.forEach(l => { l.code = null; l.unitCost = cost[Object.keys(cost).find(k => l.desc.startsWith(k))]; });
    approveRequest();
  }, reqId);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'approved'), 'approved', 8000, reqId);
  await ev(a, () => { setReqTab('approved'); openPrFromPicked(); document.getElementById('prNo').value = '2026-11-15'; savePr(); });
  await until(a, () => prList.length === 1 && prList[0].prNo === '2026-11-15', 'PR saved', 8000);
  await until(a, id => reqList.some(r => r.id === id && r.status === 'pr'), 'request on the PR', 8000, reqId);
  const prId = await ev(a, () => prList[0].id);
  await ev(a, () => setReqTab('prs'));
  const card = await ev(a, id => ({ inspect: !!document.querySelector(`[data-inspect-pr="${id}"]`), delivered: !!document.querySelector(`button[onclick="markPrDelivered('${id}')"]`) }), prId);
  check(card.inspect && card.delivered, 'PR card: Inspect delivery (and Items delivered without an IAR)');

  out('3 send the inspection to the teacher’s phone');
  await ev(a, id => openInspectPr(id), prId);
  check(await ev(a, () => !document.getElementById('iarModal').classList.contains('hidden') && iarDraft.stage === 'new' && iarDraft.lines.length === 3 && iarDraft.poNo === '2026-11-15' && iarDraft.iarNo === '2026-11-15'),
    'checklist opens: 3 lines, PO No. and IAR No. default to the PR No.');
  await ev(a, uid => {
    document.querySelector('[data-iar="invoice"]').value = '7001-7002'; iarDraft.invoice = '7001-7002';
    iarDraft.supplier = 'EJ Marketing';
    iarDraft.who = uid; renderIar();
  }, anaUid);
  check(await ev(a, () => !!document.getElementById('iarSend') && document.getElementById('iarSign').disabled), 'a teacher who joined: Send to her phone; Sign waits until every line is checked');
  await ev(a, () => { iarSendToPhone(); });
  await waitNode(() => insps().some(d => d.status === 'assigned'), 'assigned inspection');
  const sent = insps()[0];
  check(sent && sent.inspectorUid === anaUid && sent.inspectorName === 'Jennabeth A. Calizo' && sent.invoice === '7001-7002' && sent.supplier === 'EJ Marketing' && sent.lines.every(l => l.received === null),
    'inspection saved for Jennabeth (invoice, supplier, nothing checked yet)');
  await until(a, () => /Waiting for/.test(document.getElementById('reqBody') ? document.getElementById('reqBody').innerText : document.body.innerText), 'waiting row', 5000);
  check(await ev(a, id => !document.querySelector(`[data-inspect-pr="${id}"]`) && !document.querySelector(`button[onclick="editPr('${id}')"]`), prId), 'PR card: waiting for the inspector; no Edit or second inspection meanwhile');
  check(await ev(a, () => JSON.parse(localStorage.getItem('custodian_iar_defaults_v1')).inspName === 'Jennabeth A. Calizo'), 'the app remembers the inspector');

  out('4 the inspector checks and signs on her phone');
  await until(ana, () => !!document.querySelector('[data-teacher-insp]'), 'teacher sees the inspection', 8000);
  check(true, 'teacher’s phone: “Inspect a delivery” card');
  check(await ev(juan, () => inspList.length === 0), 'other teachers don’t see it');
  await ev(ana, () => openInspection(inspList[0].id));
  check(await ev(ana, () => iarDraft.stage === 'inspect' && /7001-7002/.test(document.getElementById('iarBody').innerText)), 'checklist on her phone with PO, invoice and supplier');
  await ev(ana, () => {
    const at = re => iarDraft.lines.findIndex(l => re.test(l.desc));
    iarSetLine(at(/dispenser/i), 'ok'); iarSetLine(at(/rack/i), 'ok'); iarSetLine(at(/paper/i), 'short');
    iarSetReceived(at(/paper/i), '6');
    iarDraft.lines[at(/paper/i)].note = '4 reams to follow';
  });
  check(/Partial · 2 complete, 1 short/.test(await ev(ana, () => document.getElementById('iarSummary').textContent)), 'summary: Partial · 2 complete, 1 short');
  await ev(ana, () => { iarSign(); });
  await waitNode(() => insps()[0].status === 'inspected', 'signed on the server');
  const signed = insps()[0];
  check(signed.inspectedVia === 'own-phone' && signed.inspectedMs > 0 && signed.lines.find(l => /paper/i.test(l.desc)).received === 6 && signed.lines.find(l => /paper/i.test(l.desc)).note === '4 reams to follow', 'signed on her phone: quantities, note, date and time');
  check(ana.dialogs.some(d => /Sign as Jennabeth A\. Calizo, Teacher IV/.test(d) && /found in order as to quantity and specifications/.test(d)), 'tap to confirm: name + the IAR statement');

  out('5 the custodian accepts (partial)');
  await until(a, id => !!document.querySelector('[data-iar-accept]'), 'Accept delivery on the PR card', 8000);
  check(await ev(a, () => loadNotifs().items.some(n => /inspected PO No\. 2026-11-15/.test(n.title))), 'custodian is notified when the inspector signs');
  await ev(a, () => openInspection(document.querySelector('[data-iar-accept]').dataset.iarAccept));
  check(await ev(a, () => iarDraft.stage === 'accept' && /Partial/.test(document.getElementById('iarKind').textContent)), 'Accept screen: Partial from the quantities');
  // PO prices: prefilled with the PR's; the dispenser came cheaper, the rack dearer
  const po0 = await ev(a, () => {
    const at = re => iarInsp().lines.findIndex(l => re.test(l.desc));
    const before = { d: iarDraft.po[at(/dispenser/i)], r: iarDraft.po[at(/rack/i)], inputs: document.querySelectorAll('[data-iar-po]').length, sum: document.getElementById('iarPoSum').textContent };
    iarSetPo(at(/dispenser/i), '8500');
    const cheaper = { diff: document.querySelector(`[data-iar-podiff="${at(/dispenser/i)}"]`).textContent, sum: document.getElementById('iarPoSum').textContent };
    iarSetPo(at(/rack/i), '4800');
    const dearer = { diff: document.querySelector(`[data-iar-podiff="${at(/rack/i)}"]`).textContent, sum: document.getElementById('iarPoSum').textContent };
    iarSetPo(at(/rack/i), '4300');
    return { before, cheaper, dearer, after: document.getElementById('iarPoSum').textContent };
  });
  check(po0.before.d === 8900 && po0.before.r === 4500 && po0.before.inputs === 3 && /PO ₱23,680\.00 · PR ₱23,680\.00/.test(po0.before.sum), 'PO unit cost on each item that came, prefilled with the PR price');
  check(/PR ₱8,900\.00 · ₱400\.00 less/.test(po0.cheaper.diff) && /₱800\.00 less than the PR/.test(po0.cheaper.sum), 'PO below the PR: shows how much less (₱400 a unit, ₱800 in all)');
  check(/₱300\.00 more/.test(po0.dearer.diff) && /1 item costs more on the PO than on the PR/.test(po0.dearer.sum), 'PO above the PR: flagged before accepting');
  check(/₱1,000\.00 less than the PR/.test(po0.after), 'totals follow the PO prices');
  await ev(a, () => { document.getElementById('iarDateReceived').value = '2026-11-06'; iarDraft.dateReceived = '2026-11-06'; iarAccept(); });
  await waitNode(() => insps()[0].status === 'accepted', 'accepted on the server');
  const acc = insps()[0];
  const stock = await ev(a, () => {
    const f = re => items.find(i => re.test(i.name));
    const d = f(/^WATER DISPENSER, HOT AND COLD$/i), r = f(/^STEEL RACK, 4 LAYERS$/i), p = f(/^BOND PAPER, A4, 70 GSM$/i);
    return { d: d && { qty: d.qty, units: getUnits(d.code).map(u => u.no), type: d.type }, r: r && { qty: r.qty, units: getUnits(r.code).length }, p: p && p.qty };
  });
  check(stock.d && stock.d.qty === 2 && stock.d.units.length === 2 && stock.r.qty === 1 && stock.p === 6, `stock in: 2 dispensers (numbered ${stock.d && stock.d.units.join(', ')}), 1 rack, 6 reams`);
  const prices = await ev(a, () => ({ d: items.find(i => /^WATER DISPENSER, HOT AND COLD$/i.test(i.name)).price, r: items.find(i => /^STEEL RACK, 4 LAYERS$/i.test(i.name)).price, p: items.find(i => /^BOND PAPER, A4, 70 GSM$/i.test(i.name)).price }));
  check(prices.d === 8500 && prices.r === 4300 && prices.p === 230, `inventory costs use the PO price (₱${prices.d}, ₱${prices.r}, ₱${prices.p})`);
  check(acc.poTotal === 22680 && acc.prTotal === 23680 && acc.lines.find(l => /dispenser/i.test(l.desc)).unitCost === 8500 && acc.lines.find(l => /dispenser/i.test(l.desc)).prCost === 8900, 'IAR keeps the PO and PR prices (₱22,680 vs ₱23,680)');
  check(acc.schoolIcs.find(s => /SPHV/.test(s.no)).total === 17000, 'school ICS amounts at the PO price (2 × ₱8,500)');
  check(acc.complete === false && acc.dateReceived === '2026-11-06' && acc.receivedBy.name === 'Rhealyn B. Nadado', 'IAR: Partial, Date Received, accepted by the custodian');
  const ics = acc.schoolIcs || [];
  check(ics.length === 2 && ics.some(s => /^SPHV-2026-11-0001$/.test(s.no) && /DISPENSER/i.test(s.lines[0].desc) && s.lines[0].qty === 2) && ics.some(s => /^SPLV-2026-11-0001$/.test(s.no) && /RACK/i.test(s.lines[0].desc)),
    `school ICS: SPHV for the ₱8,900 dispensers, SPLV for the ₱4,500 rack (${ics.map(s => s.no).join(', ')})`);
  const pr1 = prs()[0];
  check(!pr1.deliveredMs && Object.values(pr1.received).sort().join(',') === '1,2,6', 'PR keeps what came; still open (4 reams short)');
  check(await ev(a, id => reqList.find(r => r.id === id).status, reqId) === 'pr', 'request stays on the PR until everything came');
  const papers = await ev(a, async () => {
    const x = inspList.find(i => i.status === 'accepted');
    const iar = iarPrintHTML(x), sch = icsPrintHTML(schoolIcsRecord(x, 0));
    const bytes = await buildXlsx(iarSheet(x));
    const sheet = fflate.strFromU8(fflate.unzipSync(bytes)['xl/worksheets/sheet1.xml']);
    return { iar, sch, sheet, card: document.querySelector(`[data-iar-row="${x.id}"]`) ? 1 : 0 };
  });
  check(/Appendix 62/.test(papers.iar) && /INSPECTION AND ACCEPTANCE REPORT/.test(papers.iar) && /JENNABETH A\. CALIZO/.test(papers.iar) && /RHEALYN B\. NADADO/.test(papers.iar) && /7001-7002/.test(papers.iar) && /EJ Marketing/.test(papers.iar),
    'IAR print: Appendix 62 with supplier, invoice, inspector and custodian');
  check(/Partial \(pls\. specify quantity\)<br><span[^>]*>Bond paper, A4, 70 gsm: 6 of 10/.test(papers.iar) && /11\/06\/2026/.test(papers.iar), 'IAR print: Partial with the short quantity, dates');
  check(/JOHN RUSSELL L\. GUADALUPE/.test(papers.sch) && /RHEALYN B\. NADADO/.test(papers.sch) && papers.sch.indexOf('GUADALUPE') < papers.sch.indexOf('NADADO</b><br><span style="font-size:8.5pt">Signature'), 'school ICS: received from the head, received by the custodian');
  check(/Appendix 62/.test(papers.sheet) && /INSPECTION AND ACCEPTANCE REPORT/.test(papers.sheet) && /Partial/.test(papers.sheet), 'IAR as Excel (Appendix 62)');
  check(papers.card === 1, 'PR card lists IAR 2026-11-15');
  check(await ev(a, () => /PO ₱22,680\.00 \(₱1,000\.00 below PR\)/.test(document.querySelector('[data-iar-row]').textContent) && changeHistory.some(e => /PO ₱22,680\.00 \(₱1,000\.00 below the PR\)/.test(e.x))), 'PR card and change history: PO total and how much below the PR');
  check(await ev(a, () => changeHistory.some(e => e.k === 'delivery' && /Accepted delivery IAR 2026-11-15 .*partial/.test(e.x)) && changeHistory.some(e => /Jennabeth A\. Calizo inspected PO 2026-11-15/.test(e.x) || /sent to Jennabeth/.test(e.x))), 'change history: sent, accepted (partial)');
  await ev(a, () => closeIar());

  out('6 the rest comes: inspected on the custodian’s phone');
  await ev(a, () => setReqTab('prs'));
  check(/Still to come: 4 ream/.test(await ev(a, () => document.body.innerText)), 'PR card: still to come 4 reams');
  await ev(a, id => openInspectPr(id), prId);
  const nd = await ev(a, () => ({ n: iarDraft.lines.length, qty: iarDraft.lines[0].qty, iarNo: iarDraft.iarNo, who: iarDraft.who, supplier: iarDraft.supplier }));
  check(nd.n === 1 && nd.qty === 4 && nd.iarNo === '2026-11-15-2' && nd.who === anaUid && nd.supplier === 'EJ Marketing', 'next inspection: only the 4 reams, IAR No. 2026-11-15-2, inspector and supplier remembered');
  await ev(a, () => { iarAllComplete(); iarSign(); });
  await until(a, () => iarDraft && iarDraft.stage === 'accept', 'accept right away', 5000);
  await ev(a, () => iarAccept());
  await waitNode(() => insps().filter(d => d.status === 'accepted').length === 2, 'second accepted');
  const second = insps().find(d => d.iarNo === '2026-11-15-2');
  check(second && second.inspectedVia === 'here' && second.complete === true && !(second.schoolIcs || []).length, 'signed here; Complete; no ICS for supplies');
  await waitNode(() => !!prs()[0].deliveredMs, 'PR delivered');
  check(!!prs()[0].deliveredMs, 'everything came: PR delivered');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'closed'), 'request ready', 8000, reqId);
  check(true, 'the request shows Ready');
  check(await ev(a, () => { const p = prList[0]; return Object.values(p.poCosts || {}).sort((x, y) => x - y).join(','); }) === '230,4300,8500', 'PO prices kept on the PR for later deliveries');

  out('7 release Juan’s share; Distribution List');
  check(await ev(a, id => !!document.querySelector(`[data-iar-release="${id}"]`), reqId), 'papers screen: release each teacher’s share');
  await ev(a, id => iarRelease(id), reqId);
  check(await ev(a, () => releaseDraft && releaseDraft.lines.length === 3), 'release drafted from the request (3 items)');
  await a.click('#relSaveBtn');
  await until(a, id => reqList.some(r => r.id === id && r.status === 'released'), 'released', 8000, reqId);
  const relNos = await ev(a, () => releaseList.map(r => `${r.kind} ${r.no}`));
  check(relNos.includes('ICS SPHV-2026-11-0002') && relNos.includes('ICS SPLV-2026-11-0002'), `teacher’s ICS numbers follow the school receipt (${relNos.join(', ')})`);
  await ev(a, () => closeRelease());
  await until(juan, () => myReleases.length === 3, 'Juan’s releases', 8000);
  await ev(juan, () => myReleases.forEach(r => ackRelease(r.id)));
  await until(a, () => tReports.filter(x => x.kind === 'received').length === 3, 'received x3', 8000);
  const dl = await ev(a, async id => {
    const pr = prList.find(p => p.id === id);
    const html = dlPrintHTML(pr);
    const sheet = fflate.strFromU8(fflate.unzipSync(await buildXlsx(dlSheet(pr)))['xl/worksheets/sheet1.xml']);
    return { html, sheet, d: dlData(pr) };
  }, prId);
  check(dl.d.people.length === 1 && dl.d.people[0].name === 'Leonard Q. Fuentes' && dl.d.lines.every(l => l.left === 0) && dl.d.lines.map(l => l.per[0]).join(',') === '10,1,2', 'Distribution List: Leonard got 10 reams, 1 rack and 2 dispensers; nothing left');
  check(/DISTRIBUTION LIST/.test(dl.html) && /LEONARD Q\. FUENTES/.test(dl.html) && /P\.O\. No\.: <b>2026-11-15/.test(dl.html) && dl.d.people[0].allAcked, 'DL print: P.O. No., one column per teacher, received date filled in from his phone');
  check(/DISTRIBUTION LIST/.test(dl.sheet) && /<f>SUM\(D5:D5\)<\/f>/.test(dl.sheet), 'DL as Excel with totals');

  out('7b all papers in one Excel file');
  const wb = await ev(a, async id => {
    const pr = prList.find(p => p.id === id);
    const files = fflate.unzipSync(await buildXlsx(prWorkbookSheets(pr)));
    const book = fflate.strFromU8(files['xl/workbook.xml']);
    const tabs = [...book.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
    const sheets = Object.keys(files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).length;
    const types = fflate.strFromU8(files['[Content_Types].xml']);
    const rels = fflate.strFromU8(files['xl/_rels/workbook.xml.rels']);
    const price = fflate.strFromU8(files[`xl/worksheets/sheet${tabs.indexOf('PR vs PO') + 1}.xml`]);
    const ics = fflate.strFromU8(files[`xl/worksheets/sheet${tabs.findIndex(t => /^ICS SPHV/.test(t)) + 1}.xml`]);
    return { tabs, sheets, types: (types.match(/worksheet\+xml/g) || []).length, rels: (rels.match(/worksheets\/sheet/g) || []).length, price, ics, btn: !!document.querySelector(`[data-pr-workbook="${id}"]`) };
  }, prId);
  check(wb.tabs.join(' | ') === 'PR 2026-11-15 | IAR 2026-11-15 | IAR 2026-11-15-2 | ICS SPLV-2026-11-0001 | ICS SPHV-2026-11-0001 | DL 2026-11-15 | PR vs PO' && wb.sheets === 7 && wb.types === 7 && wb.rels === 7,
    `one workbook, a tab per form (${wb.tabs.join(', ')})`);
  check(/PR ESTIMATE vs PO PRICE/.test(wb.price) && /<f>G\d+-H\d+<\/f>/.test(wb.price) && /<v>1000<\/v>/.test(wb.price), 'PR vs PO tab: per-item difference and ₱1,000 less in all (formulas)');
  check(/INVENTORY CUSTODIAN SLIP/.test(wb.ics) && /JOHN RUSSELL L\. GUADALUPE/.test(wb.ics) && /RHEALYN B\. NADADO/.test(wb.ics) && /<f>A\d+\*C\d+<\/f>/.test(wb.ics), 'ICS tab (Appendix 59): head → custodian, amounts as formulas');
  check(wb.btn, 'PR card: All papers · 1 Excel');
  const saved = await ev(a, async id => {
    let name = null; const orig = window.downloadBytes;
    window.downloadBytes = (bytes, n) => { name = n; };
    try { await exportPrWorkbookById(id); } finally { window.downloadBytes = orig; }
    return name;
  }, prId);
  check(saved === 'PR_2026-11-15_all_papers.xlsx', `the button saves the workbook (${saved})`);

  out('8 Forms → Slips & receipts');
  await ev(a, () => { openCoa(); coaGo('slips'); });
  await until(a, () => !!document.getElementById('coaSlips'), 'slips page');
  const slips = await ev(a, () => document.getElementById('coaSlips').textContent);
  check(/IAR 2026-11-15/.test(slips) && /IAR 2026-11-15-2/.test(slips) && /ICS SPHV-2026-11-0001/.test(slips) && /School receipt/.test(slips) && /Distribution list · PO 2026-11-15/.test(slips), 'IARs, school ICS and the Distribution List listed with the slips');
  await ev(a, () => { coaSlipKind = 'IAR'; renderCoa(); });
  const onlyIar = await ev(a, () => document.getElementById('coaSlips').textContent);
  check(/IAR 2026-11-15/.test(onlyIar) && !/RIS /.test(onlyIar) && !/Distribution/.test(onlyIar), 'IAR filter');
  await ev(a, () => { coaSlipKind = 'ALL'; closeCoa(); });

  out('9 permissions');
  const denied = backend.denied.filter(x => !/list releases|read members/.test(x));
  check(denied.length === 0, `app flows refused 0 times (${denied.length}) ${denied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('iar');
  await closeAll();
}
