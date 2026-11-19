// Fewer cloud reads (Firebase free plan: 50,000 reads a day for everyone). After the first full
// load, reopening the app reads only documents that changed (the rest come from the phone's
// cache); a count check or a weekly full load repairs a cache that misses something. Teachers
// read the school stock as one document. A used-up daily limit gets a clear message.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const EMAIL = 'rosa@deped.gov.ph', PASS = 'secret12';
const inv = () => backend.docs('schools/').filter(d => /\/inventory\//.test(d.path) && !d.deleted);
const reads = page => ev(page, () => ({ total: window.__fakeReads || 0, by: window.__fakeReadsBy || {} }));
const readsOf = (r, sub) => Object.entries(r.by).filter(([p]) => p.split('/')[2] === sub).reduce((n, [, v]) => n + v, 0);
const qtyOf = (page, code) => ev(page, c => { const i = items.find(x => x.code === c); return i ? i.qty : null; }, code);
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
async function signIn(page, create) {
  await ev(page, () => { openRequestsView(); gateGo('custodian'); });
  await until(page, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(page, (e, p) => { rcSchool.value = 'San Jose National High School'; rcSchoolNo.value = /\d{6}/.test(rcSchool.value) ? '' : String(300000 + [...rcSchool.value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 600000, 7)); rcEmail.value = e; rcPass.value = p; }, EMAIL, PASS);
  await page.click(create ? '#rcCreate' : '#rcSignIn');
  await until(page, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(page, () => closeInvite());
}
const settled = async (page, what) => {
  await until(page, () => inventorySyncActive() && invStatus.state === 'synced' && releasesLoaded, what, 12000);
  await sleep(1500);   // let the count checks answer
};

try {
  out('1 first sign-in loads everything once');
  const a = await openPhone('custodian-A', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => loadSampleInventory({ quiet: true }));
  await signIn(a, true);
  await settled(a, 'first sync');
  const n = inv().length;
  const sid = await ev(a, () => reqRole.schoolId);
  const r1 = await reads(a);
  check(n > 20 && readsOf(r1, 'inventory') >= n, `first load read the whole inventory (${readsOf(r1, 'inventory')} reads, ${n} items)`);
  const st = await ev(a, () => deltaState());
  const k = `schools/${sid}/inventory`;
  check(st[k] && st[k].at && Array.isArray(st[k].at.updatedAt) && st[k].full > 0, 'the phone remembers the newest server time it has');

  out('2 reopening reads only what changed');
  await a.reload({ waitUntil: 'networkidle0' });
  await settled(a, 'reopened');
  const r2 = await reads(a);
  check(readsOf(r2, 'inventory') <= 3, `inventory on reopen: ${readsOf(r2, 'inventory')} reads (was ${readsOf(r1, 'inventory')})`);
  check(await ev(a, () => Object.keys(userState).length) === n || await ev(a, () => items.length) > 20, 'every item still on the phone');
  const heavy = Object.entries(r2.by).filter(([, v]) => v > 3);
  check(!heavy.length && r2.total < r1.total, `whole app on reopen: ${r2.total} reads (first time ${r1.total}) · no list read again${heavy.length ? ' ' + JSON.stringify(heavy) : ''}`);

  out('3 a change made on another phone while this one was closed');
  const code = await ev(a, () => items.find(i => i.qty > 0 && !/^CUSTOM/.test(i.code) && !(userState[i.code].units || []).length).code);
  await a.goto('about:blank');
  const b = await openPhone('custodian-B', backend);
  await b.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await signIn(b, false);
  await until(b, () => inventorySyncActive() && invStatus.state === 'synced', 'B synced', 12000);
  await until(b, c => items.some(i => i.code === c && i.qty > 0), 'B has the item', 8000, code);
  await ev(b, c => updateItemQty(items.find(i => i.code === c), 77), code);
  await waitNode(() => { const d = inv().find(x => x.code === code); return d && +d.state.qty === 77; }, 'B saved 77');
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await settled(a, 'A back');
  check(await qtyOf(a, code) === 77, 'reopened phone has the new quantity (77)');
  const r3 = await reads(a);
  check(readsOf(r3, 'inventory') <= 4, `…for ${readsOf(r3, 'inventory')} inventory reads`);

  out('4 live changes still arrive');
  await ev(b, c => updateItemQty(items.find(i => i.code === c), 55), code);
  await until(a, c => items.find(i => i.code === c).qty === 55, 'A sees 55', 8000, code);
  check(await qtyOf(a, code) === 55, 'the other phone’s edit shows while open (55)');
  await ev(a, c => updateItemQty(items.find(i => i.code === c), 54), code);
  await until(b, c => items.find(i => i.code === c).qty === 54, 'B sees 54', 8000, code);
  check(await qtyOf(b, code) === 54, 'and this phone’s edit reaches the other (54)');

  out('5 a cache that lost a document loads everything again');
  const lost = await ev(a, path => {
    const key = Object.keys(localStorage).find(x => x.startsWith('__fakeFs_'));
    const c = JSON.parse(localStorage.getItem(key));
    const p = Object.keys(c).find(x => x.startsWith(path + '/'));
    delete c[p];
    localStorage.setItem(key, JSON.stringify(c));
    return p;
  }, k);
  await a.reload({ waitUntil: 'networkidle0' });
  await settled(a, 'repaired');
  await sleep(800);
  const r5 = await reads(a);
  check(!!lost && readsOf(r5, 'inventory') >= n, `count did not match → full load (${readsOf(r5, 'inventory')} reads)`);
  check(await ev(a, (key, p) => !!JSON.parse(localStorage.getItem(Object.keys(localStorage).find(x => x.startsWith('__fakeFs_'))))[p], k, lost), 'the lost document is back on the phone');
  check(await qtyOf(a, code) === 54, 'items unchanged');

  out('6 a full load at least once a week');
  await ev(a, key => { const all = deltaState(); all[key].full = Date.now() - 8 * 864e5; localStorage.setItem(DELTA_KEY, JSON.stringify(all)); }, k);
  await a.reload({ waitUntil: 'networkidle0' });
  await settled(a, 'weekly');
  check(readsOf(await reads(a), 'inventory') >= n, 'older than 7 days → whole inventory read again');
  await a.reload({ waitUntil: 'networkidle0' });
  await settled(a, 'after weekly');
  check(readsOf(await reads(a), 'inventory') <= 3, '…and the next time only changes again');

  out('7 teachers read the school stock as one document');
  const t = await openPhone('teacher', backend);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(t, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 7'; });
  await t.click('#joinBtn');
  await until(t, () => reqRole && cloud.user && myMemberLoaded && myMemberStatus() === 'active', 'teacher in', 10000);
  await ev(t, () => { switchMainView('REQUESTER'); setTeacherTab('stock'); });
  await until(t, () => stockLoaded && stockList.length > 5, 'stock list', 10000);
  const all = backend.docs('schools/').find(d => d.path === `schools/${sid}/stock/_all`);
  check(!!all && all.gone === true && Array.isArray(all.items) && all.items.length > 5, `one stock document (${all && all.items.length} supplies; “gone” so older apps skip it)`);
  check(!backend.docs('schools/').some(d => /\/stock\/(?!_all$)/.test(d.path)), 'no per-supply documents');
  const rt = await reads(t);
  check(readsOf(rt, 'stock') <= 2, `teacher: ${readsOf(rt, 'stock')} read(s) for ${await ev(t, () => stockList.length)} supplies`);
  check(await ev(t, c => (stockList.find(s => s.code === c) || {}).qty, code) === 54, 'teacher sees the custodian’s number (54)');
  await ev(a, c => updateItemQty(items.find(i => i.code === c), 50), code);
  await until(t, c => (stockList.find(s => s.code === c) || {}).qty === 50, 'teacher 50', 8000, code);
  check(await ev(t, c => (stockList.find(s => s.code === c) || {}).qty, code) === 50, 'a change reaches the teacher (50)');
  check(readsOf(await reads(t), 'stock') <= 3, '…for one more read');
  await ev(a, c => updateItemQty(items.find(i => i.code === c), 0), code);
  await until(t, c => (stockList.find(s => s.code === c) || {}).qty === 0, 'teacher 0', 8000, code);
  check(await ev(t, c => stockList.some(s => s.code === c && s.qty === 0), code), 'a supply that ran out stays listed (Out of stock)');

  out('7b a request sent while the custodian’s phone was closed');
  await a.goto('about:blank');
  const tUid = await ev(t, () => cloud.user.uid);
  const asTeacher = ops => backend.handler('batch', JSON.stringify({ ops, ctx: { uid: tUid } })).then(r => JSON.parse(r));
  const sent = await asTeacher([['set', `schools/${sid}/requests/rq1`, { uid: tUid, name: 'Ana Reyes', position: 'Teacher III', office: 'Grade 7', purpose: 'Quiz', neededBy: '',
    lines: [{ id: 'l1', code, desc: 'Bond paper', unit: 'ream', qty: 2 }], status: 'pending', createdAt: { __ts: true }, clientAt: Date.now(), via: 'teacher' }]]);
  check(!sent.error, 'teacher’s request saved' + (sent.error ? ' ' + sent.error : ''));
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await settled(a, 'A back again');
  check(await ev(a, () => reqList.some(r => r.id === 'rq1' && r.status === 'pending')), 'custodian sees the new request after reopening');
  check(readsOf(await reads(a), 'requests') <= 4, `…for ${readsOf(await reads(a), 'requests')} request reads`);
  const cancelled = await asTeacher([['update', `schools/${sid}/requests/rq1`, { status: 'cancelled', updatedAt: { __ts: true } }]]);
  check(!cancelled.error, 'teacher cancels it');
  await until(a, () => reqList.some(r => r.id === 'rq1' && r.status === 'cancelled'), 'cancel seen', 8000);
  check(await ev(a, () => reqList.some(r => r.id === 'rq1' && r.status === 'cancelled')), 'a change to an older document arrives too (updatedAt)');

  out('8 a custodian phone that has not updated yet: teachers read the old per-supply documents');
  backend.store.delete(`schools/${sid}/stock/_all`);
  backend.store.set(`schools/${sid}/stock/OLD-1`, { code: 'OLD-1', name: 'Old bond paper', unit: 'ream', qty: 3, low: 0, cat: '', updatedMs: Date.now() });
  await t.reload({ waitUntil: 'networkidle0' });
  await until(t, () => stockLoaded && stockList.some(s => s.code === 'OLD-1'), 'old docs', 10000);
  check(await ev(t, () => stockList.length === 1 && stockList[0].name === 'Old bond paper'), 'teacher falls back to the per-supply documents');
  await ev(a, () => { stockSync.allHash = null; pushStock(); });
  await until(t, () => stockList.length > 5 && !stockList.some(s => s.code === 'OLD-1'), 'back to _all', 10000);
  check(await ev(t, () => stockList.length > 5 && !stockList.some(s => s.code === 'OLD-1')), 'and switches to the one document once it exists');

  out('9 daily limit used up');
  const msg = await ev(a, () => cloudErrorText({ code: 'resource-exhausted' }));
  check(/free daily cloud limit/.test(msg) && /\d:\d\d [AP]M (today|tomorrow)/.test(msg) && /kept on this phone/.test(msg), `message: “${msg}”`);
  check(await ev(a, () => { const at = quotaResetAt(new Date('2026-11-11T02:00:00Z')); return at && at.toISOString(); }) === '2026-11-11T08:00:00.000Z', 'limit resets at midnight Pacific (4:00 PM in the Philippines in November)');
  check(await ev(a, () => !!quotaTimer), 'listeners restart after the reset');
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
}
summary('fewer-reads');
