// The School Head's Items tab (Nov 2026): the whole school inventory, view only, with the Item
// preview; the head helps build it with suggestions (Suggest a change, New item, dates on
// property numbers) that the custodian accepts (all or ticked items) or declines. Nothing changes
// in the inventory until the custodian accepts; only what the head changed is applied.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { waitNode, custodian, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const LAPTOP = '43211503-LAP001';
const sugs = sid => backend.docs(`schools/${sid}/suggestions/`);
const invDoc = (sid, code) => backend.docs(`schools/${sid}/inventory/`).find(d => d.code === code);
const shown = (page, sel) => ev(page, s => { const el = document.querySelector(s); return !!el && !el.classList.contains('hidden') && !!el.offsetParent; }, sel);

try {
  out('1 the head opens Items: the whole inventory, view only');
  const { page: a, sid } = await custodian(backend);
  await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); const u = getUnits(c)[0]; setUnitField(c, u.id, 'to', 'Pedro Santos'); }, LAPTOP);
  await sleep(1500);
  const { page: h } = await schoolHead(backend, a, sid);
  await ev(h, () => setHeadTab('items'));
  await until(h, () => headInvLoaded, 'head inventory loaded', 10000);
  await sleep(500);
  const nA = await ev(a, () => items.filter(i => i.qty > 0 || getUnits(i.code).length).length);
  const nH = await ev(h, () => Number(document.querySelector('[data-head-count]').dataset.headCount));
  check(nA > 5 && nA === nH, `the head sees every item (${nH} of ${nA})`);
  check(await ev(h, c => !!document.querySelector(`[data-head-item="${c}"]`), LAPTOP), 'the laptop is in the list');
  const propNo = await ev(a, c => getUnits(c)[0].no, LAPTOP);
  await ev(h, n => { const box = document.getElementById('hdItemsSearch'); box.value = n; headItemsSearch(n); }, propNo);
  check(await ev(h, c => document.querySelectorAll('[data-head-item]').length === 1 && !!document.querySelector(`[data-head-item="${c}"]`), LAPTOP), `search by property number (${propNo})`);
  await ev(h, () => { const box = document.getElementById('hdItemsSearch'); box.value = ''; headItemsSearch(''); });
  await ev(h, c => document.querySelector(`[data-head-item="${c}"]`).click(), LAPTOP);
  await sleep(300);
  check(await ev(h, c => sheetCode === c, LAPTOP), 'tapping opens the Item preview');
  check(!(await shown(h, '#isRelease')), 'no Release button');
  check(await shown(h, '#isEdit') && await ev(h, () => document.getElementById('isEditLabel').textContent === 'Suggest a change'), 'Suggest a change instead of Edit details');
  check(await ev(h, () => /Pedro Santos/.test(document.getElementById('ipBody').textContent) || (ipTab('people'), /Pedro Santos/.test(document.getElementById('ipBody').textContent))), 'who holds a unit shows');
  await ev(h, () => closeItemSheet());

  out('2 other changes are refused on the head\'s phone');
  await ev(h, () => { const b = document.createElement('button'); b.id = 'tmpBtn'; b.setAttribute('onclick', "startStockIn('receive')"); document.body.appendChild(b); });
  await ev(h, () => document.getElementById('tmpBtn').click());
  await sleep(200);
  check(await ev(h, () => !dlvState), 'Stock in is refused (only the custodian)');
  await ev(h, () => document.getElementById('tmpBtn').remove());

  out('3 the head suggests: a change, a new item, a date acquired');
  const sup = await ev(a, () => { const i = items.find(x => x.type !== 'EQUIPMENT' && x.qty >= 5 && x.code !== '43211503-LAP001'); return { code: i.code, qty: i.qty }; });
  await ev(h, c => openItemModal(c), sup.code);
  await sleep(200);
  check(await ev(h, () => document.getElementById('ipSaveLabel').textContent === 'Save as a suggestion'), 'Save as a suggestion');
  await ev(h, q => { document.getElementById('modalItemQty').value = q + 5; document.getElementById('modalItemNote').value = 'Stockroom B'; }, sup.qty);
  await ev(h, () => document.getElementById('ipSave').click());
  await until(h, () => Object.keys(headDraftOps()).length === 1, 'draft has the change', 4000);
  await ev(h, () => closeItemSheet());
  await ev(h, () => { headNewItem(); customName.value = 'Smart TV, 55 inch'; customUnit.value = 'unit'; customPrice.value = '32000'; customQty.value = '2'; customNote.value = 'Library'; saveCustomItem(); });
  const lapUnit = await ev(a, c => getUnits(c)[1].id, LAPTOP);
  await ev(h, (c, id) => setUnitField(c, id, 'acq', '2016-06-15'), LAPTOP, lapUnit);
  await until(h, () => Object.keys(headDraftOps()).length === 4, 'draft has 4 records', 4000);
  await sleep(300);
  check(await ev(h, () => Number(document.querySelector('[data-head-draft]').dataset.headDraft)) === 3, 'the draft card lists 3 items (new item once)');
  check(await ev(h, c => !!document.querySelector(`[data-head-item="${c}"] [data-head-mark="draft"]`), sup.code), 'the changed item is marked “Your change · not sent”');
  check(sugs(sid).length === 0 && invDoc(sid, sup.code).state.note !== 'Stockroom B', 'nothing sent and nothing changed in the account yet');

  out('4 send: the custodian gets it, the inventory does not change yet');
  await ev(h, () => document.querySelector('[data-head-send]').click());
  await waitNode(() => sugs(sid).length === 1);
  const s1 = sugs(sid)[0];
  check(s1 && s1.status === 'pending' && s1.ops.length === 4 && s1.lines.length === 3, `suggestion sent (${s1 && s1.ops.length} records, ${s1 && s1.lines.length} lines)`);
  await sleep(500);
  check(await ev(h, () => !Object.keys(headDraftOps()).length && !document.querySelector('[data-head-draft]')), 'the draft is cleared');
  check(await ev(h, c => !!document.querySelector(`[data-head-item="${c}"] [data-head-mark="sent"]`) && items.find(i => i.code === c).note === 'Stockroom B', sup.code), 'the head still sees the change, marked “waiting for the custodian”');
  check(invDoc(sid, sup.code).state.note !== 'Stockroom B', 'the account is unchanged');
  await until(a, () => sugPending().length === 1, 'custodian receives it', 8000);
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(300);
  check(await shown(a, '[data-sug-banner]'), 'banner on top of Inventory');
  check(await ev(a, () => loadNotifs().items.some(n => n.go === 'suggest' && /suggested changes/.test(n.title))), 'custodian notified');

  out('5 the custodian changed the item meanwhile; accepts the ticked items');
  await ev(a, c => updateItemQty(items.find(i => i.code === c), items.find(i => i.code === c).qty - 1), sup.code);
  await sleep(300);
  await ev(a, () => document.querySelector('[data-sug-banner]').click());
  await sleep(300);
  check(await ev(a, () => document.querySelectorAll('[data-sug-line]').length) === 3, 'three items to review');
  check(await ev(a, c => /You changed this item since/.test(document.querySelector(`[data-sug-line="${c}"]`).textContent), sup.code), 'says the custodian changed the item since');
  const newCode = await ev(a, () => document.querySelector('[data-sug-line^="CUSTOM-"]').dataset.sugLine);
  await ev(a, c => { document.querySelector(`[data-sug-line="${c}"] input`).checked = false; }, newCode);
  await ev(a, () => document.querySelector('[data-sug-accept]').click());
  await waitNode(() => sugs(sid)[0].status === 'accepted');
  const st = await ev(a, c => ({ ...userState[c] }), sup.code);
  check(st.qty === sup.qty - 1 + 5, `quantity: the custodian’s change kept, the head’s +5 added (${st.qty})`);
  check(st.note === 'Stockroom B', 'room from the head');
  check(await ev(a, (c, id) => getUnits(c).find(u => u.id === id).acq === '2016-06-15', LAPTOP, lapUnit), 'date acquired from the head');
  check(await ev(a, c => !items.some(i => i.code === c && i.qty > 0), newCode), 'the unticked new item is not added');
  check(sugs(sid)[0].decision.keys.length === 2, 'decision lists the 2 accepted records');
  check(await ev(a, () => changeHistory.some(e => /Accepted .*suggestion/.test(e.x))), 'in Change History');
  await waitNode(() => (invDoc(sid, sup.code) || {}).state && invDoc(sid, sup.code).state.note === 'Stockroom B', 10000);
  check(invDoc(sid, sup.code).state.note === 'Stockroom B', 'synced to the account');
  check(!(await shown(a, '[data-sug-banner]')), 'banner gone');

  out('6 the head sees the answer');
  await until(h, c => items.find(i => i.code === c).qty === userState[c].qty && !document.querySelector(`[data-head-item="${c}"] [data-head-mark]`), 'head updated', 10000, sup.code);
  check(await ev(h, c => !document.querySelector(`[data-head-item="${c}"] [data-head-mark]`), sup.code), 'no more mark on the item');
  check(await ev(h, c => !items.some(i => i.code === c && i.qty > 0), newCode), 'the item not accepted is gone from the head’s list');
  check(await ev(h, () => loadNotifs().items.some(n => /accepted your suggestion/.test(n.title))), 'head notified: accepted');
  check(await ev(h, () => !!document.querySelector('[data-head-sug][data-status="accepted"]')), 'Your suggestions: Accepted');

  out('7 declined: the head\'s change goes away');
  await ev(h, c => openItemModal(c), sup.code);
  await sleep(200);
  await ev(h, () => { document.getElementById('modalItemMinQty').value = 9; document.getElementById('ipSave').click(); });
  await until(h, () => Object.keys(headDraftOps()).length === 1, 'second draft', 4000);
  await ev(h, () => { closeItemSheet(); document.querySelector('[data-head-send]').click(); });
  await until(a, () => sugPending().length === 1, 'second suggestion arrives', 8000);
  await ev(a, () => { openSugSheet(); });
  await sleep(200);
  await ev(a, () => document.querySelector('[data-sug-decline]').click());
  await waitNode(() => sugs(sid).some(s => s.status === 'declined'));
  check(await ev(a, c => items.find(i => i.code === c).minQty !== 9, sup.code), 'nothing changed on the custodian’s phone');
  await until(h, c => items.find(i => i.code === c).minQty !== 9, 'head reverted', 8000, sup.code);
  check(await ev(h, c => items.find(i => i.code === c).minQty !== 9, sup.code), 'the head’s phone goes back to the account’s value');
  check(await ev(h, () => loadNotifs().items.some(n => /declined your suggestion/.test(n.title))), 'head notified: declined');
  check(backend.denied.length === 0, `no refused writes (${JSON.stringify(backend.denied.slice(0, 2))})`);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('head-items');
  await closeAll();
}
