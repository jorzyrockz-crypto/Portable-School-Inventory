// My Items saved to the custodian's account: upload from the first phone, load on a new
// phone, edits both ways, offline edits sent later, deletions, merging a phone that already
// has its own items (incl. a clashing custom item code), and teachers kept out.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, setOffline, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const EMAIL = 'maria.santos@deped.gov.ph', PASS = 'secret12';
const inv = () => backend.docs('schools/').filter(d => /\/inventory\//.test(d.path));
const live = () => inv().filter(d => !d.deleted);
const qtyOnline = code => { const d = inv().find(x => x.code === code); return d && !d.deleted ? parseInt(d.state.qty, 10) || 0 : null; };
const stockOf = (page, code) => ev(page, c => { const i = items.find(x => x.code === c); return i ? i.qty : null; }, code);
const inStock = page => ev(page, () => items.filter(i => i.qty > 0).length);
const chip = page => ev(page, () => { const el = document.getElementById('invSyncChip'); return el && !el.classList.contains('hidden') ? el.innerText.trim() : ''; });

async function signIn(page, { create = false, school = '' } = {}) {
  await ev(page, () => { openRequestsView(); gateGo('custodian'); }); // signed out: the sign-in screen carries the form
  await until(page, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(page, (s, e, p) => {
    document.getElementById('rcSchool').value = s;
    document.getElementById('rcEmail').value = e;
    document.getElementById('rcPass').value = p;
  }, school, EMAIL, PASS);
  await page.click(create ? '#rcCreate' : '#rcSignIn');
  await until(page, () => typeof reqRole !== 'undefined' && reqRole && reqRole.role === 'custodian', 'connected');
  await ev(page, () => { closeInvite(); switchMainView('ITEMS'); });
}

try {
  out('1 first phone: its inventory becomes the school inventory');
  const a = await openPhone('phone-A', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => loadSampleInventory());
  await sleep(300);
  const aCount = await inStock(a);
  const aCodes = await ev(a, () => Object.keys(userState));
  const plain = await ev(a, () => Object.keys(userState).filter(c => !/^CUSTOM/.test(c) && !(userState[c].units || []).length));
  await signIn(a, { create: true, school: 'San Jose National High School' });
  await until(a, () => /Saved to your account/.test(document.getElementById('invSyncChip').innerText), 'synced chip', 10000);
  check(live().length === aCodes.length, `every item uploaded (${live().length}/${aCodes.length})`);
  check(!!backend.docs('schools/').find(d => /\/settings\/info$/.test(d.path) && d.info.school === 'San Jose National High School'), 'school info uploaded');
  check(await chip(a) === 'Saved to your account', 'My Items shows “Saved to your account”');
  check(await ev(a, () => /saved to your account/.test(document.getElementById('homeStatusText').textContent)), 'Home footer: saved to your account');
  check(await ev(a, () => document.getElementById('backupReminder').classList.contains('hidden')), 'no manual-backup nag while synced');
  check(a.dialogs.every(d => !/already has the school inventory/.test(d)), 'no merge question (account was empty)');
  await a.screenshot({ path: '/tmp/e2e_inv_a.png' });

  out('2 new phone: loads the school inventory');
  const b = await openPhone('phone-B', backend);
  await b.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await inStock(b) === 0, 'new phone starts empty');
  await signIn(b);
  await until(b, n => items.filter(i => i.qty > 0).length === n, 'inventory loaded', 10000, aCount);
  check(await inStock(b) === aCount, `same ${aCount} items in stock on the new phone`);
  check(await ev(b, () => schoolInfo.school) === 'San Jose National High School', 'school info came along');
  check(b.dialogs.every(d => !/already has the school inventory/.test(d)), 'no merge question (phone was empty)');

  out('3 edits travel both ways');
  const code = plain[0];
  await ev(a, c => updateItemQty(items.find(i => i.code === c), 77), code);
  await until(b, c => (items.find(i => i.code === c) || {}).qty === 77, 'A→B', 8000, code);
  check(await stockOf(b, code) === 77 && qtyOnline(code) === 77, 'phone A edit shows on phone B');
  await ev(b, c => updateItemQty(items.find(i => i.code === c), 12), code);
  await until(a, c => (items.find(i => i.code === c) || {}).qty === 12, 'B→A', 8000, code);
  check(await stockOf(a, code) === 12, 'phone B edit shows on phone A');
  // custom item created on B
  await ev(b, () => { openCustomItemModal(); document.getElementById('customName').value = 'Solar street light 100W'; document.getElementById('customQty').value = '3'; saveCustomItem(); });
  await until(a, () => items.some(i => i.name === 'SOLAR STREET LIGHT 100W' && i.qty === 3), 'custom item on A', 8000);
  check(await ev(a, () => items.some(i => i.name === 'SOLAR STREET LIGHT 100W' && i.qty === 3)), 'custom item added on B appears on A');

  out('4 offline edit is kept and sent when back online');
  const code2 = plain[1];
  await setOffline(a, true);
  await ev(a, c => updateItemQty(items.find(i => i.code === c), 5), code2);
  await sleep(1500);
  check(await chip(a) === 'Offline · syncs later', 'offline chip');
  check(qtyOnline(code2) !== 5, 'not online yet');
  check(await ev(a, c => JSON.parse(localStorage.getItem('custodian_app_cse_2027_v1'))[c].qty === 5, code2), 'offline edit saved on the phone');
  await setOffline(a, false);
  await until(b, c => (items.find(i => i.code === c) || {}).qty === 5, 'offline edit reaches B', 10000, code2);
  check(qtyOnline(code2) === 5 && await stockOf(b, code2) === 5, 'sent when back online; phone B has it');
  await until(a, () => /Saved to your account/.test(document.getElementById('invSyncChip').innerText), 'synced again', 8000);
  check(await chip(a) === 'Saved to your account', 'chip back to “Saved to your account”');

  out('5 removing an item removes it everywhere (kept online as deleted)');
  const code3 = plain[2];
  await ev(a, c => { delete userState[c]; rebuildCatalogList(); saveState(); }, code3);
  await until(b, c => !(c in userState), 'deleted on B', 8000, code3);
  check(await ev(b, c => !(c in userState), code3), 'gone from phone B');
  check(inv().find(d => d.code === code3).deleted === true, 'online copy marked deleted, not erased');

  out('6 a phone with its own items joins: combine (clashing custom code renumbered)');
  const c = await openPhone('phone-C', backend);
  await c.goto(BASE_URL, { waitUntil: 'networkidle0' });
  // Same CUSTOM-P2 number as B's solar light, different item.
  await ev(c, () => { openCustomItemModal(); document.getElementById('customName').value = 'Bamboo bookshelf'; document.getElementById('customQty').value = '4'; saveCustomItem(); });
  const cCode = await ev(c, () => customRawItems[0][1]);
  const bCode = await ev(b, () => customRawItems.find(r => r[2] === 'SOLAR STREET LIGHT 100W')[1]);
  check(cCode === bCode, `phone C made a different item with the same code (${cCode})`);
  c.dialogs.confirm = true;
  await signIn(c);
  await until(c, () => items.some(i => i.name === 'BAMBOO BOOKSHELF') && items.some(i => i.name === 'SOLAR STREET LIGHT 100W'), 'merged', 10000);
  check(c.dialogs.some(d => /already has the school inventory/.test(d)), 'asked whether to add this phone’s items');
  const cItems = await ev(c, () => ({ shelf: items.find(i => i.name === 'BAMBOO BOOKSHELF'), solar: items.find(i => i.name === 'SOLAR STREET LIGHT 100W') }));
  check(cItems.shelf.qty === 4 && cItems.solar.qty === 3 && cItems.shelf.code !== cItems.solar.code, `both kept: bookshelf renumbered to ${cItems.shelf.code}`);
  await until(a, () => items.some(i => i.name === 'BAMBOO BOOKSHELF' && i.qty === 4), 'bookshelf on A', 10000);
  check(await ev(a, () => items.some(i => i.name === 'BAMBOO BOOKSHELF' && i.qty === 4) && items.some(i => i.name === 'SOLAR STREET LIGHT 100W' && i.qty === 3)), 'phone A has both custom items');
  check(await inStock(c) === await inStock(a), 'phone C now matches phone A');

  out('7 a phone that chooses the account list only');
  const d = await openPhone('phone-D', backend);
  await d.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(d, () => loadSampleInventory());
  await ev(d, () => { openCustomItemModal(); document.getElementById('customName').value = 'Test item to discard'; document.getElementById('customQty').value = '1'; saveCustomItem(); });
  d.dialogs.confirm = false;
  await signIn(d);
  await until(d, n => items.filter(i => i.qty > 0).length === n, 'account list', 10000, await inStock(a));
  check(!(await ev(d, () => items.some(i => i.name === 'TEST ITEM TO DISCARD'))), 'this phone’s extra item dropped');
  check(await inStock(d) === await inStock(a), 'same stock list as phone A');
  check(await ev(d, c => !(c in userState), code3), 'item removed on phone A stays removed (phone D had its own copy)');
  check((await ev(d, () => window.__downloads)).some(f => /\.json$/i.test(f)), 'a backup file of this phone’s list was saved first');
  await sleep(1200);
  check(!(await ev(a, () => items.some(i => i.name === 'TEST ITEM TO DISCARD'))), 'nothing from phone D leaked to the account');

  out('8 reopening does not re-send everything');
  const before = backend.writes.length;
  await a.reload({ waitUntil: 'networkidle0' });
  await until(a, () => /Saved to your account/.test((document.getElementById('invSyncChip') || {}).innerText || ''), 'resynced', 10000);
  await sleep(1500);
  check(backend.writes.length === before, `no writes after a plain reload (${backend.writes.length - before})`);

  out('9 teachers cannot read the inventory');
  const t = await openPhone('teacher', backend);
  await t.goto(BASE_URL, { waitUntil: 'networkidle0' });
  const schoolId = await ev(a, () => reqRole.schoolId);
  const read = await ev(t, async sid => {
    await cloudStart();
    await cloud.sdk.signInAnonymously(cloud.auth);
    try { await cloud.sdk.getDocs(cloud.sdk.query(cloud.sdk.collection(cloud.db, 'schools', sid, 'inventory'))); return 'allowed'; }
    catch (e) { return e.code; }
  }, schoolId);
  const deniedByApp = backend.denied.filter(x => !/read inventory/.test(x));
  check(read === 'permission-denied', 'teacher reading the inventory is refused');
  check(deniedByApp.length === 0, `app flows refused 0 times (${deniedByApp.length}) ${deniedByApp.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('inventory-sync');
  await closeAll();
}
