// A teacher coming back without the invite link: "Joined before with Google?" → Continue with
// Google on the Teacher sign-in finds their school (teacherSchools/{uid}, written by their own
// phone), and their name, requests and status come back. Without Google (or a Google account that
// never joined) it explains what to do. The code box explains a typed school name.
// The confirmed School Head comes back the same way (schools where headUid == their uid).
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { custodian, schoolHead, waitNode, refused } from './lib/school-setup.mjs';

const backend = createBackend();
const ANA = { email: 'ana.reyes@deped.gov.ph', name: 'Ana Reyes' };
const gated = p => ev(p, () => document.documentElement.classList.contains('gated'));

async function joinWithGoogleAcct(sid, label, acct, name, dialogs = []) {
  const t = await openPhone(label, backend, { dialogs });
  await t.evaluateOnNewDocument(a => { window.__googleAccount = a; }, acct);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinGoogleBtn').disabled && !!cloud.user, 'join sheet', 8000);
  await ev(t, n => { joinName.value = n; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 4'; }, name);
  await ev(t, () => { joinWithGoogle(); });
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', `${name} joined`, 8000);
  return { page: t, uid: await ev(t, () => cloud.user.uid) };
}
async function toTeacherGate(p) {
  await until(p, () => document.documentElement.classList.contains('gated') && typeof gateGo === 'function', 'sign-in screen', 8000);
  await ev(p, () => gateGo('teacher'));
  await until(p, () => !!document.getElementById('gateGoogleBtn'), 'teacher step');
}

try {
  out('1 a school; Ana joins with Google');
  const { page: a, sid } = await custodian(backend, { school: 'San Jose National High School' });
  const anaDialogs = [];
  const { page: t, uid } = await joinWithGoogleAcct(sid, 'ana-phone', ANA, 'Ana Reyes', anaDialogs);
  await waitNode(() => ((backend.store.get(`teacherSchools/${uid}`) || {}).schools || []).some(s => s.id === sid));
  const idx = backend.store.get(`teacherSchools/${uid}`);
  check(idx.schools[0].id === sid && /San Jose/.test(idx.schools[0].name) && Number.isInteger(idx.updatedMs), 'her phone keeps her own list of schools (teacherSchools/{her uid})');

  out('2 the list is private');
  const other = await openPhone('stranger', backend);
  await other.evaluateOnNewDocument(() => { window.__googleAccount = { email: 'nosy@gmail.com', name: 'Nosy' }; });
  await other.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(other, async () => { await cloudStart(); cloud.user = await googleSignIn(); });
  check(await refused(other, (u) => cloud.sdk.getDoc(cloud.sdk.doc(cloud.db, 'teacherSchools', u)), uid), 'another account cannot read Ana’s list');
  check(await refused(other, (u, s) => cloud.sdk.setDoc(cloud.sdk.doc(cloud.db, 'teacherSchools', u), { schools: [{ id: s, name: 'x' }], updatedMs: 1 }), uid, sid), 'nor write it');
  const benDialogs = [];
  const ben = await openPhone('ben-no-google', backend, { dialogs: benDialogs });
  await ben.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(ben, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet (Ben)');
  await ev(ben, () => { joinName.value = 'Ben Cruz'; joinPosition.value = 'Teacher I'; joinOffice.value = 'Grade 2'; });
  await ben.click('#joinBtn');
  await until(ben, () => reqRole && myMemberLoaded && myMemberStatus() === 'active', 'Ben joined', 8000);
  const benUid = await ev(ben, () => cloud.user.uid);
  check(await ev(ben, () => cloud.user.isAnonymous) && !backend.store.get(`teacherSchools/${benUid}`), 'a teacher without Google gets no list');
  check(await refused(ben, (u, s) => cloud.sdk.setDoc(cloud.sdk.doc(cloud.db, 'teacherSchools', u), { schools: [{ id: s, name: 'x' }], updatedMs: 1 }), benUid, sid), 'and cannot write one (they could not sign back in to it)');
  await ev(ben, () => leaveSchool());
  await until(ben, () => document.documentElement.classList.contains('gated'), 'Ben left', 8000);
  check(benDialogs.some(d => /confirm: .*joined without Google/.test(d)), 'leaving without Google warns: you would join again as a new name');

  out('3 Leave explains how to come back');
  await ev(t, () => leaveSchool());
  await until(t, () => document.documentElement.classList.contains('gated'), 'left', 8000);
  check(!(await ev(t, () => !!reqRole)), 'left: the phone no longer knows the school');
  check(anaDialogs.some(d => /confirm: .*To come back: tap Teacher/.test(d)), 'the Leave question says how to come back with Google');

  out('4 Continue with Google on the same phone → back in, no code');
  await toTeacherGate(t);
  check(await ev(t, () => /Joined before with Google/.test(document.querySelector('[data-gate-return]').textContent)), 'the Teacher step offers “Joined before with Google?”');
  await t.click('#gateGoogleBtn');
  await until(t, () => reqRole && reqRole.role === 'teacher' && !document.documentElement.classList.contains('gated'), 'back in', 10000);
  const back = await ev(t, () => ({ sid: reqRole.schoolId, name: reqRole.me.name, school: reqRole.schoolName, uid: cloud.user.uid, invite: reqRole.invite }));
  check(back.sid === sid && back.name === 'Ana Reyes' && /San Jose/.test(back.school) && back.uid === uid, 'same school, same name, same account');
  await until(t, () => myMemberLoaded && myMemberStatus() === 'active', 'card active', 8000);
  check(await ev(t, () => myMemberStatus() === 'active'), 'still approved: no waiting for the custodian again');
  check((backend.store.get(`schools/${sid}/members/${uid}`) || {}).status === 'active', 'her card was not made pending again');

  out('5 a new phone, same Google account');
  const n = await openPhone('ana-new-phone', backend);
  await n.evaluateOnNewDocument(a => { window.__googleAccount = a; }, ANA);
  await n.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toTeacherGate(n);
  await n.click('#gateGoogleBtn');
  await until(n, () => reqRole && reqRole.role === 'teacher' && !document.documentElement.classList.contains('gated'), 'new phone in', 10000);
  check(await ev(n, (s) => reqRole.schoolId === s && cloud.user.uid !== undefined, sid) && await ev(n, () => cloud.user.uid) === uid, 'the new phone opens her school as her');

  out('6 two schools → pick one');
  const { page: b, sid: sid2 } = await custodian(backend, { name: 'custodian-2', email: 'joy@deped.gov.ph', school: 'Liloan Central School' });
  const t2 = await openPhone('ana-second', backend);
  await t2.evaluateOnNewDocument(a => { window.__googleAccount = a; }, ANA);
  await t2.goto(BASE_URL + '#join=' + sid2, { waitUntil: 'networkidle0' });
  await until(t2, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinGoogleBtn').disabled && !!cloud.user, 'join sheet 2', 8000);
  await ev(t2, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 5'; joinWithGoogle(); });
  await until(t2, () => reqRole && myMemberLoaded && myMemberStatus() === 'active', 'joined school 2', 8000);
  await waitNode(() => ((backend.store.get(`teacherSchools/${uid}`) || {}).schools || []).length === 2);
  check(backend.store.get(`teacherSchools/${uid}`).schools[0].id === sid2, 'the newest school first, the older one kept');
  const p3 = await openPhone('ana-third', backend);
  await p3.evaluateOnNewDocument(a => { window.__googleAccount = a; }, ANA);
  await p3.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toTeacherGate(p3);
  await p3.click('#gateGoogleBtn');
  await until(p3, () => document.querySelectorAll('#pickList [data-pick]').length === 2, 'which school?', 10000);
  check(await ev(p3, () => /Which school/.test(document.body.textContent)), 'asks which school');
  await p3.click(`#pickList [data-pick="${sid}"]`);
  await until(p3, () => reqRole && reqRole.schoolId && !document.documentElement.classList.contains('gated'), 'picked', 10000);
  check(await ev(p3, s => reqRole.schoolId === s, sid), 'opens the school she picked');

  out('7 a Google account that never joined');
  const z = await openPhone('never-joined', backend);
  await z.evaluateOnNewDocument(() => { window.__googleAccount = { email: 'new.teacher@gmail.com', name: 'New Teacher' }; });
  await z.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toTeacherGate(z);
  await z.click('#gateGoogleBtn');
  await until(z, () => !document.getElementById('gateGoogleError').classList.contains('hidden'), 'not found', 10000);
  const msg = await ev(z, () => document.getElementById('gateGoogleError').textContent);
  check(/No school found for new\.teacher@gmail\.com/.test(msg) && /invite link/.test(msg), 'explains: no school for this account, ask for the invite link');
  check(await gated(z) && !(await ev(z, () => !!reqRole)), 'stays on the sign-in screen');
  check(await ev(z, () => !document.getElementById('gateGoogleBtn').disabled), 'the button works again');

  out('8 removed from the list → not let back in by itself');
  await ev(a, async (u) => { const F = cloud.sdk; await F.updateDoc(F.doc(cloud.db, 'schools', reqRole.schoolId, 'members', u), { mergedInto: 'someone-else', mergedIntoName: 'Ana R.', mergedMs: Date.now() }); }, uid);
  const m = await openPhone('after-merge', backend);
  await m.evaluateOnNewDocument(a => { window.__googleAccount = a; }, ANA);
  await m.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toTeacherGate(m);
  await m.click('#gateGoogleBtn');
  await until(m, () => reqRole && !document.documentElement.classList.contains('gated'), 'only school 2', 10000);
  check(await ev(m, s => reqRole.schoolId === s, sid2), 'a card merged into another name is skipped: only her other school opens');

  out('9 the code box: a school name typed');
  await toTeacherGate(z);
  await ev(z, () => { gateCode.value = 'San Jose National High School'; gateJoin(); });
  const e1 = await ev(z, () => document.getElementById('gateCodeError').textContent);
  check(/looks like a school name/.test(e1) && /6-digit School ID/.test(e1), 'a school name gets its own explanation');
  await ev(z, () => { gateCode.value = 'http://x'; gateJoin(); });
  check(/does not look like an invite link/.test(await ev(z, () => document.getElementById('gateCodeError').textContent)), 'other text: the usual message');
  check(await ev(z, () => /puts it at the start of the school name/.test(cloudErrorText(Object.assign(new Error('no-school-no'), { schoolNo: '999999' })))), 'unknown School ID: says how the custodian makes it work');

  out('10 School Head: Sign out, then Continue with Google');
  const JOHN = { email: 'john.guadalupe@deped.gov.ph', name: 'John Russell L. Guadalupe' };
  const { page: h, uid: headUid } = await schoolHead(backend, a, sid);
  const hDialogs = [];
  await ev(h, () => leaveHead());
  await until(h, () => document.documentElement.classList.contains('gated'), 'head signed out', 8000);
  const h2 = await openPhone('head-new-phone', backend, { dialogs: hDialogs });
  await h2.evaluateOnNewDocument(a => { window.__googleAccount = a; }, JOHN);
  await h2.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await until(h2, () => document.documentElement.classList.contains('gated') && typeof gateGo === 'function', 'sign-in (head)', 8000);
  await ev(h2, () => gateGo('head'));
  await until(h2, () => !!document.getElementById('gateHeadGoogleBtn'), 'head step');
  check(await ev(h2, () => /Already confirmed as School Head/.test(document.querySelector('[data-gate-return]').textContent)), 'the School Head step offers “Already confirmed as School Head?”');
  await h2.click('#gateHeadGoogleBtn');
  await until(h2, () => reqRole && reqRole.role === 'head' && !document.documentElement.classList.contains('gated'), 'head back in', 10000);
  check(await ev(h2, (s, u) => reqRole.schoolId === s && cloud.user.uid === u && /San Jose/.test(reqRole.schoolName), sid, headUid), 'back as School Head of the same school, no link');
  await until(h2, () => headMeLoaded && headMe && headMe.status === 'active', 'head card', 8000);
  check(await ev(h2, () => headMe.status === 'active' && isHeadDevice()), 'still confirmed: For your approval opens');
  await ev(h2, () => leaveHead());
  await until(h2, () => document.documentElement.classList.contains('gated'), 'signed out again', 8000);
  check(hDialogs.some(d => /confirm: .*To come back: tap School Head/.test(d)), 'Sign out says how to come back with Google');
  check(await refused(z, () => cloud.sdk.getDocs(cloud.sdk.query(cloud.sdk.collection(cloud.db, 'schools'), cloud.sdk.where('headUid', '==', 'someone-else')))), 'nobody can look up another person’s schools by headUid');

  out('11 a teacher’s Google account is not a School Head');
  await toTeacherGate(z);
  await ev(z, () => gateGo('head'));
  await until(z, () => !!document.getElementById('gateHeadGoogleBtn'), 'head step (z)');
  await z.click('#gateHeadGoogleBtn');
  await until(z, () => !document.getElementById('gateHeadGoogleError').classList.contains('hidden'), 'not a head', 10000);
  check(/not a confirmed School Head yet/.test(await ev(z, () => document.getElementById('gateHeadGoogleError').textContent)), 'explains: not confirmed yet, use the School Head link');
  check(await ev(z, () => !reqRole), 'stays on the sign-in screen');
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('teacher-return');
}
