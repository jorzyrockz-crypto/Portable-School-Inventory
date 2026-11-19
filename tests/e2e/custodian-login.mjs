// Custodian sign-in: the school is found by the account (never by the typed name), a new school
// is set up once by its 6-digit School ID, an ID already set up is refused with a hint of the
// account that did it, and a Google account left signed in from another role is never reused.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, ev, sleep, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { waitNode } from './lib/school-setup.mjs';

const backend = createBackend();
const ROSA = { email: 'rosa.cruz@deped.gov.ph', name: 'Rosa Cruz' };
const OTHER = { email: 'jorzy.rockz@gmail.com', name: 'Jorzy' };
const schools = () => [...backend.store.keys()].filter(k => /^schools\/[^/]+$/.test(k));
const gated = p => ev(p, () => document.documentElement.classList.contains('gated'));
async function toCustodian(p) {
  await until(p, () => document.documentElement.classList.contains('gated') && typeof gateGo === 'function', 'sign-in screen', 8000);
  await ev(p, () => gateGo('custodian'));
  await until(p, () => !!document.getElementById('rcGoogle'), 'custodian card');
}
const setAcct = (p, a) => ev(p, x => { window.__googleAccount = x; }, a);

try {
  out('1 first Google sign-in without a School ID → asked for it');
  const dialogs = [];
  const a = await openPhone('custodian', backend, { dialogs });
  await a.evaluateOnNewDocument(x => { if (!window.__googleAccount) window.__googleAccount = x; }, ROSA);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toCustodian(a);
  check(await ev(a, () => !document.getElementById('rcNewBox').open && /Setting up a new school/.test(document.getElementById('rcNewBox').textContent)), 'the sign-in card has no school field up front: “Setting up a new school?” is folded away');
  await ev(a, () => { rcSchool.value = 'San Jose  national high school'; });
  await a.click('#rcGoogle');
  await until(a, () => !!document.querySelector('[data-cust-new]'), 'no-school card', 8000);
  check(await ev(a, () => /No school on this account yet/.test(document.querySelector('[data-cust-new]').textContent) && /rosa\.cruz@deped\.gov\.ph/.test(document.querySelector('[data-cust-new]').textContent) && /with Google/.test(document.querySelector('[data-cust-new]').textContent)), 'says no school on this account, which account and method');
  check(schools().length === 0, 'a name alone makes no school');
  check(await ev(a, () => nsName.value === 'San Jose national high school'), 'the typed name is carried over (spaces tidied)');
  await ev(a, () => { nsNo.value = '12345'; custodianCreateSchool(); });
  await until(a, () => !document.getElementById('nsError').classList.contains('hidden'), 'id error');
  check(/6-digit DepEd School ID/.test(await ev(a, () => nsError.textContent)), 'a School ID that is not 6 digits is refused');
  await ev(a, () => { nsNo.value = '114656'; nsName.value = 'San Jose National High School'; custodianCreateSchool(); });
  await until(a, () => reqRole && reqRole.role === 'custodian', 'school set up', 8000);
  const sid = await ev(a, () => reqRole.schoolId);
  const sch = backend.store.get(`schools/${sid}`);
  check(sch.name === '114656 - San Jose National High School' && sch.schoolNo === '114656', 'the school is saved as “114656 - San Jose National High School”');
  const idDoc = backend.store.get('schoolIds/114656') || {};
  check(idDoc.schoolId === sid && idDoc.hint === 'r***z@deped.gov.ph · Google', `the School ID is listed with a masked hint (${idDoc.hint})`);
  check(dialogs.some(d => /confirm: Set up a new school\?/.test(d)), 'asks before setting up a new school');
  check(await ev(a, () => reqRole.schoolNoListed === '114656'), 'Invite knows the ID is listed');
  await ev(a, () => { if (typeof closeInvite === 'function') closeInvite(); if (typeof closeTour === 'function') closeTour(); });

  out('2 sign out and back in: the same school, whatever name is typed');
  await ev(a, () => custodianSignOut());
  await until(a, () => !reqRole && document.documentElement.classList.contains('gated'), 'signed out', 8000);
  check(dialogs.some(d => /confirm: .*To come back to 114656 - San Jose/.test(d)), 'Sign out says which account to use to come back');
  await toCustodian(a);
  check(await ev(a, () => /Last time on this phone: rosa\.cruz@deped\.gov\.ph with Google · 114656 - San Jose National High School/.test(document.querySelector('[data-cust-last]').textContent)), 'the card shows the account used last time on this phone');
  await ev(a, () => { rcNewBox.open = true; rcSchool.value = 'SANJOSE NHS'; rcSchoolNo.value = ''; });
  await a.click('#rcGoogle');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'back in', 8000);
  check(await ev(a, s => reqRole.schoolId === s, sid) && schools().length === 1, 'back in the same school; no new school');

  out('3 another account with the same School ID → refused, with the hint');
  await ev(a, () => custodianSignOut());
  await until(a, () => !reqRole && document.documentElement.classList.contains('gated'), 'signed out 2', 8000);
  await toCustodian(a);
  await setAcct(a, OTHER);
  await ev(a, () => { rcNewBox.open = true; rcSchoolNo.value = '114656'; rcSchool.value = 'San Jose NHS'; });
  await a.click('#rcGoogle');
  await until(a, () => !!document.querySelector('[data-cust-new]') && !document.getElementById('nsError').classList.contains('hidden'), 'refused', 8000);
  const msg = await ev(a, () => nsError.textContent);
  check(/School ID 114656 is already set up in CustodianPro \(114656 - San Jose National High School\), by r\*\*\*z@deped\.gov\.ph · Google\. Sign in with that account/.test(msg), 'the same School ID from another account is refused, saying which account set it up');
  check(schools().length === 1 && await ev(a, () => !reqRole), 'no second school');
  check(await ev(a, () => /Last time on this phone you used rosa\.cruz@deped\.gov\.ph with Google/.test(document.querySelector('[data-cust-new]').textContent)), 'reminds which account was used last time on this phone');
  await a.click('#nsOther');
  await until(a, () => !!document.getElementById('rcGoogle') && !document.querySelector('[data-cust-new]'), 'back to sign-in', 8000);
  check(await ev(a, () => !cloud.auth.currentUser), 'Use a different account signs out');

  out('4 email: Create account needs the School ID');
  const b = await openPhone('custodian-email', backend, { tour: true });
  await b.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toCustodian(b);
  await ev(b, () => { rcEmail.value = 'ben@deped.gov.ph'; rcPass.value = 'secret12'; rcSchool.value = 'Rizal ES'; rcSchoolNo.value = ''; });
  await b.click('#rcCreate');
  await until(b, () => !document.getElementById('rcError').classList.contains('hidden'), 'needs id');
  check(/6-digit School ID/.test(await ev(b, () => rcError.textContent)) && await ev(b, () => rcNewBox.open), 'asks for the School ID and opens the section');
  check(!backend.store.has('schoolIds/120001') && schools().length === 1, 'nothing made');
  await ev(b, () => { rcSchoolNo.value = '120001'; });
  await b.click('#rcCreate');
  await until(b, () => reqRole && reqRole.role === 'custodian', 'ben in', 8000);
  check(await ev(b, () => reqRole.schoolName) === '120001 - Rizal ES' && (backend.store.get('schoolIds/120001') || {}).hint === 'b***n@deped.gov.ph · email and password', 'email account: school + masked hint “email and password”');

  out('4b welcome tour: Invite people now');
  await until(b, () => !document.getElementById('tourModal').classList.contains('hidden'), 'tour', 8000);
  await ev(b, () => tourNext());
  await until(b, () => !!document.querySelector('[data-tour-pick="invite"]'), 'add-items step');
  check(await ev(b, () => /Invite people now/.test(document.querySelector('[data-tour-pick="invite"]').textContent)), 'Add your items offers “Invite people now”');
  await b.click('[data-tour-pick="invite"]');
  check(/Invite now/.test(await ev(b, () => document.getElementById('tourNext').textContent)), 'picking it turns the button into “Invite now”');
  await b.click('#tourNext');
  await until(b, () => !document.getElementById('inviteModal').classList.contains('hidden'), 'invite sheet', 6000);
  check(await ev(b, () => document.getElementById('tourModal').classList.contains('hidden') && !document.getElementById('inviteModal').classList.contains('hidden') && localStorage.getItem('cp_welcome_tour_v1') === 'done'), 'Invite people opens right away; the tour is done');
  await ev(b, () => closeInvite());

  out('5 a Google account left signed in from another role is not reused');
  const c = await openPhone('shared-phone', backend);
  await c.evaluateOnNewDocument(x => { if (!window.__googleAccount) window.__googleAccount = x; }, OTHER);
  await c.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await until(c, () => typeof gateGo === 'function', 'loaded');
  await ev(c, () => gateGo('teacher'));
  await until(c, () => !!document.getElementById('gateGoogleBtn'), 'teacher step');
  await c.click('#gateGoogleBtn');
  await until(c, () => !document.getElementById('gateGoogleError').classList.contains('hidden'), 'no teacher school', 8000);
  check(await ev(c, () => !!(cloud.auth.currentUser && cloud.auth.currentUser.email === 'jorzy.rockz@gmail.com')), 'set-up: a Google account is still signed in from the teacher step');
  await toCustodian(c);
  await setAcct(c, ROSA);
  await c.click('#rcGoogle');
  await until(c, () => reqRole && reqRole.role === 'custodian', 'custodian in', 8000);
  check(await ev(c, s => reqRole.schoolId === s && cloud.user.email === 'rosa.cruz@deped.gov.ph', sid), 'Continue with Google asked again: the custodian’s own account opens the school');
  check(schools().length === 2, 'no extra school');

  out('6 an ID whose school was erased is free again');
  backend.store.set('schoolIds/130001', { schoolId: 'gone-school', name: 'Old', updatedMs: 1 });
  const d = await openPhone('custodian-new2', backend);
  await d.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await toCustodian(d);
  await ev(d, () => { rcEmail.value = 'liza@deped.gov.ph'; rcPass.value = 'secret12'; rcSchool.value = 'Liloan CS'; rcSchoolNo.value = '130001'; });
  await d.click('#rcCreate');
  await until(d, () => reqRole && reqRole.role === 'custodian', 'liza in', 8000);
  await waitNode(() => (backend.store.get('schoolIds/130001') || {}).schoolId !== 'gone-school');
  check((backend.store.get('schoolIds/130001') || {}).schoolId === await ev(d, () => reqRole.schoolId), 'the free ID goes to the new school');
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('custodian-login');
}
