// Not synced yet marks: a change saved on the custodian's phone but not yet in the school
// account shows a small cloud on the item's row (Inventory and Catalog), a chip in the Item
// preview, on deliveries and on slips still sending. Offline, the top chip counts the changes.
// Back online, every mark goes away by itself.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, setOffline, closeAll, summary } from './lib/harness.mjs';
import { custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const marked = (page, code) => ev(page, c => !!document.querySelector(`#dashboardLedgerContainer .inv-row[data-code="${c}"] [data-unsynced]`), code);
const markCount = page => ev(page, () => document.querySelectorAll('#dashboardLedgerContainer [data-unsynced]').length);
const chip = page => ev(page, () => { const el = document.getElementById('invSyncChip'); return el && !el.classList.contains('hidden') ? el.innerText.trim() : ''; });

try {
  out('1 online: nothing is marked');
  const { page: a, sid } = await custodian(backend);
  const { uid: tUid } = await teacher(backend, sid);
  await ev(a, () => { switchMainView('ITEMS'); setLedgerFilter('ALL'); });
  await sleep(600);
  check(await markCount(a) === 0, 'no cloud marks when everything is in the account');
  check(await ev(a, () => invUnsyncedCount()) === 0, 'nothing waiting');

  out('2 offline: the changed item gets a cloud, the chip counts it');
  const code = await ev(a, () => items.find(i => i.qty > 2 && i.type !== 'EQUIPMENT').code);
  const other = await ev(a, c => items.find(i => i.qty > 2 && i.code !== c).code, code);
  await setOffline(a, true);
  await ev(a, c => updateItemQty(items.find(i => i.code === c), 1), code);
  await until(a, c => itemUnsynced(c), 'marked as not synced', 5000, code);
  await sleep(400);
  check(await marked(a, code), 'the changed row shows the cloud');
  check(!(await marked(a, other)), 'other rows do not');
  check(await ev(a, c => { const m = document.querySelector(`#dashboardLedgerContainer .inv-row[data-code="${c}"] [data-unsynced]`); return /Not synced yet/.test(m.title); }, code), 'the cloud explains itself (tooltip)');
  check(/Offline · 1 to sync/.test(await chip(a)), `the top chip counts it (${await chip(a)})`);

  out('3 Catalog row and Item preview');
  await ev(a, () => switchMainView('CATALOG'));
  await sleep(400);
  check(await ev(a, c => !!document.querySelector(`#card-${CSS.escape(c)} [data-unsynced]`), code), 'the Catalog row shows the cloud');
  check(await ev(a, c => !document.querySelector(`#card-${CSS.escape(c)} [data-unsynced]`), other), 'not on the others');
  await ev(a, c => openItemPreview(c), code);
  await sleep(300);
  check(await ev(a, () => !!document.querySelector('#ipChips [data-ip-chip="unsynced"]')), 'the Item preview has a Not synced yet chip');
  await ev(a, () => closeItemSheet());
  await ev(a, c => openItemPreview(c), other);
  await sleep(300);
  check(await ev(a, () => !document.querySelector('#ipChips [data-ip-chip="unsynced"]')), 'not on an item that is synced');
  await ev(a, () => closeItemSheet());

  out('4 a slip released offline');
  const relCode = await ev(a, c => items.find(i => i.qty > 2 && i.type !== 'EQUIPMENT' && i.code !== c).code, code);
  await ev(a, (t, c) => openRelease({ teacherUid: t, lines: [{ code: c, qty: 1 }] }), tUid, relCode);
  await sleep(300);
  await ev(a, () => __fillSerials());
  await ev(a, () => document.getElementById('relSaveBtn').click());
  await until(a, () => !!releaseDone, 'released offline');
  check(await ev(a, () => !!document.querySelector('[data-rel-offline]')), 'the done screen says it reaches the teacher when back online');
  await ev(a, () => closeRelease());
  await until(a, () => releaseList.some(r => r.sending), 'slip in the list, sending', 5000);
  await ev(a, () => { openCoa(); coaGo('slips'); });
  await until(a, () => !!document.getElementById('coaSlips'), 'slips page');
  check(await ev(a, () => !!document.querySelector('#coaSlips [data-unsynced]')), 'Forms → Slips marks the slip Not synced yet');
  await until(a, c => itemUnsynced(c), 'released item marked too', 5000, relCode);
  check(await ev(a, c => itemUnsynced(c), relCode), 'the released item (stock changed) is marked too');

  out('5 back online: every mark goes away');
  await setOffline(a, false);
  await until(a, () => invUnsyncedCount() === 0 && !releaseList.some(r => r.sending), 'all synced', 12000);
  await sleep(500);
  check(await ev(a, () => !document.querySelector('#coaSlips [data-unsynced]')), 'the slip mark is gone (page refreshed by itself)');
  await ev(a, () => closeCoa());
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(400);
  check(await markCount(a) === 0, 'no cloud marks on Inventory');
  await until(a, () => /Saved to your account/.test(document.getElementById('invSyncChip').innerText), 'synced chip', 8000);
  check(!/to sync/.test(await chip(a)), 'the chip is back to normal');
  const online = backend.docs('schools/').find(d => /\/inventory\//.test(d.path) && d.code === code);
  check(online && parseInt(online.state.qty, 10) === 1, 'the change is in the account');

  out('6 a delivery stocked in offline');
  await setOffline(a, true);
  await ev(a, () => { deliveries.push({ id: 'dlvtest1', kind: 'iar', status: 'received', supplier: 'Test Supply', date: '2026-11-11', lines: [], receipts: [{ at: Date.now() }], createdMs: Date.now() }); saveState(); });
  await until(a, () => invUnsynced.has('d:dlvtest1'), 'delivery not synced', 5000);
  await ev(a, () => openDeliveries());
  await sleep(400);
  check(await ev(a, () => !!document.querySelector('[data-dlv-card="dlvtest1"] [data-unsynced]')), 'the delivery card shows Not synced yet');
  await setOffline(a, false);
  await until(a, () => !invUnsynced.has('d:dlvtest1'), 'delivery synced', 12000);
  await sleep(500);
  check(await ev(a, () => !document.querySelector('[data-dlv-card="dlvtest1"] [data-unsynced]')), 'and it goes away once synced');
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('unsynced-marks');
  await closeAll();
}
