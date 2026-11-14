// Deliveries and actual costs: a scanned Purchase Order becomes an expected delivery (no
// stock change), receiving it (in parts) raises stock with the average cost and price history,
// IAR / DR scans and stock in by hand, remembered supplier wordings, OCR-typo-tolerant
// matching, the unit-mismatch warning, per-unit equipment cost (PAR at ₱50,000), and Catalog
// editing (rename, hide, archive, delete). Everything syncs to the school account.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const settings = () => backend.docs('schools/').filter(d => /\/settings\//.test(d.path));
const catalogDoc = code => backend.docs('schools/').find(d => /\/catalog\//.test(d.path) && d.code === code);
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}

const PO_TEXT = [
  'PURCHASE ORDER',
  'Supplier: ABC OFFICE SUPPLIES TRADING      P.O. No.: 2026-11-0007',
  'Address: Colon St., Cebu City              Date: November 5, 2026',
  'PR No.: 2026-10-003',
  'Stock/Property No.   Unit   Description                       Quantity   Unit Cost   Amount',
  '1      ream    BOND PAPFR, A4, 70gsm                 10      250.00    2,500.00',
  '2      box     BALLPEN, black, fine point            2       120.00    240.00',
  '3      unit    LAPTOP COMPUTER, Core i7, 16GB        1       52,000.00  52,000.00',
  '(Total Amount in Words) Fifty four thousand seven hundred forty pesos',
  'Conforme:'
].join('\n');

