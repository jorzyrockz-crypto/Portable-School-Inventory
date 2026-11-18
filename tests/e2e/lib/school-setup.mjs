// Shared setup for suites that need a signed-in school: the custodian (with sample inventory),
// teachers who joined, and a confirmed School Head.
import { BASE_URL, ev, until, sleep, openPhone } from './harness.mjs';

// A refused cloud call made straight from a page (the app would not make it): true if refused.
export const refused = (page, fn, ...args) => ev(page, async (src, a) => {
  try { await (new Function('F', 'args', `return (${src})(F, ...args);`))(cloud.sdk, a); return false; }
  catch (e) { return /permission-denied/.test(String(e && (e.code || e.message))); }
}, fn.toString(), args);

export async function waitNode(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  return false;
}

export async function custodian(backend, { name = 'custodian', email = 'rhea@deped.gov.ph', school = 'Oquendo Elementary School', width = 1100, height = 900 } = {}) {
  const a = await openPhone(name, backend, { width, height });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.numbering = 'unit'; schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'Administrative Officer II'; schoolInfo.head = 'John Russell L. Guadalupe'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, (s, e) => { rcSchool.value = s; rcEmail.value = e; rcPass.value = 'secret12'; }, school, email);
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'inventory synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const uid = await ev(a, () => cloud.user.uid);
  return { page: a, sid, uid };
}

export async function teacher(backend, sid, name = 'Ana Reyes', position = 'Teacher III', office = 'Grade 4') {
  const t = await openPhone('teacher-' + name.split(' ')[0].toLowerCase(), backend);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(t, (n, p, o) => { joinName.value = n; joinPosition.value = p; joinOffice.value = o; }, name, position, office);
  await t.click('#joinBtn');
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', 'teacher joined', 8000);
  return { page: t, uid: await ev(t, () => cloud.user.uid) };
}

// Opens a #head= / #turnover= / #assist= link on a phone signed in with this Google account.
export async function openLink(page, acct, hash) {
  await page.evaluateOnNewDocument(a => { window.__googleAccount = a; }, acct);
  await page.goto(BASE_URL + hash, { waitUntil: 'networkidle0' });
  await until(page, () => !document.getElementById('headJoinModal').classList.contains('hidden'), 'join sheet');
}

export async function schoolHead(backend, a, sid) {
  const h = await openPhone('head', backend);
  await ev(a, () => openHeadPanel());
  await until(a, () => !!document.getElementById('headLinkText'), 'head link');
  const link = await ev(a, () => document.getElementById('headLinkText').textContent);
  await ev(a, () => closeHeadPanel());
  await openLink(h, { email: 'john.guadalupe@deped.gov.ph', name: 'John Russell L. Guadalupe' }, '#head=' + link.split('#head=')[1]);
  await ev(h, () => { hjDesig.value = 'School Principal I'; });
  await h.click('#hjBtn');
  await until(h, () => reqRole && reqRole.role === 'head' && headMeLoaded, 'head joined', 8000);
  const uid = await ev(h, () => cloud.user.uid);
  await until(a, () => headList.some(x => x.status === 'pending'), 'custodian sees the head');
  await ev(a, u => { confirmHead(u); }, uid);
  await waitNode(() => backend.store.get(`schools/${sid}`).headUid === uid);
  await until(h, () => headMe && headMe.status === 'active', 'head active', 8000);
  return { page: h, uid };
}
