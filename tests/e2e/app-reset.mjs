// More → Reset app: "Only this device" (local data + sign-in; the school in the cloud comes back
// on sign-in) and "This device and the school in the cloud" (every document of the school, the
// School ID and the school itself erased; teachers' phones see "was reset"; signing in again
// starts a new, empty school). Typed RESET confirms.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
const SCHOOL = '114656 - San Jose National High School';
async function signIn(a, create) {
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, s => { rcSchool.value = s; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; }, SCHOOL);
  await a.click(create ? '#rcCreate' : '#rcSignIn');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian', 10000);
  await ev(a, () => { if (typeof closeInvite === 'function') closeInvite(); });
}
async function typeReset(a) {
  await a.click('#resetConfirm', { clickCount: 3 });
  await a.type('#resetConfirm', 'reset');
}
// Keys a brand-new device writes on its first start (version seen, default cloud project).
let FRESH = [];
const leftovers = page => ev(page, fresh => Object.keys(localStorage).filter(k => k !== 'cp_welcome_tour_v1' && !fresh.includes(k)), FRESH);
const reloaded = (a, ms = 10000) => until(a, () => document.readyState === 'complete' && typeof reqRole !== 'undefined' && !window.__beforeReset, 'reloaded', ms);

try {
  out('1 custodian with a school, a teacher, slips and a report');
  const fresh = await openPhone('fresh', backend);
  await fresh.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await sleep(800);
  FRESH = await ev(fresh, () => Object.keys(localStorage));
  out(`   (a new device writes: ${FRESH.join(', ')})`);
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rosa Villanueva'; });
  await signIn(a, true);
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  await waitNode(() => backend.store.has('schoolIds/114656'), 'school id listed');
  check(backend.store.has('schoolIds/114656'), 'School ID 114656 listed for the school');
  const P = '45111609-MM-P01';
  await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }, P);

  const t = await openPhone('teacher-ana', backend);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(t, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Science'; });
  await t.click('#joinBtn');
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', 'Ana joined', 8000);
  const ana = await ev(t, () => cloud.user.uid);
  await until(a, () => teacherRoster().some(x => x.joined), 'roster', 8000);
  await ev(a, uid => openRelease({ teacherUid: uid, lines: [{ code: '45111609-MM-P01', qty: 1 }, { code: '12191601-AL-E04', qty: 3 }] }), ana);
  await sleep(200);
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
  await until(t, () => myReleases.length === 2, 'Ana releases', 8000);
  await ev(t, () => { const r = myReleases.find(x => x.kind !== 'RIS'); openTeacherReport('problem', r.id, r.lines[0].units[0].id); sendTeacherReport(); });
  await waitNode(() => backend.docs(`schools/${sid}/teacherReports/`).length >= 1, 'report');
  const before = backend.docs(`schools/${sid}`).length;
  check(before > 10, `the school has ${before} documents in the cloud`);

  out('2 More → Reset app: the sheet');
  await ev(a, () => openMoreMenu());
  await sleep(200);
  check(await ev(a, () => !!document.getElementById('moreResetItem') && getComputedStyle(document.getElementById('moreResetItem')).display !== 'none'), 'More → Data & settings has “Reset app…”');
  await a.click('#moreResetItem');
  await until(a, () => !document.getElementById('resetModal').classList.contains('hidden'), 'reset sheet');
  let sheet = await ev(a, () => ({
    text: document.getElementById('resetCard').innerText,
    scope: document.querySelector('[data-reset-opt][aria-checked="true"]').dataset.resetOpt,
    cloudOn: !document.querySelector('[data-reset-opt="cloud"]').disabled,
    go: document.getElementById('resetGo').disabled,
    more: !document.getElementById('moreMenu') || document.getElementById('moreMenu').classList.contains('hidden')
  }));
  check(sheet.more, 'More closes behind it');
  check(sheet.scope === 'device' && sheet.cloudOn, 'two choices; “Only this device” picked by default');
  check(/San Jose National High School in the cloud is kept/.test(sheet.text) && /erases 114656 - San Jose National High School for good/.test(sheet.text), 'each choice says what it erases and what stays');
  check(sheet.go, 'Reset is locked until RESET is typed');
  await a.type('#resetConfirm', 'RESE');
  check(await ev(a, () => document.getElementById('resetGo').disabled), '“RESE” is not enough');
  await a.type('#resetConfirm', 'T');
  check(await ev(a, () => !document.getElementById('resetGo').disabled), '“RESET” unlocks it');
  await a.click('#resetBackup');
  check((await ev(a, () => window.__downloads)).some(f => /\.json$/.test(f)), '“Back up” downloads a backup file first');
  await a.screenshot({ path: '/tmp/e2e_reset_sheet.png' });
  await a.click('#resetCancel');
  check(await ev(a, () => document.getElementById('resetModal').classList.contains('hidden') && reqRole && items.some(i => i.qty > 0)), 'Cancel: nothing changed');

  out('3 Only this device');
  await ev(a, () => openResetApp());
  await typeReset(a);
  await ev(a, () => { window.__beforeReset = true; });
  await a.click('#resetGo');
  await reloaded(a);
  await sleep(600);
  const local = await ev(a, () => ({
    role: reqRole, qty: items.reduce((n, i) => n + (i.qty || 0), 0), toast: document.getElementById('appToastText').textContent
  }));
  local.keys = await leftovers(a);
  check(local.keys.length === 0, `this device is as empty as a new one (${local.keys.join(', ') || 'nothing left'})`);
  check(!local.role && local.qty === 0, 'signed out, no inventory on the device');
  check(/Reset done · this device is clean/.test(local.toast), 'toast: “Reset done · this device is clean”');
  check(backend.docs(`schools/${sid}`).length === before, 'the school in the cloud is untouched');
  await signIn(a, false);
  await until(a, () => inventorySyncActive() && items.some(i => i.qty > 0), 'inventory back', 10000);
  check(await ev(a, s => reqRole.schoolId === s && items.find(i => i.code === '12191601-AL-E04').qty > 0, sid), 'sign in again: the same school and its inventory come back');

  out('4 This device and the school in the cloud');
  await ev(a, () => openResetApp());
  await a.click('[data-reset-opt="cloud"]');
  check(await ev(a, () => document.querySelector('[data-reset-opt="cloud"]').getAttribute('aria-checked') === 'true' && /Erase and reset/.test(document.getElementById('resetGo').innerText)), 'picking the cloud option: “Erase and reset”');
  await typeReset(a);
  await ev(a, () => { window.__beforeReset = true; });
  await a.click('#resetGo');
  await reloaded(a, 15000);
  await sleep(600);
  const left = backend.docs(`schools/${sid}`);
  check(left.length === 0, `every document of the school erased (${left.length} left${left.length ? ': ' + left.slice(0, 3).map(d => d.path).join(', ') : ''})`);
  check(!backend.store.has('schoolIds/114656'), 'School ID 114656 is free again');
  check(await ev(a, () => !reqRole) && (await leftovers(a)).length === 0, 'this device is empty and signed out');
  check(/School erased · this device is clean/.test(await ev(a, () => document.getElementById('appToastText').textContent)), 'toast: “School erased · this device is clean”');

  out('5 Ana’s phone: the school was reset');
  await until(t, () => reqRole && reqRole.schoolGone, 'Ana sees it', 10000);
  await ev(t, () => setTeacherTab('requests'));
  await sleep(300);
  check(await ev(t, () => !!document.getElementById('rqGone') && /was reset/.test(document.getElementById('rqGone').innerText)), 'banner: “San Jose … was reset” with Leave');
  const tn = await ev(t, () => ({ scope: notifScope(), items: notifScope() ? loadNotifs().items.map(n => n.title) : [], gone: reqRole && reqRole.schoolGone, tab: teacherTab }));
  check(tn.items.some(x => /was reset/.test(x)), `Ana gets a notification (${JSON.stringify(tn)})`);
  check(await ev(t, () => myReleases.length === 0), 'her list is empty');
  t.dialogs.confirm = true;
  await ev(t, () => { document.querySelector('#rqGone button').click(); });
  await until(t, () => !reqRole, 'left', 8000);
  check(true, 'Leave takes her back to the start, ready to join again');

  out('6 sign in again: a new, empty school');
  // An ID still listed by an erased school (e.g. written while it was being erased) is free to take.
  backend.store.set('schoolIds/114656', { schoolId: 'erased-school', name: 'Old', updatedMs: 1 });
  a.dialogs.prompt = SCHOOL;
  await signIn(a, false);
  const sid2 = await ev(a, () => reqRole.schoolId);
  check(sid2 && sid2 !== sid, 'a new school is created for the same account');
  await waitNode(() => (backend.store.get('schoolIds/114656') || {}).schoolId === sid2, 'id taken over');
  check((backend.store.get('schoolIds/114656') || {}).schoolId === sid2, 'School ID 114656 listed for the new school (the stale entry is taken over)');
  check(backend.docs(`schools/${sid2}/members/`).length === 0 && backend.docs(`schools/${sid2}/releases/`).length === 0, 'no teachers, no slips');

  out('7 teacher phone: only this phone; rules');
  const j = await openPhone('teacher-juan', backend);
  await j.goto(BASE_URL + '#join=' + sid2, { waitUntil: 'networkidle0' });
  await until(j, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(j, () => { joinName.value = 'Juan Cruz'; joinPosition.value = 'Teacher I'; joinOffice.value = 'Grade 9'; });
  await j.click('#joinBtn');
  await until(j, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', 'Juan joined', 8000);
  const perm = await ev(j, async s => {
    const F = cloud.sdk, r = {};
    try { const b = F.writeBatch(cloud.db); b.delete(F.doc(cloud.db, 'schools', s)); await b.commit(); r.school = 'allowed'; } catch (e) { r.school = e.code; }
    try { const b = F.writeBatch(cloud.db); b.delete(F.doc(cloud.db, 'schools', s, 'members', cloud.user.uid)); await b.commit(); r.member = 'allowed'; } catch (e) { r.member = e.code; }
    return r;
  }, sid2);
  check(perm.school === 'permission-denied' && perm.member === 'permission-denied', 'a teacher cannot delete the school or even their own card');
  await ev(j, () => openResetApp());
  const jt = await ev(j, () => ({ opts: [...document.querySelectorAll('[data-reset-opt]')].map(b => b.dataset.resetOpt), text: document.getElementById('resetCard').innerText }));
  check(jt.opts.join() === 'device' && /Only this phone/.test(jt.text), 'teacher: only “Only this phone”');
  await typeReset(j);
  await ev(j, () => { window.__beforeReset = true; });
  await j.click('#resetGo');
  await reloaded(j);
  check(await ev(j, () => !reqRole) && (await leftovers(j)).length === 0, 'Juan’s phone is clean');
  check(backend.store.has(`schools/${sid2}/members/${backend.docs(`schools/${sid2}/members/`)[0]?.uid}`), 'his card stays with the custodian');
  // Ana's phone loses access the moment the school is erased: its open listeners are refused once.
  const appDenied = backend.denied.filter(x => !/^delete/.test(x) && !(new RegExp(`^read \\w+ · .*schools/${sid}/`).test(x)));
  check(appDenied.length === 0, `app flows refused 0 times (${appDenied.length}) ${appDenied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('app-reset');
  await closeAll();
}
