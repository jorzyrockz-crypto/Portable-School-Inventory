// Assistant custodians: a helper opens the assistant link on their own phone, signs in with
// their own Google account, and the custodian confirms. The assistant's phone gets the school
// inventory and can release, encode and handle requests (their name recorded), but can't remove
// items, hand over, manage the School Head, teachers or links, change the school info or reset.
// Removing them ends their access.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { refused, waitNode, custodian, teacher, openLink } from './lib/school-setup.mjs';

const backend = createBackend();
const rel = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));

try {
  out('1 the custodian makes the assistant link');
  const { page: a, sid, uid: aUid } = await custodian(backend);
  const { uid: anaUid } = await teacher(backend, sid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, anaUid);
  await ev(a, () => openAssistPanel());
  await until(a, () => !!document.getElementById('assistLinkText'), 'assistant link', 8000);
  const link = await ev(a, () => document.getElementById('assistLinkText').textContent);
  const code = link.split('-').pop();
  check(/#assist=/.test(link) && backend.store.get(`schools/${sid}/staffInvites/${code}`)?.active === true, 'assistant link, code active in the cloud');
  check(await ev(a, () => !!document.querySelector('#assistQr svg') && /What an assistant can’t do/.test(document.getElementById('assistBody').textContent)), 'QR code, and what an assistant can’t do');
  await ev(a, () => closeAssistPanel());

  out('2 the assistant joins with their own Google account');
  const b = await openPhone('assistant-ben', backend, { width: 1100, height: 900 });
  await b.evaluateOnNewDocument(() => { localStorage.setItem('custodian_school_info_v1', JSON.stringify({ school: 'Ben’s own list', custodian: 'Ben', uacs: '', position: '' })); });
  await openLink(b, { email: 'ben.cruz@deped.gov.ph', name: 'Ben Cruz' }, '#assist=' + link.split('#assist=')[1]);
  check(await ev(b, () => /Assistant custodian/.test(document.getElementById('hjKicker').textContent)), 'link opens the assistant sign-in');
  await ev(b, () => { hjDesig.value = 'Teacher I · supply room'; });
  await b.click('#hjBtn');
  await until(b, () => reqRole && reqRole.role === 'incoming' && reqRole.kind === 'assist' && turnJoinLoaded, 'waiting', 8000);
  const bUid = await ev(b, () => cloud.user.uid);
  const card = backend.store.get(`schools/${sid}/staff/${bUid}`);
  check(card && card.status === 'pending' && card.name === 'Ben Cruz' && card.email === 'ben.cruz@deped.gov.ph', 'card in the cloud: pending, name from Google');
  check(await ev(b, () => document.querySelector('#loginGate [data-incoming]')?.dataset.incoming === 'pending' && /Waiting for the property custodian/.test(document.getElementById('loginGate').textContent)), 'assistant’s phone: waiting for the custodian');
  check(await refused(b, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'inventory')), sid), 'rules: not confirmed yet → can’t read the inventory');
  check(await refused(b, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'staff', uid), { status: 'active' }), sid, bUid), 'rules: can’t confirm themself');

  out('3 the custodian confirms');
  await until(a, () => pendingStaff().length === 1, 'custodian sees Ben', 8000);
  check(await ev(a, () => loadNotifs().items.some(n => /Ben Cruz wants to join as assistant custodian/.test(n.title))), 'custodian notified');
  await ev(a, uid => { confirmAssistant(uid); }, bUid);
  await waitNode(() => (backend.store.get(`schools/${sid}`).assistants || []).includes(bUid));
  check(backend.store.get(`schools/${sid}/staff/${bUid}`).status === 'active', 'card active, and Ben is in the school’s assistants');
  await until(b, () => reqRole && reqRole.role === 'custodian' && reqRole.assistant && inventorySyncActive() && invStatus.state === 'synced', 'assistant synced', 12000);
  const bv = await ev(b, () => ({ gated: document.documentElement.classList.contains('gated'), items: items.filter(i => i.qty > 0).length, school: schoolInfo.school, cust: schoolInfo.custodian }));
  check(!bv.gated && bv.items > 10 && bv.cust === 'Rhealyn B. Nadado', `assistant: the school inventory (${bv.items} items), forms keep the custodian’s name`);
  check(!b.dialogs.some(d => /Add this phone’s items/.test(d)), 'the assistant’s own items are not offered to the school');

  out('4 the assistant works: encode and release');
  const supply = await ev(b, () => { const i = items.find(x => x.type === 'CONSUMABLE' && x.qty >= 6); adjustQty(i.code, 3); return { code: i.code, qty: i.qty }; });
  await until(a, s => (items.find(i => i.code === s.code) || {}).qty === s.qty, 'custodian sees the count', 10000, supply);
  check(true, 'an encoded count reaches the custodian’s device');
  await until(b, uid => teacherRoster().some(x => x.uid === uid), 'Ana on the assistant’s roster', 8000, anaUid);
  await ev(b, (uid, code) => { openRelease({ teacherUid: uid, lines: [{ code, qty: 2 }], purpose: 'Grade 4 art' }); confirmRelease(); closeRelease(); }, anaUid, supply.code);
  await waitNode(() => rel().some(r => r.teacherUid === anaUid && r.kind === 'RIS'));
  const ris = rel().find(r => r.teacherUid === anaUid && r.kind === 'RIS');
  check(ris && ris.by === 'Ben Cruz' && ris.byUid === bUid && ris.custName === 'Rhealyn B. Nadado', 'RIS made by the assistant: “by” Ben, the custodian stays on the form');
  check(await ev(b, () => changeHistory.slice(-5).some(e => e.by === 'Ben Cruz')), 'Change History: the assistant’s name');
  await ev(b, () => flushAudit());
  await waitNode(() => backend.docs(`schools/${sid}/auditLog/`).some(d => d.role === 'assistant'));
  check(backend.docs(`schools/${sid}/auditLog/`).some(d => d.role === 'assistant' && d.uid === bUid && d.name === 'Ben Cruz'), 'school history: saved as the assistant');

  out('5 what the assistant can’t do');
  const hidden = await ev(b, () => {
    const vis = sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; };
    return { turnover: vis('#moreTurnoverItem'), assist: vis('#moreAssistItem'), info: vis('[onclick*="openSchoolModal("]') };
  });
  check(!hidden.turnover && !hidden.assist && !hidden.info, 'More: turnover, assistants and school info are hidden');
  check(await ev(b, () => { openTurnover(); return document.getElementById('turnoverModal').classList.contains('hidden') || !canHandOver(); }), 'can’t hand over');
  check(await ev(b, () => !canEraseCloud()), 'Reset app can’t erase the school');
  const code1 = await ev(b, () => items.find(i => i.qty > 0).code);
  check(await refused(b, (F, sid, code) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'inventory', 'i:' + code), { deleted: true, updatedMs: Date.now() }, { merge: true }), sid, code1), 'rules: can’t remove an item');
  check(await refused(b, (F, sid) => F.updateDoc(F.doc(cloud.db, 'schools', sid), { name: 'Another school' }), sid), 'rules: can’t change the school');
  check(await refused(b, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'members', uid), { status: 'removed' }), sid, anaUid), 'rules: can’t remove a teacher');
  check(await refused(b, (F, sid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'headInvites', 'abcdefgh'), { active: true }), sid), 'rules: can’t make a School Head link');
  check(await refused(b, (F, sid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'turnoverInvites', 'abcdefgh'), { active: true }), sid), 'rules: can’t make a Turnover link');
  check(await refused(b, (F, sid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'staffInvites', 'abcdefgh'), { active: true }), sid), 'rules: can’t make assistant links');
  check(await refused(b, (F, sid) => F.writeBatch(cloud.db).delete(F.doc(cloud.db, 'schools', sid, 'releases', 'x')).commit(), sid), 'rules: can’t delete records');

  out('6 signing in on another device finds the school');
  const b2 = await openPhone('assistant-ben-2', backend, { width: 1100, height: 900 });
  await b2.evaluateOnNewDocument(() => { window.__googleAccount = { email: 'ben.cruz@deped.gov.ph', name: 'Ben Cruz' }; });
  await b2.goto((await import('./lib/harness.mjs')).BASE_URL, { waitUntil: 'networkidle0' });
  await ev(b2, () => { openRequestsView(); gateGo('custodian'); });
  await until(b2, () => !!document.getElementById('rcGoogle'), 'sign-in card', 8000);
  await ev(b2, () => { custodianGoogle(); });
  await until(b2, () => reqRole && reqRole.assistant && reqRole.schoolId, 'assistant on the second device', 10000);
  check(await ev(b2, s => reqRole.schoolId === s && reqRole.assistant.name === 'Ben Cruz', sid), 'Google sign-in on another device: the school, as assistant');
  check(!backend.docs('schools/').some(d => d.path.split('/').length === 2 && d.path !== `schools/${sid}`), 'no new school was made');

  out('7 removing the assistant ends their access');
  await ev(a, uid => { removeAssistant(uid); }, bUid);
  await waitNode(() => !(backend.store.get(`schools/${sid}`).assistants || []).includes(bUid));
  check(backend.store.get(`schools/${sid}/staff/${bUid}`).status === 'removed', 'card removed, and Ben is out of the school’s assistants');
  await until(b, () => document.getElementById('loginGate').dataset.step === 'assist-ended', 'assistant phone: access ended', 8000);
  check(await ev(b, () => document.documentElement.classList.contains('gated') && !!document.querySelector('[data-assist-ended]')), 'assistant’s phone: “You are no longer an assistant custodian”');
  check(await refused(b, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'releases')), sid), 'rules: no more reads');
  await sleep(500);
} catch (e) {
  out('FAIL: exception', e && e.stack || e);
  process.exitCode = 1;
} finally {
  out(`denied ${JSON.stringify(backend.denied.map(d => d.split(' · ')[0]))}`);
  summary('assistant');
  await closeAll();
}
