// School history in the cloud: Change History entries from the custodian's devices go to
// schools/{id}/auditLog, stamped with the account, device and server time. Nobody can edit or
// delete them; the custodian and the School Head read them (Change History → School (cloud)).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { refused, waitNode, custodian, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const logs = sid => backend.docs(`schools/${sid}/auditLog/`);
const entries = sid => logs(sid).flatMap(d => d.entries || []);

try {
  out('1 the custodian’s changes go to the school history');
  const { page: a, sid, uid } = await custodian(backend);
  const code = await ev(a, () => {
    const i = items.find(x => x.type === 'CONSUMABLE' && x.qty >= 5);
    adjustQty(i.code, -2);
    return i.code;
  });
  await ev(a, c => { logHistory('edit', 'Location of Bond paper changed: Storage → Office', c); }, code);
  await ev(a, () => flushAudit());
  await waitNode(() => entries(sid).some(e => /Location of Bond paper changed/.test(e.x)));
  const doc = logs(sid).find(d => (d.entries || []).some(e => /Location of Bond paper/.test(e.x)));
  check(!!doc && doc.uid === uid && doc.role === 'custodian' && doc.name === 'Rhealyn B. Nadado' && /^(Computer|Phone|Tablet) /.test(doc.device) && doc.createdAt && doc.createdAt.seconds > 0,
    'saved with the account, name, device and the server’s time');
  check(entries(sid).every(e => !e.au), 'the “sent” mark stays on the device');
  const n0 = entries(sid).length;
  await ev(a, () => flushAudit());
  await sleep(300);
  check(entries(sid).length === n0, 'nothing is sent twice');
  check(await ev(a, () => changeHistory.filter(e => !e.au && e.t >= auditSince() && e.k !== 'count').length === 0), 'entries are marked sent on the device');

  out('2 count changes wait until they stop merging');
  const cnt = await ev(a, c => { adjustQty(c, 1); adjustQty(c, 1); return changeHistory[changeHistory.length - 1]; }, code);
  if (cnt && cnt.k === 'count') {
    await ev(a, () => flushAudit());
    await sleep(300);
    check(!entries(sid).some(e => e.k === 'count' && e.t === cnt.t), 'a count edited in the last 3 minutes waits (its final value goes up)');
  } else out('   (no count entry: skipped)');

  out('3 nobody can change or delete it');
  const id = doc.path.split('/').pop();
  check(await refused(a, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'auditLog', id), { entries: [{ t: 1, k: 'edit', x: 'nothing happened' }] }), sid, id), 'rules: the custodian can’t edit an entry');
  check(await refused(a, (F, sid, id) => F.deleteDoc ? F.deleteDoc(F.doc(cloud.db, 'schools', sid, 'auditLog', id)) : F.writeBatch(cloud.db).delete(F.doc(cloud.db, 'schools', sid, 'auditLog', id)).commit(), sid, id), 'rules: the custodian can’t delete an entry');
  check(await refused(a, (F, sid) => F.addDoc(F.collection(cloud.db, 'schools', sid, 'auditLog'), { uid: 'someone-else', name: 'X', role: 'custodian', device: 'Phone 1', entries: [{ t: 1, k: 'edit', x: 'y' }], createdAt: F.serverTimestamp() }), sid),
    'rules: can’t write in someone else’s name');
  check(await refused(a, (F, sid, uid) => F.addDoc(F.collection(cloud.db, 'schools', sid, 'auditLog'), { uid, name: 'X', role: 'custodian', device: 'Phone 1', entries: [{ t: 1, k: 'edit', x: 'y' }], createdAt: F.Timestamp.fromMillis(Date.now() - 864e5 * 30) }), sid, uid),
    'rules: can’t back-date an entry (server time only)');
  check(await refused(a, (F, sid, uid) => F.addDoc(F.collection(cloud.db, 'schools', sid, 'auditLog'), { uid, name: 'X', role: 'head', device: 'Phone 1', entries: [{ t: 1, k: 'edit', x: 'y' }], createdAt: F.serverTimestamp() }), sid, uid),
    'rules: the custodian can’t write as the School Head');

  out('4 Change History → School (cloud)');
  await ev(a, () => openHistory());
  check(await ev(a, () => !!document.querySelector('[data-history-source="cloud"]')), 'Change History: This device | School (cloud)');
  await ev(a, () => setHistorySource(true));
  await until(a, () => document.querySelectorAll('[data-audit-row]').length > 0, 'cloud rows', 8000);
  const view = await ev(a, () => ({ text: document.getElementById('historyList').innerText, sub: document.getElementById('historySubtitle').textContent }));
  check(/Location of Bond paper changed/.test(view.text) && /Rhealyn B\. Nadado/.test(view.text) && /can’t be edited or deleted/.test(view.sub), 'cloud list: the entry, who, and “can’t be edited or deleted”');
  await ev(a, () => { document.getElementById('historySearch').value = 'location'; renderHistory(); });
  check(await ev(a, () => document.querySelectorAll('[data-audit-row]').length === 1), 'search works in the cloud list');
  await ev(a, () => { document.getElementById('historySearch').value = ''; closeHistory(); });

  out('5 a busy custodian: many documents, “Get older”');
  await ev(a, () => { for (let i = 0; i < 24; i++) { logHistory('edit', `Bulk note ${i}`); flushAudit(); } });
  await waitNode(() => logs(sid).length >= 25);
  await ev(a, () => { openHistory(); setHistorySource(true); });
  await until(a, () => !audit.loading && audit.docs.length === 20, 'first 20 documents', 8000);
  check(await ev(a, () => audit.docs.length === 20 && !!document.querySelector('[data-audit-more]')), 'reads 20 documents at a time, with “Get older”');
  await ev(a, () => loadAudit(true));
  await until(a, () => !audit.loading && audit.done, 'all documents', 8000);
  check(await ev(a, () => /Location of Bond paper changed/.test(document.getElementById('historyList').innerText)), 'older entries come with “Get older”');
  await ev(a, () => closeHistory());

  out('6 the School Head reads it and adds their decisions');
  const { page: h, uid: headUid } = await schoolHead(backend, a, sid);
  await until(h, () => !!document.querySelector('[data-head-history]'), 'School history button', 8000);
  await ev(h, () => openSchoolHistory());
  await until(h, () => document.querySelectorAll('[data-audit-row]').length > 0, 'head sees rows', 8000);
  check(await ev(h, () => /Bulk note 23/.test(document.getElementById('historyList').innerText)), 'School Head: School history opens on their phone');
  check(await refused(h, (F, sid, uid) => F.addDoc(F.collection(cloud.db, 'schools', sid, 'auditLog'), { uid, name: 'X', role: 'custodian', device: 'Phone 1', entries: [{ t: 1, k: 'edit', x: 'y' }], createdAt: F.serverTimestamp() }), sid, headUid),
    'rules: the School Head writes only as the School Head');
  await ev(h, () => { auditNow('system', 'School Head approved Purchase Request 2026-11-001 (₱1,000.00)'); });
  await waitNode(() => logs(sid).some(d => d.role === 'head' && d.uid === headUid));
  check(logs(sid).some(d => d.role === 'head' && d.uid === headUid && d.name === 'John Russell L. Guadalupe'), 'the School Head’s decision is saved from their phone');

  out('7 Reset app leaves the school history');
  check(await ev(a, () => !RESET_SUBS.includes('auditLog')), 'Reset app does not erase it');

  out(`denied ${JSON.stringify(backend.denied.map(d => d.split(' · ')[0]))}`);
  check(backend.denied.length === 6, 'the stand-in refused only the 6 forbidden writes tried above');
} catch (e) {
  out('FAIL: exception', e && e.stack || e);
  process.exitCode = 1;
} finally {
  summary('school-history');
  await closeAll();
}