try {
  out('1 custodian signs in with the sample inventory');
  const a = await openPhone('custodian', backend, { width: 420, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rosa Villanueva'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'inventory synced', 10000);
  await ev(a, () => switchMainView('HOME'));
  check(await ev(a, () => !document.getElementById('homeDlvCard').classList.contains('hidden') && /Deliveries/.test(document.getElementById('homeDlvCard').innerText)), 'Home has a Deliveries card with Stock in');

  out('2 reading a PO: header, rows, money cross-check');
  const parsed = await ev(a, t => parseDocText(t, 'po'), PO_TEXT);
  check(parsed.header.poNo === '2026-11-0007', `PO No. read (${parsed.header.poNo})`);
  check(parsed.header.prNo === '2026-10-003', `PR No. read (${parsed.header.prNo})`);
  check(parsed.header.date === '2026-11-05', `PO date read (${parsed.header.date})`);
  check(/ABC OFFICE SUPPLIES TRADING/.test(parsed.header.supplier) && !/P\.O/.test(parsed.header.supplier), `supplier read (${parsed.header.supplier})`);
  check(parsed.lines.length === 3, `3 rows (${parsed.lines.length})`);
  const [r1, r2, r3] = parsed.lines;
  check(r1 && r1.qty === 10 && r1.unit === 'ream' && r1.unitCost === 250 && r1.stockNo === '1' && /^BOND PAPFR, A4/.test(r1.desc), `row 1: 10 ream × ₱250 “${r1 && r1.desc}”`);
  check(r2 && r2.qty === 2 && r2.unit === 'box' && r2.unitCost === 120, 'row 2: 2 box × ₱120');
  check(r3 && r3.qty === 1 && r3.unitCost === 52000, 'row 3: 1 unit × ₱52,000');
  const iar = await ev(a, () => parseDocText([
    'INSPECTION AND ACCEPTANCE REPORT',
    'Supplier: ABC OFFICE SUPPLIES TRADING     IAR No.: 2026-11-0012',
    'PO No./Date: 2026-11-0007                 Invoice No.: SI-55821',
    'Stock/Property No.   Description          Unit     Quantity',
    '1     BOND PAPER, A4, 70gsm      ream     6',
    'INSPECTION                     ACCEPTANCE'
  ].join('\n'), 'iar'));
  check(iar.header.iarNo === '2026-11-0012' && iar.header.poNo === '2026-11-0007' && iar.header.invoiceNo === 'SI-55821', `IAR header (IAR ${iar.header.iarNo}, PO ${iar.header.poNo}, SI ${iar.header.invoiceNo})`);
  check(iar.lines.length === 1 && iar.lines[0].qty === 6 && iar.lines[0].unit === 'ream' && iar.lines[0].stockNo === '1', 'IAR row: Description | Unit | Quantity');
  const dr = await ev(a, () => parseDocText('DELIVERY RECEIPT   DR No. 004512\nQty  Unit  Particulars  Unit Price  Amount\n5  pcs  STAPLER, heavy duty  350.00  1,750.00\nReceived the above in good order', 'iar'));
  check(dr.header.drNo === '004512' && dr.lines.length === 1 && dr.lines[0].qty === 5 && dr.lines[0].unitCost === 350, 'delivery receipt: Qty | Unit | Particulars | Price | Amount');

  out('2b real forms as the text reader saw them (DepEd PO / IAR / ICS screenshots)');
  const OCR_PO = [
    'PURCHA SE ORDER', 'DEPARTMENT OF EDUCATION',
    'Supplier :                 EJ MARKETING               IPO. No.:                2026-11-15',
    'Adress:                    G. Ramos St. Poblacion Kalibo, Aklan       Date:     11/06/2026',
    'Stock Property         Unit           Description           Quantity  UnitCost        Amount',
    '1                 ream             A4 Coupon bond          25            21500           £378.20',
    '2                  set             Epson L120 ink (1 set   8             1285.00         10.280.90',
    '3                 pack             WorxA4                  30            38.00           1,140.20',
    '4                 unit             SMART TV 55             1             28,500.00       28,500.00',
    '5                 unit             TV Stand                2             3200.00         6.400.020',
    '6                 unit             laminating machine      1             3750.00         3.750.00',
    '7                 set              alphabet letter set     2             158.00          396.00',
    '                                                                                | P      5584100',
    '"(Total Amount in Words)         Fifty Five Thousand Eight Hundred Forty One Pesos Only',
    'Conforme:                                           Very truly yours,',
    'Signature over Printed Name of Supplier             Signature over Printed Name of Authorized Official'
  ].join('\n');
  const rp = await ev(a, t => parseDocText(t, 'po'), OCR_PO);
  check(rp.header.poNo === '2026-11-15' && rp.header.supplier === 'EJ MARKETING' && rp.header.date === '2026-11-06', `PO header despite “IPO. No.” and a signature line naming the supplier (${rp.header.supplier})`);
  check(rp.lines.length === 7, `7 lines, the total row is not a line (${rp.lines.length})`);
  const costs = rp.lines.map(l => l.unitCost).join(',');
  check(costs === '215,1285,38,28500,3200,3750,198', `unit costs repaired: 21500 → 215, 158 → 198 by the total (${costs})`);
  check(rp.lines.map(l => l.qty).join(',') === '25,8,30,1,2,1,2' && rp.lines.map(l => l.unit).join(',') === 'ream,set,pack,unit,unit,unit,set', 'quantities and units');
  check(rp.lines[6].desc === 'alphabet letter set', `unit word at the end of a description stays (${rp.lines[6].desc})`);
  check(rp.header.total === 55841 && rp.header.totalMatches, 'lines add up to the total on the paper (₱55,841.00)');
  check(/corrected to ₱10,280\.00/.test(rp.lines[1].notes.join(' ')), 'a misread amount is corrected and says so');
  const OCR_IAR = [
    'INSPECTION AND ACCEPTANCE REPORT',
    'Supplier:                EJ MARKETING              IAR No. :           2026-11-15',
    'PO No./Date:             2026-11-15         11/06/2026 Date :          11/06/2026',
    'Requisitioning Office/Dept. : Sample Elementary School   Invoice No. :  7001-7002',
    'Property No.             Description              Unit          Quantity',
    '1                        A4 Coupon bond           ream          25',
    '2                        Epson L120 ink {1 set)    set           8',
    '3                        Worx Ad                  pack          Kt)',
    '7                        alphabet letter set      set           2',
    'INSPECTION                                      ACCEPTANCE'
  ].join('\n');
  const ri = await ev(a, t => parseDocText(t, 'iar'), OCR_IAR);
  check(ri.header.poNo === '2026-11-15' && ri.header.iarNo === '2026-11-15' && ri.header.invoiceNo === '7001-7002', `IAR header with “PO No./Date” (PO ${ri.header.poNo})`);
  check(ri.lines.length === 4 && ri.lines[2].stockNo === '3' && ri.lines[2].unit === 'pack' && ri.lines[2].qtyUnread, 'an unreadable quantity keeps its row (stock no. 3, pack) and is marked');
  check(ri.lines[3].stockNo === '7' && ri.lines[3].qty === 2 && ri.lines[3].desc === 'alphabet letter set', 'IAR row: stock no. · description · unit · quantity');
  const OCR_ICS = [
    'INVENTORY CUSTODIAN SLIP',
    'Entity Name:        SAMPLE ELEMENTARY SCHOOL',
    'Fund Cluster:                        (171                         ICS NO!              2026-11-007',
    'Quantity   Unit     UnitCost Total Cost           Description            Inventory Item No.  Useful Life',
    '1          unit        8,900.00 8,900.00             Water Dispenser            OSA 2026-      5 years',
    '9        pC         10500 175500 Horizontal Filebox Long      Osama 2026-3 years',
    '10 pe            12500 1,250.00              Arch File Folder             SES-4THQ-2026-11-32   2 years',
    '1           pc 7.50000 7,500.00                 Steel Rack                 SES-4THQ-2026-11-34      5 years',
    'Received by.                                                    Received from:',
    'MARIA B. SANTOS                            JUAN L. REYES',
    'Signature Over Printed Name                                   Signature Over Printed Name',
    'AO II School Property Custodian                        Officer In-Charge/Teacher III',
    'Position/Office                                                     Position/Office',
    'November 6, 2026                                                     November 6, 2026'
  ].join('\n');
  const rs = await ev(a, t => parseIcsText(t), OCR_ICS);
  check(rs.header.icsNo === '2026-11-007' && rs.header.fund === '', `ICS No. after “ICS NO!”; a misread fund cluster is dropped (${rs.header.icsNo})`);
  check(rs.header.receivedBy === 'MARIA B. SANTOS' && rs.header.position === 'AO II School Property Custodian', `“Received by” on the left column (${rs.header.receivedBy} · ${rs.header.position})`);
  check(rs.items.map(i => i.unitCost).join(',') === '8900,195,125,7500' && rs.items.map(i => i.qty).join(',') === '1,9,10,1', `ICS costs repaired (${rs.items.map(i => i.unitCost).join(',')})`);
  check(rs.items[1].life === '3 years' && rs.items[1].desc === 'Horizontal Filebox Long', 'useful life after a cut-off item no.');
  check(rs.items[0].itemNoCut && rs.items[1].itemNoCut && !rs.items[2].itemNoCut && rs.items[2].itemNo === 'SES-4THQ-2026-11-32', 'half-read item numbers are flagged, whole ones kept');
  check(await ev(a, () => { const b = moneyToken('215'), c = moneyToken('5375'); return reconcileMoney(25, moneyToken('215', false), moneyToken('5375', false)).unitCost === 215 && b && c; }), 'whole pesos without decimals (pasted from Excel) still work');

  out('3 matching: OCR slips, units, remembered wordings');
  const paper = await ev(a, () => {
    const p = items.find(i => /^PAPER, MULTICOPY/.test(i.name) && /A4/.test(i.name)) || items.find(i => /^PAPER/.test(i.name));
    return { code: p.code, name: p.name, unit: p.unit, qty: p.qty, price: p.price };
  });
  const typo = await ev(a, () => suggestIcsMatches('PAPFR, MULTICOPY, A4', 3).map(s => s.item.name));
  check(typo.some(n => /^PAPER/.test(n)), `“PAPFR” still finds PAPER (${typo[0]})`);
  check(await ev(a, () => unitsDiffer('box', 'piece') && !unitsDiffer('pcs', 'piece') && !unitsDiffer('reams', 'ream')), 'box ≠ piece; pcs = piece; reams = ream');

  out('4 scan a PO (pasted text) → review → expected delivery');
  const before = await ev(a, c => items.find(i => i.code === c).qty, paper.code);
  await ev(a, () => { openDeliveries(); dlvScan('po'); dlvState.showPaste = true; renderDlv(); });
  await until(a, () => !!document.getElementById('dlvPasteText'), 'paste box');
  await ev(a, t => { document.getElementById('dlvPasteText').value = t; readPastedDlvText(); }, PO_TEXT);
  await until(a, () => dlvState && dlvState.view === 'edit' && dlvState.draft.lines.length === 3, 'PO review');
  const review = await ev(a, () => dlvState.draft.lines.map(l => ({ id: l.id, target: l.target, desc: l.desc })));
  check(await ev(a, () => dlvState.draft.mode === 'po' && dlvState.draft.header.poNo === '2026-11-0007'), 'review is a PO with its number');
  // Line 1 → the paper item (the supplier calls it BOND PAPER); line 2 → a ballpen; line 3 → a new laptop item
  const pen = await ev(a, () => { const p = items.find(i => /^BALLPEN/.test(i.name)) || items.find(i => /PEN/.test(i.name)); return { code: p.code, unit: p.unit }; });
  await ev(a, (l1, l2, l3, p1, p2) => { setDlvLine(l1, 'target', p1); setDlvLine(l2, 'target', p2); setDlvLine(l3, 'target', 'NEW'); }, review[0].id, review[1].id, review[2].id, paper.code, pen.code);
  await sleep(150);
  const warn = await ev(a, () => document.getElementById('dlvBody').innerText);
  check(/says “box” but/i.test(warn), 'unit mismatch warned (PO box vs item piece)');
  await ev(a, () => saveDelivery());
  await until(a, () => deliveries.some(d => d.kind === 'po' && d.poNo === '2026-11-0007'), 'PO saved');
  const po = await ev(a, () => deliveries.find(d => d.poNo === '2026-11-0007'));
  check(po.status === 'expected' && po.lines.length === 3 && po.lines.every(l => l.received === 0), 'PO is an expected delivery, nothing received');
  check(await ev(a, c => items.find(i => i.code === c).qty, paper.code) === before, 'stock unchanged until received');
  check(await ev(a, () => /1 delivery expected/.test(document.getElementById('homeDlvSub').textContent)), 'Home shows 1 delivery expected');
  check(await ev(a, c => rememberedFor('BOND PAPFR, A4, 70gsm') === c, paper.code), 'supplier wording remembered for the paper');
  const laptop = await ev(a, () => { const d = deliveries.find(x => x.poNo === '2026-11-0007'); const code = d.lines[2].code; const it = items.find(i => i.code === code); return { code, name: it.name }; });
  check(/^CUSTOM-P2-/.test(laptop.code) && /LAPTOP COMPUTER/.test(laptop.name), `new custom item for the laptop (${laptop.code})`);
  await waitNode(() => settings().some(d => d.path.endsWith('/settings/dlv-' + po.id) && d.dlv && d.dlv.poNo === '2026-11-0007'), 'PO synced');
  check(settings().some(d => d.path.endsWith('/settings/dlv-' + po.id)), 'PO synced to the account (settings/dlv-…)');
  await waitNode(() => settings().some(d => d.path.endsWith('/settings/matches') && (d.matches || []).length), 'matches synced');
  check(settings().some(d => d.path.endsWith('/settings/matches') && d.matches.some(m => m.c === paper.code)), 'remembered wordings synced (settings/matches)');

  out('5 the same wording next time is matched by itself');
  const again = await ev(a, () => { const p = parseDocText('Description  Quantity  Unit Cost  Amount\nBOND PAPFR, A4, 70gsm  4  250.00  1,000.00\nTotal', 'po'); const l = { ...p.lines[0] }; dlvAutoTarget(l); return { target: l.target, remembered: l.remembered }; });
  check(again.target === paper.code && again.remembered, 'remembered match picked automatically');

  out('6 receive part of the PO (IAR scan links to the PO)');
  await ev(a, () => { openDeliveries(); dlvScan('iar'); dlvState.showPaste = true; renderDlv(); });
  await until(a, () => !!document.getElementById('dlvPasteText'), 'paste box');
  await ev(a, () => { document.getElementById('dlvPasteText').value = 'IAR No.: 2026-11-0012\nPO No.: 2026-11-0007   Date Received: 11/12/2026\nStock No.  Description  Unit  Quantity\n1  BOND PAPFR, A4, 70gsm  ream  6\nInspected by:'; readPastedDlvText(); });
  await until(a, () => dlvState && dlvState.view === 'edit' && dlvState.draft.fromId, 'receive review linked to the PO');
  const recv = await ev(a, () => ({ lines: dlvState.draft.lines.map(l => ({ qty: l.qty, target: l.target, ordered: l.ordered })), iar: dlvState.draft.header.iarNo, date: dlvState.draft.header.date, note: dlvState.draft.linkedNote }));
  check(recv.iar === '2026-11-0012' && recv.date === '2026-11-12' && /PO 2026-11-0007/.test(recv.note), 'IAR No., date and the PO link');
  check(recv.lines[0].qty === 6 && recv.lines[1].qty === 0 && recv.lines[2].qty === 0, 'quantities from the IAR (6 paper, nothing else yet)');
  await ev(a, () => saveDelivery());
  await until(a, (c, q) => items.find(i => i.code === c).qty === q + 6, 'paper received', 5000, paper.code, before);
  const afterPart = await ev(a, c => { const i = items.find(x => x.code === c); return { qty: i.qty, price: i.price, hist: priceHistory(c) }; }, paper.code);
  const avg = Math.round(((before * paper.price + 6 * 250) / (before + 6)) * 100) / 100;
  check(afterPart.qty === before + 6, `stock up by 6 (${before} → ${afterPart.qty})`);
  check(Math.abs(afterPart.price - avg) < 0.01, `average cost ${afterPart.price} (expected ${avg})`);
  const last = afterPart.hist[afterPart.hist.length - 1];
  check(last && last.k === 'delivery' && last.c === 250 && last.q === 6 && /ABC OFFICE/.test(last.s) && /IAR 2026-11-0012/.test(last.doc), 'price history: delivery, ₱250 × 6, supplier and IAR');
  check(await ev(a, () => deliveries.find(d => d.poNo === '2026-11-0007').status === 'partial'), 'PO partly received');
  const hist = await ev(a, () => changeHistory.filter(e => e.k === 'delivery').map(e => e.x));
  check(hist.some(x => /^Received IAR 2026-11-0012/.test(x)), 'Change history: Received IAR …');

  out('7 receive the rest: laptop ≥ ₱50,000 gets its own cost (PAR)');
  const poId = await ev(a, () => deliveries.find(d => d.poNo === '2026-11-0007').id);
  await ev(a, id => startReceive(id), poId);
  const rest = await ev(a, () => dlvState.draft.lines.map(l => l.qty));
  check(rest[0] === 4 && rest[1] === 2 && rest[2] === 1, `the rest is prefilled (${rest.join(', ')})`);
  await ev(a, () => { dlvState.draft.header.drNo = 'DR-7781'; saveDelivery(); });
  await until(a, () => deliveries.find(d => d.poNo === '2026-11-0007').status === 'received', 'PO complete');
  const lap = await ev(a, c => { const i = items.find(x => x.code === c); const u = getUnits(c); return { qty: i.qty, units: u.map(x => x.cost), ppe: isPPE(i, u[0]), line: relLine(i, 1, u).unitCost }; }, laptop.code);
  check(lap.qty === 1 && lap.units.length === 1 && lap.units[0] === 52000, 'laptop received with a property number costing ₱52,000');
  check(lap.ppe && lap.line === 52000, 'its unit is PPE (PAR) and slips use the unit cost');
  const mixed = await ev(a, c => { const i = items.find(x => x.code === c); return isPPE({ ...i, price: 40000 }, { cost: 52000 }) && !isPPE({ ...i, price: 40000 }, { cost: 0 }); }, laptop.code);
  check(mixed, 'unit cost decides PAR even when the average is below ₱50,000');

  out('8 undo a receipt');
  const penBefore = await ev(a, c => items.find(i => i.code === c).qty, pen.code);
  await ev(a, c => { startStockIn('receive'); const l = dlvState.draft.lines[0]; setDlvLine(l.id, 'target', c); }, pen.code);
  await sleep(100);
  await ev(a, () => { const l = dlvState.draft.lines[0]; setDlvLine(l.id, 'qty', '5'); setDlvLine(l.id, 'unitCost', '9.5'); dlvState.draft.header.supplier = 'Corner Store'; });
  await sleep(100);
  await ev(a, () => saveDelivery());
  await until(a, (c, q) => items.find(i => i.code === c).qty === q + 5, 'stock in by hand', 5000, pen.code, penBefore);
  check(await ev(a, (c, q) => items.find(i => i.code === c).qty === q + 5, pen.code, penBefore), 'stock in by hand: +5 pens');
  check(await ev(a, () => deliveries.some(d => d.kind === 'stockin' && d.supplier === 'Corner Store')), 'listed under Deliveries · Received');
  await ev(a, () => document.getElementById('appToastAction').click());
  await sleep(300);
  check(await ev(a, (c, q) => items.find(i => i.code === c).qty === q, pen.code, penBefore), 'Undo puts the stock back');
  check(await ev(a, () => !deliveries.some(d => d.supplier === 'Corner Store')), 'Undo removes the delivery record');

  out('9 prices window and corrections');
  await ev(a, c => openPriceHistory(c), paper.code);
  const pm = await ev(a, () => document.getElementById('priceModal').innerText);
  check(/Last paid/i.test(pm) && /250\.00/.test(pm) && /ABC OFFICE/.test(pm), 'Prices shows last paid ₱250 and the supplier');
  const ps = await ev(a, c => { const i = items.find(x => x.code === c); return i.part === 'PART1' ? appCsePriceLabel(i) : 'n/a'; }, paper.code);
  check(ps === 'n/a' || /PS-DBM price \(APP-CSE 2027\)/.test(ps), 'APP-CSE price labelled as a reference');
  await ev(a, () => { document.getElementById('pmCost').value = '240'; document.getElementById('pmWhy').value = 'Opening balance'; savePriceCorrection(); closePriceHistory(); });
  const corr = await ev(a, c => ({ price: items.find(i => i.code === c).price, last: priceHistory(c).slice(-1)[0], hist: changeHistory.filter(e => e.c === c).map(e => e.x) }), paper.code);
  check(corr.price === 240 && corr.last.k === 'manual' && corr.last.why === 'Opening balance', 'correction saved with its reason');
  check(corr.hist.some(x => /^Unit cost .* → ₱240\.00/.test(x)), 'Change history: Unit cost … → ₱240.00');

  out('10 Catalog editing: rename, delete, archive, hide');
  const custom = await ev(a, () => {
    document.getElementById('customName').value = 'Whiteboard marker, refill ink'; document.getElementById('customUnit').value = 'bottle';
    document.getElementById('customPrice').value = '35'; document.getElementById('customQty').value = '0'; saveCustomItem();
    return items.find(i => /WHITEBOARD MARKER, REFILL INK/.test(i.name)).code;
  });
  await ev(a, c => { openItemEdit(c); document.getElementById('ieName').value = 'Whiteboard marker ink, black'; document.getElementById('ieUnit').value = 'Bottle'; saveItemEdit(); }, custom);
  const renamed = await ev(a, c => { const i = items.find(x => x.code === c); return { name: i.name, unit: i.unit }; }, custom);
  check(renamed.name === 'WHITEBOARD MARKER INK, BLACK' && renamed.unit === 'bottle', 'custom item renamed (name and unit)');
  await waitNode(() => { const d = catalogDoc(custom); return d && d.raw && d.raw[2] === 'WHITEBOARD MARKER INK, BLACK'; }, 'rename synced');
  check((catalogDoc(custom) || {}).raw?.[2] === 'WHITEBOARD MARKER INK, BLACK', 'rename synced to the account');
  check(await ev(a, c => changeHistory.some(e => e.c === c && /^Renamed/.test(e.x)), custom), 'Change history: Renamed …');
  // APP-CSE item: name locked, hide only
  const app = await ev(a, () => items.find(i => i.part === 'PART1' && i.qty === 0).code);
  await ev(a, c => openItemEdit(c), app);
  check(await ev(a, () => document.getElementById('ieName').disabled && !document.getElementById('ieLocked').classList.contains('hidden') && /Hide from the Catalog/.test(document.getElementById('ieActions').innerText) && !/Delete/.test(document.getElementById('ieActions').innerText)), 'APP-CSE item: name locked, can be hidden, not deleted');
  await ev(a, () => hideItem(false));
  await ev(a, () => { switchMainView('CATALOG'); setPartFilter('ALL'); });
  check(await ev(a, c => !getFilteredItems().some(i => i.code === c) && !document.getElementById('tab-HIDDEN').classList.contains('hidden'), app), 'hidden from the Catalog; Show hidden chip appears');
  check(await ev(a, c => { const n = items.find(i => i.code === c).name; return !suggestIcsMatches(n, 5).some(s => s.item.code === c); }, app), 'hidden items are not suggested when matching');
  await ev(a, () => setPartFilter('HIDDEN'));
  check(await ev(a, c => getFilteredItems().length === 1 && getFilteredItems()[0].code === c, app), 'Show hidden lists it');
  await ev(a, c => { openItemEdit(c); unhideItem(); closeItemEdit(); setPartFilter('ALL'); }, app);
  check(await ev(a, c => getFilteredItems().some(i => i.code === c), app), 'shown again');
  // Unused custom item: delete for good (and synced as deleted)
  await ev(a, c => openItemEdit(c), custom);
  check(await ev(a, () => /Delete item/.test(document.getElementById('ieActions').innerText)), 'unused custom item can be deleted');
  await ev(a, () => deleteCustomItem());
  await until(a, c => !items.some(i => i.code === c), 'deleted', 5000, custom);
  check(await ev(a, c => !items.some(i => i.code === c), custom), 'custom item deleted');
  await waitNode(() => (catalogDoc(custom) || {}).deleted === true, 'delete synced');
  check((catalogDoc(custom) || {}).deleted === true, 'deleted on the account too');
  const next = await ev(a, () => nextCustomCode().code);
  check(next !== custom, `its number is not reused (${next})`);
  // Custom item used on a delivery with qty 0: archive instead of delete
  const used = await ev(a, () => {
    const code = createCustomRaw('TEST TONER CARTRIDGE', 'piece', 0); rebuildCatalogList();
    deliveries.push({ id: 'Dtest', kind: 'po', poNo: 'X-1', status: 'expected', supplier: '', date: '', createdMs: Date.now(), lines: [{ id: 'a', desc: 'toner', code, qty: 1, unitCost: 1, received: 0 }], receipts: [] });
    saveDeliveries(); return code;
  });
  await ev(a, c => openItemEdit(c), used);
  const acts = await ev(a, () => document.getElementById('ieActions').innerText);
  check(/Archive/.test(acts) && !/Delete item/.test(acts) && /delivery/.test(acts), 'used custom item: Archive offered, not Delete');
  await ev(a, () => hideItem(true));
  check(await ev(a, c => { const i = items.find(x => x.code === c); return i.hidden && i.archived; }, used), 'archived (kept for past documents)');
  // Items you have can't be hidden
  const have = await ev(a, () => items.find(i => i.qty > 0).code);
  await ev(a, c => openItemEdit(c), have);
  check(await ev(a, () => /can't be hidden/.test(document.getElementById('ieActions').innerText) && !document.querySelector('#ieActions button')), 'items in stock cannot be hidden or deleted');
  await ev(a, () => closeItemEdit());

  out('11 item sheet shows prices and the Catalog actions');
  await ev(a, c => { switchMainView('ITEMS'); openItemSheet(c); }, paper.code);
  const sheet = await ev(a, () => document.getElementById('isRows').innerText);
  check(/Prices/.test(sheet) && /average/.test(sheet) && /Last paid/.test(sheet), 'item sheet: Prices row with average and last paid');
  check(/Hide from the Catalog|Rename, hide or delete/.test(sheet), 'item sheet: Catalog row');
  await ev(a, () => closeItemSheet());

  out('12 backup carries deliveries and remembered wordings');
  const snap = await ev(a, () => { const s = snapshotData(); return { d: s.deliveries.length, m: s.matches.length }; });
  check(snap.d >= 2 && snap.m >= 1, `snapshot has deliveries (${snap.d}) and matches (${snap.m})`);

  out('13 a second custodian device receives the deliveries');
  const b = await openPhone('custodian-2', backend, { width: 420, height: 900 });
  await b.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(b, () => { openRequestsView(); gateGo('custodian'); });
  await until(b, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(b, () => { rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await b.click('#rcSignIn');
  await until(b, () => reqRole && reqRole.role === 'custodian', 'second device connected', 10000);
  await until(b, () => deliveries.some(d => d.poNo === '2026-11-0007') && rememberedMatches.length > 0, 'deliveries on the second device', 10000);
  check(await ev(b, () => deliveries.some(d => d.poNo === '2026-11-0007' && d.status === 'received')), 'second device has the received PO');
  check(await ev(b, c => rememberedFor('BOND PAPFR, A4, 70gsm') === c, paper.code), 'second device knows the remembered wording');
  check(await ev(b, c => { const i = items.find(x => x.code === c); return i && i.hidden && i.archived; }, used), 'archived item is archived there too');

  out('14 one inventory item no. per ICS line (School-Quarter-Year-Month-Series)');
  await ev(a, () => { schoolInfo.propPrefix = 'OES'; schoolInfo.numbering = 'line'; });
  const firstNo = await ev(a, () => nextPropertyNumbers(3, undefined, { date: '2026-11-06' }));
  check(firstNo.length === 3 && firstNo.every(n => n === 'OES-4THQ-2026-11-01'), `one number for the whole line (${firstNo[0]})`);
  check(await ev(a, () => nextPropertyNumbers(1, undefined, { date: '2026-02-10' })[0] === 'OES-1STQ-2026-02-01'), 'quarter and month from the date (OES-1STQ-2026-02-01)');
  await ev(a, () => { openIcsScanner(); });
  await ev(a, () => icsLoadText([
    'INVENTORY CUSTODIAN SLIP', 'Entity Name: SAMPLE ELEMENTARY SCHOOL      ICS No: 2026-11-007',
    'Quantity  Unit  Unit Cost  Total Cost  Description  Inventory Item No.  Estimated Useful Life',
    '9   pc   195.00   1,755.00   Horizontal Filebox Long   OES-4THQ-2026-11-31   3 years',
    '4   pcs  550.00   2,200.00   Megabox 50L      3 years',
    'Received by:                         Received from:',
    'MARIA B. SANTOS                      JUAN L. REYES',
    'Signature Over Printed Name          Signature Over Printed Name',
    'AO II School Property Custodian      Officer In-Charge',
    'November 6, 2026                     November 6, 2026'
  ].join('\n'), 'paste'));
  await until(a, () => icsState && icsState.stage === 'review', 'ICS review');
  const icsInfo = await ev(a, () => { icsState.lines.forEach(l => { l.target = 'NEW'; }); renderIcs(); return document.getElementById('icsModal').innerText; });
  check(/shared by all 9 units/i.test(icsInfo), 'review says the number is shared by all 9 units');
  check(/One new property number for all 4 units/i.test(icsInfo), 'a line without a number gets one new number for all its units');
  await ev(a, () => saveIcs());
  await until(a, () => items.some(i => /HORIZONTAL FILEBOX LONG/.test(i.name) && getUnits(i.code).length === 9), 'ICS saved', 8000);
  const batch = await ev(a, () => {
    const fb = items.find(i => /HORIZONTAL FILEBOX LONG/.test(i.name)), mb = items.find(i => /MEGABOX 50L/.test(i.name));
    return { fb: getUnits(fb.code).map(u => u.no), mb: getUnits(mb.code).map(u => u.no), fbCode: fb.code, mbCode: mb.code, text: nosText(getUnits(fb.code)) };
  });
  check(batch.fb.length === 9 && batch.fb.every(n => n === 'OES-4THQ-2026-11-31'), '9 file boxes share OES-4THQ-2026-11-31');
  check(batch.mb.length === 4 && batch.mb.every(n => n === 'OES-4THQ-2026-11-32'), `the next line continues the series: ${batch.mb[0]}`);
  check(batch.text === 'OES-4THQ-2026-11-31', 'slips and forms list the number once');
  // Renaming: the same item may share a number, another item's number is refused
  const renamed2 = await ev(a, (fb, mb) => {
    const u = getUnits(mb)[0]; const input = { value: 'OES-4THQ-2026-11-31' };
    renameUnit(mb, u.id, input);
    const refused = getUnits(mb)[0].no === 'OES-4THQ-2026-11-32';
    const v = getUnits(fb)[1]; const inp2 = { value: getUnits(fb)[0].no };
    renameUnit(fb, v.id, inp2);
    return { refused, sameOk: getUnits(fb)[1].no === 'OES-4THQ-2026-11-31' };
  }, batch.fbCode, batch.mbCode);
  check(renamed2.refused && renamed2.sameOk, 'another item’s number is refused; the same item may share it');
  // Physical count: each scan of the shared sticker counts the next file box
  const counted = await ev(a, () => { scanSession = new Set(); lookupScannedTag('OES-4THQ-2026-11-31', 'typed'); lookupScannedTag('OES-4THQ-2026-11-31', 'typed'); lookupScannedTag('OES-4THQ-2026-11-31', 'typed'); return scanSession.size; });
  check(counted === 3, `three scans of the shared sticker count three file boxes (${counted})`);
  await ev(a, () => { schoolInfo.numbering = 'unit'; });
  check(await ev(a, () => /^OES-\d{4}-\d{4}$/.test(nextPropertyNumbers(1)[0])), 'one number per unit is still the default style');

  out('15 COA standard (automatic): by the cost of each unit');
  const coa = await ev(a, () => {
    schoolInfo.numbering = 'coa';
    const n = (cost, qty = 3) => nextPropertyNumbers(qty, 'OES', { date: '2026-11-20', cost });
    return { low: n(250), edge: n(5000), high: n(12000), ppe: n(65000), none: n(0), one: n(250, 1), line: nextPropertyNumbers(3, 'OES', { mode: 'line', date: '2026-11-20', cost: 65000 }),
      shareLow: sharesLineNumber(9, 250), shareHigh: sharesLineNumber(9, 5000.01) };
  });
  const same = a => a.every(x => x === a[0]), distinct = a => new Set(a).size === a.length;
  check(same(coa.low) && same(coa.edge) && /^OES-4THQ-2026-11-\d+$/.test(coa.low[0]), `₱5,000 and below share one number per line (${coa.low[0]})`);
  check(distinct(coa.high) && distinct(coa.ppe) && distinct(coa.none), `above ₱5,000, PPE and no cost: one number each (${coa.high.join(', ')})`);
  const s1 = parseInt(coa.high[0].split('-').pop(), 10);
  check(coa.high.every((x, i) => parseInt(x.split('-').pop(), 10) === s1 + i), 'one-per-unit numbers run on in the same series');
  check(coa.one.length === 1 && same(coa.line), 'single units and the “per ICS line” option are unchanged');
  check(coa.shareLow && !coa.shareHigh, 'the ₱5,000 line is drawn per unit cost (₱5,000.01 is high-valued)');
  await ev(a, () => { schoolInfo.numbering = 'unit'; });
} catch (e) {
  out('FAIL: exception', e && e.stack || e);
  process.exitCode = 1;
} finally {
  summary('deliveries');
  await closeAll();
}
