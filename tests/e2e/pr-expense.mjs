// Purchase Requests by expense: supplies for the teachers go under Other Supplies and Materials
// Expenses (5020399000), supplies for the office stay under Office Supplies Expenses (5020301000).
// A teacher's request → Other Supplies; a walk-in request marked "The office" → Office Supplies;
// lines added by hand → Office Supplies (changeable with Charge to). The PR groups its lines with
// headings as on the school's form (screen, print, Excel, CSV); the class follows the items into stock
// (userState.other), a release to a teacher takes Other Supplies first and one for the office
// Office Supplies first, Deliveries without a PR ask for the class, and the RSMI fills in the
// UACS object code.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const reqDocs = () => backend.docs('schools/').filter(d => /\/requests\//.test(d.path));
const prDocs = () => backend.docs('schools/').filter(d => /\/purchaseRequests\//.test(d.path));
const relDocs = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
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
const PAPER = '14111507-PP-M02', ALC = '12191601-AL-E03', ERASER = '60121534-ER-P01';

try {
  out('1 custodian and a teacher');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'AO II'; schoolInfo.head = 'John Russell L. Guadalupe'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'Oquendo Elementary School'; rcSchoolNo.value = '301234'; rcEmail.value = 'rhea@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'inventory synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const juan = await openPhone('teacher-juan', backend);
  const juanUid = await joinAsTeacher(juan, sid, 'Leonard Q. Fuentes', 'Teacher I', 'Grade I');
  await until(a, uid => teacherRoster().some(t => t.uid === uid), 'Juan in the roster', 8000, juanUid);

  out('2 a teacher’s request and a walk-in request for the office');
  await ev(juan, (p, al) => {
    reqDraft = { lines: [{ id: 'L0', code: p, desc: 'Bond paper', unit: 'ream', qty: 10 }, { id: 'L1', code: al, desc: 'Alcohol', unit: 'bottle', qty: 4 }], forOther: false };
    document.getElementById('rfPurpose').value = 'Grade I classroom';
    sendRequest();
  }, PAPER, ALC);
  await until(a, () => reqList.some(r => r.name === 'Leonard Q. Fuentes'), 'teacher request arrived', 8000);
  await ev(a, () => openRequestForm());
  const form = await ev(a, () => ({ shown: !document.getElementById('rfUse').closest('#rfWho').classList.contains('hidden'), on: document.querySelector('[data-rf-use][aria-pressed="true"]').dataset.rfUse }));
  check(form.shown && form.on === 'teacher', 'walk-in form: Used by, Teachers to start with');
  await ev(a, () => { rfName.value = 'Ma. Lourdes Abad'; rfPosition.value = 'Administrative Assistant II'; rfOffice.value = 'Principal’s Office'; guessReqUse(rfOffice.value); });
  check(await ev(a, () => document.querySelector('[data-rf-use][aria-pressed="true"]').dataset.rfUse) === 'office', 'office typed: The office is picked by itself');
  await ev(a, () => { setReqDraftUse('teacher'); rfOffice.value = 'Principal’s Office staff room'; guessReqUse(rfOffice.value); });
  check(await ev(a, () => reqDraft.use) === 'teacher', 'a choice made by hand is kept');
  await ev(a, p => {
    setReqDraftUse('office');
    reqDraft.lines = [{ id: 'L0', code: p, desc: 'Bond paper', unit: 'ream', qty: 5 }];
    document.getElementById('rfPurpose').value = 'Office forms';
    sendRequest();
  }, PAPER);
  await waitNode(() => reqDocs().some(d => d.name === 'Ma. Lourdes Abad' && d.use === 'office'), 'office request saved');
  const off = reqDocs().find(d => d.name === 'Ma. Lourdes Abad');
  check(off && off.use === 'office' && off.via === 'custodian', 'walk-in request saved with use: office');
  check(reqDocs().find(d => d.name === 'Leonard Q. Fuentes').use === undefined, 'the teacher’s own request: no use (for teachers)');
  await until(a, () => reqList.some(r => r.name === 'Ma. Lourdes Abad' && r.use === 'office'), 'office request on the list', 8000);
  await ev(a, () => { switchMainView('REQUESTS'); setReqTab('pending'); });
  check(await ev(a, () => document.querySelectorAll('[data-req-office]').length) === 1, 'request card: an Office chip on the office request only');

  out('3 approve both, then one PR');
  const ids = await ev(a, () => ({ t: reqList.find(r => r.name === 'Leonard Q. Fuentes').id, o: reqList.find(r => r.name === 'Ma. Lourdes Abad').id }));
  await ev(a, id => {
    openReview(id);
    reviewState.lines.forEach(l => { l.prQty = l.approved; l.unitCost = /paper/i.test(l.desc) ? 250 : 60; });
    approveRequest();
  }, ids.t);
  const rev = await ev(a, id => { openReview(id); const r = { on: document.querySelector('[data-rev-use][aria-pressed="true"]').dataset.revUse }; return r; }, ids.o);
  check(rev.on === 'office', 'review sheet: Used by · The office');
  await ev(a, () => { reviewState.lines.forEach(l => { l.prQty = l.approved; l.unitCost = 250; }); approveRequest(); });
  await until(a, (t, o) => reqList.filter(r => [t, o].includes(r.id) && r.status === 'approved').length === 2, 'both approved', 8000, ids.t, ids.o);
  await ev(a, () => { setReqTab('approved'); openPrFromPicked(); });
  const draft = await ev(a, () => ({
    lines: prDraft.lines.map(l => `${l.exp}:${l.code}:${l.qty}`),
    groups: [...document.querySelectorAll('[data-pr-grp]')].map(g => g.dataset.prGrp),
    head: document.querySelector('[data-pr-grp="other"] p').innerText,
    selects: document.querySelectorAll('[data-pr-exp]').length
  }));
  check(draft.lines.includes(`office:${PAPER}:5`) && draft.lines.includes(`other:${PAPER}:10`) && draft.lines.includes(`other:${ALC}:4`) && draft.lines.length === 3,
    `bond paper twice: 5 for the office, 10 for the teacher (${draft.lines.join(', ')})`);
  check(draft.groups.join() === 'office,other' && /OTHER SUPPLIES AND MATERIALS EXPENSES/i.test(draft.head) && /5020399000/.test(draft.head) && /₱2,740\.00/.test(draft.head), `PR screen: Office then Other, with the code and subtotal (${draft.head.replace(/\s+/g, ' ')})`);
  check(draft.selects === 3, 'every line has Charge to');
  await ev(a, e => { const i = document.getElementById('prAdd'); i.value = `ERASER · ${e}`; addPrLine(i); }, ERASER);
  const added = await ev(a, e => prDraft.lines.find(l => l.code === e), ERASER);
  check(added && added.exp === 'office', 'a line added by hand: Office Supplies');
  await ev(a, id => setPrLineExp(id, 'other'), added.id);
  check(await ev(a, id => !!document.querySelector(`[data-pr-grp="other"] [data-pr-line="${id}"]`), added.id), 'Charge to Other Supplies moves it to that group');
  await ev(a, () => { const i = document.getElementById('prAdd'); i.value = `ERASER · 60121534-ER-P01`; addPrLine(i); });
  check(await ev(a, e => prDraft.lines.filter(l => l.code === e).length, ERASER) === 2, 'the same item can go on once more under Office Supplies');
  await ev(a, e => { const l = prDraft.lines.find(x => x.code === e && x.exp === 'office'); removePrLine(l.id); }, ERASER);
  await ev(a, () => { document.getElementById('prNo').value = '2026-11-021'; savePr(); });
  await waitNode(() => prDocs().length === 1, 'PR saved');
  const prDoc = prDocs()[0];
  check(prDoc.lines.map(l => l.exp).join() === 'office,other,other,other' && prDoc.lines[0].code === PAPER && prDoc.lines[0].qty === 5,
    `saved PR: lines in expense order, each with its class (${prDoc.lines.map(l => `${l.exp}:${l.desc.slice(0, 12)}`).join(', ')})`);
  check(Math.abs(prDoc.total - (5 * 250 + 10 * 250 + 4 * 60 + 1 * prDoc.lines[3].unitCost)) < 0.01, `total ₱${prDoc.total}`);
  await until(a, () => prList.length === 1, 'PR on the list', 8000);
  const prId = await ev(a, () => prList[0].id);
  const pr = await ev(a, id => {
    const p = prList.find(x => x.id === id);
    const html = prPrintHTML(p);
    const box = document.createElement('div'); box.innerHTML = html;
    const sheet = prSheet(p);
    const flat = sheet.rows.map(r => (r.cells || []).map(c => (c && typeof c === 'object' ? (c.v ?? c.f ?? '') : c ?? '')).join(' | '));
    const total = sheet.rows.map(r => (r.cells || [])[5]).filter(c => c && c.f && /^SUM/.test(c.f)).map(c => c.f);
    const heads = [...box.querySelectorAll('.pr-exp')].map(tr => ({ text: tr.cells[0].innerText.trim(), span: tr.cells[0].colSpan, cells: tr.cells.length }));
    const totRow = box.querySelector('.pr-total');
    setReqTab('prs');
    return { txt: box.innerText, heads, subs: /Subtotal/.test(box.innerText), flat, total, merges: sheet.merges,
      totLabel: totRow ? totRow.cells[2].innerText.trim() : '',
      chips: (document.querySelector('[data-pr-exp-chips]') || {}).innerText || '' };
  }, prId);
  check(pr.heads.map(h => h.text).join('|') === 'OFFICE SUPPLIES EXPENSES|OTHER SUPPLIES EXPENSES' && pr.heads.every(h => h.span === 2 && h.cells === 5) && !pr.subs && pr.totLabel === 'TOTAL',
    `printed PR: like the school's form, a heading in the Stock No. and Unit columns, no subtotals, TOTAL under Item Description (${JSON.stringify(pr.heads)})`);
  const hRow = pr.flat.findIndex(r => /^OFFICE SUPPLIES EXPENSES/.test(r)) + 1;
  check(hRow > 0 && pr.merges.includes(`A${hRow}:B${hRow}`) && pr.flat.some(r => /^OTHER SUPPLIES EXPENSES/.test(r)) && !pr.flat.some(r => /Subtotal/.test(r)) && pr.total.length === 1 && pr.flat.some(r => / \| TOTAL \| /.test(r)),
    `Excel: the same headings (merged A:B), one total = ${pr.total[0]}`);
  // Equipment: two groups of their own, as on the form
  const eq = await ev(a, () => {
    const chair = items.find(i => i.type === 'EQUIPMENT' && /furniture/i.test(i.category || ''));
    const cam = items.find(i => i.type === 'EQUIPMENT' && !/furniture|publication|book/i.test(i.category || ''));
    const p = { prNo: 'T-1', date: '2026-11-10', entity: 'X', lines: [
      { code: cam.code, stockNo: cam.code, unit: 'unit', desc: cam.name, qty: 1, unitCost: 28500, exp: lineExp({ code: cam.code }) },
      { code: chair.code, stockNo: chair.code, unit: 'unit', desc: chair.name, qty: 2, unitCost: 3200, exp: lineExp({ code: chair.code }) },
      { code: null, stockNo: '', unit: 'Ream', desc: 'Coupon Bond, A4', qty: 21, unitCost: 215, exp: 'office' }], total: 39415 };
    const box = document.createElement('div'); box.innerHTML = prPrintHTML(p);
    return { cam: lineExp({ code: cam.code }), chair: lineExp({ code: chair.code }), heads: [...box.querySelectorAll('.pr-exp')].map(tr => tr.cells[0].innerText.trim()) };
  });
  check(eq.cam === 'semiMe' && eq.chair === 'semiFfb' && eq.heads.join('|') === 'OFFICE SUPPLIES EXPENSES|SEMI-EXPENDABLE MACHINERY AND EQUIPMENT EXPENSES|SEMI-EXPENDABLE FURNITURE, FIXTURES AND BOOKS EXPENSES',
    `equipment: Semi-Expendable Machinery and Equipment, Semi-Expendable Furniture, Fixtures and Books (${eq.heads.join(' | ')})`);
  check(/Office Supplies\s*₱1,250\.00/.test(pr.chips) && /Other Supplies\s*₱/.test(pr.chips), `PR card: ${pr.chips.replace(/\s+/g, ' ')}`);

  out('4 delivered → stock by expense');
  a.dialogs.prompt = await ev(a, () => localISODate());
  await ev(a, id => recordPaperSign(id), prId);
  await until(a, () => prApproved(prList[0]), 'PR signed on paper', 8000);
  a.dialogs.prompt = '';
  const before = await ev(a, (p, al) => ({ p: items.find(i => i.code === p).qty, al: items.find(i => i.code === al).qty }), PAPER, ALC);
  await ev(a, id => markPrDelivered(id), prId);
  await until(a, () => !!prList[0].deliveredMs, 'PR delivered', 8000);
  const stock = await ev(a, (p, al, e) => ({ p: items.find(i => i.code === p).qty, pOther: otherOnHand(p), al: items.find(i => i.code === al).qty, alOther: otherOnHand(al), eOther: otherOnHand(e),
    dlv: deliveries.filter(d => d.prNo === '2026-11-021').flatMap(d => d.lines.map(l => `${l.exp}:${l.code}`)) }), PAPER, ALC, ERASER);
  check(stock.p === before.p + 15 && stock.pOther === 10 && stock.al === before.al + 4 && stock.alOther === 4 && stock.eOther === 1, `stock: bond paper +15 (10 Other Supplies), alcohol +4 (4 Other), eraser 1 Other`);
  check(stock.dlv.includes(`office:${PAPER}`) && stock.dlv.includes(`other:${PAPER}`), 'the delivery keeps each line’s expense');
  await ev(a, p => openItemSheet(p), PAPER);
  const note = await ev(a, () => document.getElementById('isQtyNote').textContent);
  check(/Office Supplies \d+ · Other Supplies 10/.test(note), `Item preview: ${note}`);
  await ev(a, () => { if (typeof closeItemPreview === 'function') closeItemPreview(); });

  out('5 releases');
  await until(a, (t, o) => reqList.filter(r => [t, o].includes(r.id) && r.status === 'closed').length === 2, 'requests ready', 8000, ids.t, ids.o);
  await ev(a, id => { openReleaseFromRequest(id); confirmRelease(); }, ids.o);
  await waitNode(() => relDocs().some(d => d.teacherName === 'Ma. Lourdes Abad'), 'office RIS');
  const ris1 = relDocs().find(d => d.teacherName === 'Ma. Lourdes Abad');
  await until(a, p => otherOnHand(p) === 10, 'teachers’ share kept', 5000, PAPER);
  check(ris1.kind === 'RIS' && ris1.lines[0].exp === 'office' && await ev(a, p => otherOnHand(p), PAPER) === 10, 'office request: Office Supplies; the 10 for teachers stay');
  await ev(a, () => closeRelease());
  await ev(a, id => { openReleaseFromRequest(id); confirmRelease(); }, ids.t);
  await waitNode(() => relDocs().some(d => d.teacherUid === juanUid), 'teacher RIS');
  const ris2 = relDocs().find(d => d.teacherUid === juanUid);
  await until(a, (p, al) => otherOnHand(p) + otherOnHand(al) === 0, 'teachers’ share used', 5000, PAPER, ALC);
  check(ris2.lines.every(l => l.exp === 'other') && await ev(a, (p, al) => otherOnHand(p) + otherOnHand(al), PAPER, ALC) === 0, 'teacher’s request: Other Supplies, taken from the teachers’ share');
  await ev(a, () => closeRelease());

  out('6 Deliveries without a PR: charged to');
  await ev(a, al => {
    const item = items.find(i => i.code === al);
    startStockIn('receive', { header: {}, source: 'hand', text: '', lines: [{ desc: item.name, stockNo: item.code, unit: item.unit, qty: 3, unitCost: 55 }] });
    const l = dlvState.draft.lines[0]; l.target = al; l.targetChosen = true; renderDlv();
  }, ALC);
  await sleep(150);
  const pick = await ev(a, () => ({ box: !!document.querySelector('[data-dlv-exp="pick"]'), on: (document.querySelector('[data-dlv-exp-pick][aria-pressed="true"]') || { dataset: {} }).dataset.dlvExpPick }));
  check(pick.box && pick.on === 'office', `Stock in: Supplies charged to, Office Supplies to start with (${JSON.stringify(pick)})`);
  await ev(a, () => setDlvHeader('exp', 'other'));
  await sleep(150);
  check(await ev(a, () => document.querySelector('[data-dlv-exp-pick][aria-pressed="true"]').dataset.dlvExpPick) === 'other', 'switched to Other Supplies');
  await ev(a, () => saveDelivery());
  await until(a, al => otherOnHand(al) === 3, 'stocked in as Other Supplies', 8000, ALC);
  check(await ev(a, al => deliveries.some(d => d.lines.some(l => l.code === al && l.exp === 'other' && l.qty === 3)), ALC), 'delivery line saved as Other Supplies');

  out('7 a release from both classes, and the RSMI');
  const alQty = await ev(a, al => items.find(i => i.code === al).qty, ALC);
  await ev(a, (uid, al) => { openRelease({ teacherUid: uid, name: 'Leonard Q. Fuentes', lines: [{ code: al, qty: 5 }] }); confirmRelease(); }, juanUid, ALC);
  const isRis3 = d => d.teacherUid === juanUid && d.lines.length === 1 && d.lines[0].code === ALC && Number(d.lines[0].qty) === 5;
  await waitNode(() => relDocs().some(isRis3), 'second RIS');
  const mixed = (relDocs().find(isRis3) || { lines: [{}] }).lines[0];
  check(alQty >= 5 && mixed.exp === 'mixed' && mixed.expQ.other === 3 && mixed.expQ.office === 2, `5 alcohol to a teacher: 3 Other Supplies first, then 2 Office Supplies (${JSON.stringify(mixed.expQ)})`);
  await ev(a, () => closeRelease());
  await ev(a, () => { openCoa(); coaGo('issued'); coaSetOpt('issuedType', 'sup'); });
  await until(a, () => !!document.getElementById('coaIssuedStats'), 'RSMI page');
  const stats = await ev(a, () => document.getElementById('coaIssuedStats').innerText);
  check(/Office Supplies \(5020301000\) ₱/.test(stats) && /Other Supplies \(5020399000\) ₱/.test(stats), `RSMI page: ${stats.replace(/\s+/g, ' ')}`);
  await ev(a, () => document.getElementById('coaPrint').click());
  await sleep(300);
  const rsmi = await ev(a, () => ({ txt: document.getElementById('printPrSection').innerText.slice(0, 300), codes: [...document.querySelectorAll('#printPrSection [data-uacs]')].map(x => x.textContent) }));
  check(/REPORT OF SUPPLIES AND MATERIALS ISSUED/.test(rsmi.txt) && rsmi.codes.includes('5020301000') && rsmi.codes.includes('5020399000') && rsmi.codes.every(Boolean),
    `RSMI recapitulation: UACS object code on every row (${rsmi.codes.join(', ')})`);
  if (!rsmi.codes.length) out(rsmi.txt);
  await ev(a, () => closeCoa());

  out('8 permissions');
  const denied = backend.denied.filter(x => !/list releases|read members/.test(x));
  check(denied.length === 0, `app flows refused 0 times (${denied.length}) ${denied.slice(0, 2).join(' | ')}`);
} catch (err) {
  out(err && err.stack || String(err));
  check(false, 'crashed: ' + (err && err.message));
} finally {
  summary('pr-expense');
  await closeAll();
}
