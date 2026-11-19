// Custodian turnover: a new property custodian opens the Turnover link on their own phone and
// signs in with their own Google account; the outgoing custodian (or the School Head, when the
// custodian has already left) taps Confirm. The new custodian gets the school inventory in their
// name, prints the turnover inventory and renews the teachers' slips; old slips keep the name of
// the custodian who signed them. The outgoing custodian's devices turn view-only for 30 days
// (records open and print, nothing changes, the rules refuse writes) and then lose access.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const rel = () => backend.docs('schools/').filter(d => /\/releases\//.test(d.path));
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
// A cloud call the app would not make, straight to the stand-in: true if it was refused.
const refused = (page, fn, ...args) => ev(page, async (src, a) => {
  try { await (new Function('F', 'args', `return (${src})(F, ...args);`))(cloud.sdk, a); return false; }
  catch (e) { return /permission-denied/.test(String(e && (e.code || e.message))); }
}, fn.toString(), args);
async function signInCustodian(page, email, school) {
  await ev(page, () => { openRequestsView(); gateGo('custodian'); });
  await until(page, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(page, (s, e) => { rcSchool.value = s; rcSchoolNo.value = /\d{6}/.test(rcSchool.value) ? '' : String(300000 + [...rcSchool.value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 600000, 7)); rcEmail.value = e; rcPass.value = 'secret12'; }, school, email);
}
async function openLink(page, acct, hash) {
  await page.evaluateOnNewDocument(a => { window.__googleAccount = a; }, acct);
  await page.goto(BASE_URL + hash, { waitUntil: 'networkidle0' });
  await until(page, () => !document.getElementById('headJoinModal').classList.contains('hidden'), 'join sheet');
}

try {
  out('1 custodian with inventory, a teacher with an ICS, and the School Head');
  const a = await openPhone('custodian-rhea', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.numbering = 'unit'; schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'Administrative Officer II'; schoolInfo.head = 'John Russell L. Guadalupe'; });
  await signInCustodian(a, 'rhea@deped.gov.ph', 'Oquendo Elementary School');
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'inventory synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const aUid = await ev(a, () => cloud.user.uid);
  const equip = await ev(a, () => {
    const i = items.find(x => x.type === 'EQUIPMENT' && x.qty >= 2 && x.qty <= 4 && (x.price || 0) < 50000);
    openUnitsModal(i.code); generateUnitTags(); closeUnitsModal();
    return { code: i.code, name: i.name };
  });
  const supplies = await ev(a, () => items.filter(i => i.type !== 'EQUIPMENT' && i.qty > 0).length);

  const t = await openPhone('teacher-ana', backend);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(t, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 4'; });
  await t.click('#joinBtn');
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', 'teacher joined', 8000);
  const anaUid = await ev(t, () => cloud.user.uid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, anaUid);
  await ev(a, (uid, code) => { openRelease({ teacherUid: uid, lines: [{ code, qty: 1 }], purpose: 'Grade 4 classroom' }); __fillSerials(); confirmRelease(); closeRelease(); }, anaUid, equip.code);
  await waitNode(() => rel().some(r => r.kind === 'ICS' && r.teacherUid === anaUid), 'ICS in the cloud');
  const ics1 = rel().find(r => r.kind === 'ICS' && r.teacherUid === anaUid);
  check(ics1.custName === 'Rhealyn B. Nadado' && ics1.custDesig === 'Administrative Officer II', 'a new slip keeps the name of the custodian who signed it');

  const h = await openPhone('head', backend);
  await ev(a, () => openHeadPanel());
  await until(a, () => !!document.getElementById('headLinkText'), 'head link');
  const headLink = await ev(a, () => document.getElementById('headLinkText').textContent);
  await ev(a, () => closeHeadPanel());
  await openLink(h, { email: 'john.guadalupe@deped.gov.ph', name: 'John Russell L. Guadalupe' }, '#head=' + headLink.split('#head=')[1]);
  await ev(h, () => { hjDesig.value = 'School Principal I'; });
  await h.click('#hjBtn');
  await until(h, () => reqRole && reqRole.role === 'head' && headMeLoaded, 'head joined', 8000);
  const headUid = await ev(h, () => cloud.user.uid);
  await until(a, () => headList.some(x => x.status === 'pending'), 'custodian sees the head');
  await ev(a, uid => { confirmHead(uid); }, headUid);
  await waitNode(() => backend.store.get(`schools/${sid}`).headUid === headUid, 'head confirmed');
  await until(h, () => !!document.querySelector('[data-head-turnover]'), 'head screen has the turnover section', 8000);
  await waitNode(() => backend.store.get(`schools/${sid}`).custodianName === 'Rhealyn B. Nadado', 'custodian name on the school');
  check(backend.store.get(`schools/${sid}`).custodianName === 'Rhealyn B. Nadado', 'the school shows the current custodian’s name (for the School Head)');

  out('2 the outgoing custodian makes the Turnover link; the turnover inventory prints');
  await ev(a, () => openTurnover());
  await until(a, () => !!document.getElementById('turnLinkText'), 'turnover link made');
  const link = await ev(a, () => document.getElementById('turnLinkText').textContent);
  const code = link.split('-').pop();
  check(/#turnover=/.test(link) && backend.store.get(`schools/${sid}/turnoverInvites/${code}`)?.active === true, 'Turnover link (code active in the cloud)');
  check(await ev(a, () => !!document.querySelector('#turnQr svg') && /Suggested, not required/.test(document.getElementById('turnoverBody').textContent)), 'QR code, and counting first is suggested (not required)');
  await ev(a, () => printTurnoverReport(null));
  const rep0 = await ev(a, () => document.getElementById('printPrSection').innerText);
  check(/TURNOVER OF ACCOUNTABILITY/i.test(rep0) && /Semi-expendable Property/i.test(rep0) && /Supplies on hand/i.test(rep0) && /RHEALYN B\. NADADO/i.test(rep0) && /With Ana Reyes/i.test(rep0),
    'turnover inventory: property and supplies on hand, outgoing custodian, who holds what');
  check(await ev(a, n => (document.getElementById('printPrSection').innerText.match(/Supplies on hand · (\d+)/i) || [])[1] === String(n), supplies), `every supply on hand is listed (${supplies})`);

  out('3 the new custodian opens the link with their own Google account');
  const b = await openPhone('custodian-maria', backend, { width: 1100, height: 900 });
  await openLink(b, { email: 'maria.santos@deped.gov.ph', name: 'Maria Santos' }, '#turnover=' + link.split('#turnover=')[1]);
  check(await ev(b, () => /New property custodian/.test(document.getElementById('hjKicker').textContent) && document.documentElement.classList.contains('gated')), 'link opens the new custodian’s sign-in');
  await ev(b, () => { hjDesig.value = 'Administrative Assistant III'; });
  await b.click('#hjBtn');
  await until(b, () => reqRole && reqRole.role === 'incoming' && turnJoinLoaded, 'waiting for Confirm', 8000);
  const bUid = await ev(b, () => cloud.user.uid);
  const card = backend.store.get(`schools/${sid}/turnovers/${bUid}-${code}`);
  check(card && card.status === 'pending' && card.name === 'Maria Santos' && card.designation === 'Administrative Assistant III' && card.email === 'maria.santos@deped.gov.ph', 'card in the cloud: pending, name from Google, designation');
  check(await ev(b, () => document.querySelector('#loginGate [data-incoming]')?.dataset.incoming === 'pending'), 'new custodian’s phone: Waiting for Confirm');
  check(await refused(b, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'inventory')), sid), 'rules: not yet confirmed → can’t read the inventory');
  check(await refused(b, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid), { custodians: [uid], ownerUid: uid }), sid, bUid), 'rules: can’t make themself the custodian');

  out('4 the outgoing custodian confirms');
  await until(a, () => turnPending().length === 1 && !!document.querySelector('[data-turn-confirm]'), 'custodian sees the card', 8000);
  check(await ev(a, () => loadNotifs().items.some(n => /ready to take over as property custodian/.test(n.title))), 'custodian notified');
  const id1 = await ev(a, () => turnPending()[0].id);
  check(await refused(a, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid), { custodians: [uid], ownerUid: uid }), sid, bUid), 'rules: owner changes only with a confirmed turnover card');
  await ev(a, id => { confirmTurnover(id); }, id1);
  await waitNode(() => JSON.stringify(backend.store.get(`schools/${sid}`).custodians) === JSON.stringify([bUid]), 'turnover confirmed');
  const s1 = backend.store.get(`schools/${sid}`);
  const c1 = backend.store.get(`schools/${sid}/turnovers/${id1}`);
  check(s1.ownerUid === bUid && s1.turnoverId === id1 && s1.custodianName === 'Maria Santos' && s1.viewerUids.includes(aUid), 'school: new custodian and owner; the outgoing custodian is a viewer');
  const days = Math.round((s1.viewOnly[aUid].untilMs - Date.now()) / 864e5);
  check(days === 30, `view-only for 30 days (${days})`);
  check(c1.status === 'done' && c1.fromName === 'Rhealyn B. Nadado' && c1.confirmedBy.role === 'custodian' && c1.assumedOn === await ev(a, () => localISODate()), 'card: done, from Rhealyn, confirmed by the outgoing custodian, date');
  check(backend.store.get(`schools/${sid}/turnoverInvites/${code}`).active === false, 'the Turnover link is used up');
  await until(a, () => isViewOnly(), 'outgoing device view-only');
  check(await ev(a, () => !document.getElementById('viewOnlyBar').classList.contains('hidden') && /View-only/.test(document.getElementById('viewOnlyText').textContent)), 'outgoing device: View-only bar');
  check(await ev(a, () => changeHistory.some(e => /Turned over property accountability to Maria Santos/.test(e.x))), 'Change History: the turnover');

  out('5 the new custodian takes over');
  await until(b, () => reqRole && reqRole.role === 'custodian' && inventorySyncActive() && invStatus.state === 'synced', 'new custodian synced', 12000);
  await until(b, () => schoolInfo.custodian === 'Maria Santos', 'name on the forms', 8000);
  const bv = await ev(b, () => ({ gated: document.documentElement.classList.contains('gated'), items: items.filter(i => i.qty > 0).length, pos: schoolInfo.position,
    hist: changeHistory.some(e => /Assumed accountability as property custodian/.test(e.x)), welcome: true }));
  check(!bv.gated && bv.items > 10 && bv.pos === 'Administrative Assistant III' && bv.hist, `new custodian: the school inventory (${bv.items} items) in their name, Change History`);
  await waitNode(() => b.dialogs.some(d => /Welcome, new property custodian/.test(d)), 'welcome note');
  check(b.dialogs.some(d => /Welcome, new property custodian/.test(d)), 'new custodian: welcome note (print, renew slips)');
  await waitNode(() => backend.docs('schools/').some(d => d.path.endsWith('/settings/info') && d.info && d.info.custodian === 'Maria Santos'), 'school info in the cloud');

  out('6 view-only: open and print, never change');
  const before = await ev(a, c => localStorage.getItem(STORAGE_KEY), equip.code);
  await ev(a, () => { const k = Object.keys(userState)[0]; userState[k].qty = 999; saveState(); });
  check(await ev(a, () => localStorage.getItem(STORAGE_KEY)) === before, 'saving is refused on the view-only device');
  check(await ev(a, () => {
    const btn = document.createElement('button'); btn.setAttribute('onclick', 'window.__ran = true; openRelease()'); document.body.appendChild(btn);
    window.__ran = false; btn.click(); btn.remove();
    return window.__ran === false && document.getElementById('releaseModal').classList.contains('hidden');
  }), 'taps that change something are stopped (Release)');
  await ev(a, () => location.reload());
  await sleep(1500);
  await until(a, () => typeof isViewOnly === 'function' && isViewOnly() && releasesLoaded, 'view-only after reopening', 10000);
  check(await refused(a, (F, sid, code) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'inventory', code), { code, state: { qty: 1 } }), sid, equip.code), 'rules: the outgoing custodian can’t write');
  check(!await refused(a, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'releases')), sid), 'rules: the outgoing custodian can still read the records');
  const relId = ics1.path.split('/').pop();
  await ev(a, id => printReleaseById(id), relId);
  check(await ev(a, () => /RHEALYN B\. NADADO/.test(document.getElementById('printPrSection').innerHTML)), 'outgoing device prints its old ICS');
  await until(b, id => releaseList.some(r => r.id === id), 'new custodian has the old ICS', 8000, relId);
  await ev(b, id => printReleaseById(id), relId);
  check(await ev(b, () => /RHEALYN B\. NADADO/.test(document.getElementById('printPrSection').innerHTML) && !/MARIA SANTOS/.test(document.getElementById('printPrSection').innerHTML)),
    'old ICS printed by the new custodian still shows the custodian who signed it');
  check(await ev(b, () => slipCustodian({ createdMs: 1 }).name === 'Rhealyn B. Nadado' && slipCustodian({ createdMs: Date.now() + 1000 }).name === 'Maria Santos'), 'older slips without a name: the custodian at the time');

  out('7 the turnover inventory for signing, and Renew all slips');
  await ev(b, () => openTurnover());
  await until(b, () => turnDone().length === 1 && !!document.querySelector('[data-renew-card]'), 'renew card', 8000);
  await ev(b, id => printTurnoverReport(id), id1);
  const rep1 = await ev(b, () => document.getElementById('printPrSection').innerText);
  check(/RHEALYN B\. NADADO/i.test(rep1) && /MARIA SANTOS/i.test(rep1) && /assumed such accountability on/i.test(rep1) && /JOHN RUSSELL L\. GUADALUPE/i.test(rep1), 'turnover inventory: both custodians, the date assumed, the School Head');
  const nRel = rel().length;
  await ev(b, () => { renewAllSlips(); });
  await waitNode(() => rel().some(r => r.source === 'renewal'), 'renewed slip');
  const ren = rel().filter(r => r.source === 'renewal');
  check(ren.length === 1 && ren[0].teacherUid === anaUid && ren[0].kind === 'ICS' && ren[0].custName === 'Maria Santos' && /change of property custodian/.test(ren[0].purpose) && rel().length === nRel + 1,
    'one new ICS for Ana, in the new custodian’s name');
  check(await ev(b, () => !document.querySelector('[data-renew-card]') && !!document.querySelector('[data-renew-done]') && schoolInfo.renewedTurnover), 'Renew all done (offered once), new slips can be printed');
  await until(t, () => myReleases.some(r => r.source === 'renewal'), 'Ana gets the new ICS', 8000);
  check(await ev(t, () => { const h = teacherHoldings(myReleases); return h.equipment.length === 1 && h.equipment[0].rel.source === 'renewal'; }), 'teacher: the item is now under the renewed ICS (to confirm with Received)');

  out('8 the outgoing custodian on another device: view-only too');
  const a2 = await openPhone('custodian-rhea-laptop', backend, { width: 1100, height: 900 });
  await a2.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await signInCustodian(a2, 'rhea@deped.gov.ph', '');
  await a2.click('#rcSignIn');
  await until(a2, () => typeof isViewOnly === 'function' && isViewOnly(), 'view-only on the new device', 10000);
  await until(a2, () => items.filter(i => i.qty > 0).length > 10, 'records loaded read-only', 10000);
  check(await ev(a2, () => /^(\d{6} - )?Oquendo Elementary School$/.test(reqRole.schoolName) && !document.getElementById('viewOnlyBar').classList.contains('hidden')), 'signing in again finds the school, view-only');
  check(!backend.docs('schools/').some(d => d.path.split('/').length === 2 && d.path !== `schools/${sid}`), 'no new school was made for the outgoing custodian');

  out('9 the School Head confirms the next turnover (outgoing custodian absent)');
  await ev(h, () => { document.querySelector('[data-head-turnover] details').open = true; newTurnoverInvite(true); });
  await until(h, () => !!document.getElementById('turnLinkText'), 'head made a Turnover link', 8000);
  const link2 = await ev(h, () => document.getElementById('turnLinkText').textContent);
  const code2 = link2.split('-').pop();
  const c = await openPhone('custodian-pedro', backend, { width: 1100, height: 900 });
  await openLink(c, { email: 'pedro.cruz@deped.gov.ph', name: 'Pedro Cruz' }, '#turnover=' + link2.split('#turnover=')[1]);
  await c.click('#hjBtn');
  await until(c, () => reqRole && reqRole.role === 'incoming' && turnJoinLoaded, 'Pedro waiting', 8000);
  const cUid = await ev(c, () => cloud.user.uid);
  await until(h, () => !!document.querySelector('[data-turn-confirm]'), 'head sees Pedro', 8000);
  check(await refused(h, (F, sid) => F.updateDoc(F.doc(cloud.db, 'schools', sid), { name: 'Another school' }), sid), 'rules: the School Head can change nothing else on the school');
  const id2 = `${cUid}-${code2}`;
  await ev(h, id => { confirmTurnover(id); }, id2);
  await waitNode(() => JSON.stringify(backend.store.get(`schools/${sid}`).custodians) === JSON.stringify([cUid]), 'head confirmed');
  const s2 = backend.store.get(`schools/${sid}`), c2 = backend.store.get(`schools/${sid}/turnovers/${id2}`);
  check(s2.ownerUid === cUid && c2.confirmedBy.role === 'head' && c2.confirmedBy.uid === headUid && c2.fromName === 'Maria Santos', 'confirmed by the School Head; from Maria (the name on the school)');
  check(s2.viewerUids.includes(bUid) && s2.viewerUids.includes(aUid), 'both earlier custodians are viewers (each until their own date)');
  await until(b, () => isViewOnly(), 'Maria’s device turns view-only on its own', 8000);
  check(b.dialogs.some(d => /Turnover done/.test(d)), 'Maria is told her device is now view-only');
  await until(c, () => reqRole && reqRole.role === 'custodian' && schoolInfo.custodian === 'Pedro Cruz', 'Pedro takes over', 12000);
  check(await ev(c, () => !document.documentElement.classList.contains('gated')), 'Pedro: the school opens on his phone');

  out('10 after 30 days the view-only access ends');
  const deniedBefore = backend.denied.length;
  const sd = backend.store.get(`schools/${sid}`);
  backend.store.set(`schools/${sid}`, { ...sd, viewOnly: { ...sd.viewOnly, [aUid]: { ...sd.viewOnly[aUid], untilMs: Date.now() - 1000 } } });
  check(await refused(a, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'inventory')), sid), 'rules: no more reads once it ends');
  await ev(a, () => location.reload());
  await sleep(1500);
  await until(a, () => document.getElementById('loginGate').dataset.step === 'view-ended', 'ended screen', 10000);
  check(await ev(a, () => document.documentElement.classList.contains('gated') && !!document.querySelector('[data-view-ended]')), 'outgoing device: “Your view-only access ended”');
  // Pedro's device drops the ended entry from the school.
  await ev(c, () => { tidySchoolDoc(); });
  await waitNode(() => !(backend.store.get(`schools/${sid}`).viewerUids || []).includes(aUid), 'ended viewer removed');
  check(!backend.store.get(`schools/${sid}`).viewerUids.includes(aUid) && backend.store.get(`schools/${sid}`).viewerUids.includes(bUid), 'the new custodian’s device removes ended view-only access');

  out(`denied ${JSON.stringify(backend.denied.map(d => d.split(' · ')[0]))}`);
  check(deniedBefore === 5, `the stand-in refused only the 5 forbidden calls tried above (${deniedBefore})`);
  // When view-only ends, the outgoing custodian's other open device may be refused its reads once.
  check(backend.denied.slice(deniedBefore).every(d => /^(read|list) /.test(d)), 'after it ends: only reads are refused');
} catch (e) {
  out('FAIL: exception', e && e.stack || e);
  process.exitCode = 1;
} finally {
  summary('turnover');
  await closeAll();
}
