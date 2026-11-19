// Profile photos for every kind of user (Google photo, initials without one):
//  · custodian: on the More button and in More → Account;
//  · teacher: in "Your details" (their photo, or how to add one);
//  · School Head: at the top of their "For your approval" page, and on their card in the
//    custodian's School Head panel (head card: photo);
//  · assistant custodian: on their card in the custodian's Assistant panel (staff card: photo),
//    and on their own More button.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { waitNode, refused, openLink } from './lib/school-setup.mjs';

const backend = createBackend();
const CUST_PHOTO = 'https://lh3.googleusercontent.com/a/rhea-photo=s96-c';
const ANA_PHOTO = 'https://lh3.googleusercontent.com/a/ana-photo=s96-c';
const HEAD_PHOTO = 'https://lh3.googleusercontent.com/a/john-photo=s96-c';
const BEN_PHOTO = 'https://lh3.googleusercontent.com/a/ben-photo=s96-c';
const avatarOf = (page, sel) => ev(page, s => {
  const el = document.querySelector(s); const av = el && (el.matches('[data-avatar]') ? el : el.querySelector('[data-avatar]'));
  return av ? { kind: av.dataset.avatar, text: av.textContent.trim(), src: (av.querySelector('img') || {}).src || '' } : null;
}, sel);
const loaded = (page, sel, what) => until(page, s => { const i = document.querySelector(s + ' img'); return !!(i && i.complete && i.naturalWidth); }, what, 8000, sel);

async function joinTeacher(sid, name, google) {
  const t = await openPhone('teacher-' + name.split(' ')[0].toLowerCase(), backend);
  if (google) await t.evaluateOnNewDocument(a => { window.__googleAccount = a; }, google);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await until(t, () => !!cloud.user && !document.getElementById('joinGoogleBtn').disabled, 'signed in on the join sheet', 8000);
  await ev(t, n => { joinName.value = n; joinPosition.value = 'Teacher IV'; joinOffice.value = 'Grade 5'; }, name);
  if (google) await ev(t, () => { joinWithGoogle(); }); else await ev(t, () => { document.getElementById('joinBtn').click(); });
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', `${name} joined`, 8000);
  return { page: t, uid: await ev(t, () => cloud.user.uid) };
}

try {
  out('1 the custodian (Google): photo on the More button and in More → Account');
  const a = await openPhone('custodian', backend);
  await a.evaluateOnNewDocument(p => { window.__googleAccount = { email: 'rhea.nadado@deped.gov.ph', name: 'Rhealyn B. Nadado', photo: p }; }, CUST_PHOTO);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'Administrative Officer II'; openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcGoogle'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'Guanko Elementary School'; rcSchoolNo.value = /\d{6}/.test(rcSchool.value) ? '' : String(300000 + [...rcSchool.value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 600000, 7)); });
  await a.click('#rcGoogle');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected', 10000);
  await ev(a, () => { closeInvite(); switchMainView('HOME'); });
  const sid = await ev(a, () => reqRole.schoolId);
  await loaded(a, '#moreAv', 'More button photo');
  const mb = await avatarOf(a, '#moreAv');
  check(mb && mb.kind === 'photo' && /rhea-photo=s192-c$/.test(mb.src), 'More button: the custodian’s Google photo');
  check(await ev(a, () => { const r = document.getElementById('moreMenuBtn').getBoundingClientRect(); return r.right <= innerWidth && r.height <= 44; }), 'More button still fits the phone header');
  await ev(a, () => openMoreMenu());
  const acct = await avatarOf(a, '[data-more-av]');
  check(acct && acct.kind === 'photo' && /Property custodian/.test(await ev(a, () => document.getElementById('moreAccount').textContent)), 'More → Account: photo, “Property custodian”');
  await a.screenshot({ path: '/tmp/e2e_photos_custodian.png' });
  await ev(a, () => closeMoreMenu());

  out('2 teachers: “Your details” shows the photo, or how to add one');
  const { page: t } = await joinTeacher(sid, 'Ricky Q. Vicente', { email: 'ricky.vicente@deped.gov.ph', name: 'Ricky Q. Vicente', photo: ANA_PHOTO });
  await ev(t, () => editMyDetails());
  await loaded(t, '#joinMe', 'details photo');
  const jm = await avatarOf(t, '#joinMe');
  const jmText = await ev(t, () => document.getElementById('joinMe').textContent.replace(/\s+/g, ' '));
  check(jm && jm.kind === 'photo' && /Your photo/.test(jmText) && /ricky\.vicente@deped\.gov\.ph/.test(jmText), `Your details: Ricky’s photo, from Google (${jmText.trim().slice(0, 70)})`);
  await t.screenshot({ path: '/tmp/e2e_photos_details.png' });
  await ev(t, () => closeJoin());
  const { page: t2 } = await joinTeacher(sid, 'Ben Santos', null);
  await ev(t2, () => editMyDetails());
  const jm2 = await avatarOf(t2, '#joinMe');
  check(jm2 && jm2.kind === 'initials' && jm2.text === 'BS' && await ev(t2, () => /No photo yet/.test(document.getElementById('joinMe').textContent) && !!document.querySelector('#joinMe [data-join-google]')), 'no Google: initials BS, and a Sign in with Google button');
  check(await ev(t2, () => document.getElementById('joinGoogleWrap').classList.contains('hidden')), 'the join sheet’s own Google button stays hidden when editing');

  out('3 the School Head (Google): card photo for the custodian, photo on their page');
  const h = await openPhone('head', backend);
  await ev(a, () => openHeadPanel());
  await until(a, () => !!document.getElementById('headLinkText'), 'head link');
  const link = await ev(a, () => document.getElementById('headLinkText').textContent);
  await openLink(h, { email: 'john.guadalupe@deped.gov.ph', name: 'John Russell L. Guadalupe', photo: HEAD_PHOTO }, '#head=' + link.split('#head=')[1]);
  await ev(h, () => { hjDesig.value = 'School Principal I'; });
  await h.click('#hjBtn');
  await until(h, () => reqRole && reqRole.role === 'head' && headMeLoaded, 'head joined', 8000);
  const hUid = await ev(h, () => cloud.user.uid);
  await waitNode(() => (backend.store.get(`schools/${sid}/heads/${hUid}`) || {}).photo === HEAD_PHOTO);
  check((backend.store.get(`schools/${sid}/heads/${hUid}`) || {}).photo === HEAD_PHOTO, 'head card carries the photo (while waiting for Confirm)');
  await until(a, () => headList.some(x => x.status === 'pending' && x.photo), 'custodian sees the photo', 8000);
  await loaded(a, '[data-head-av]', 'head card photo');
  check((await avatarOf(a, '[data-head-av]')).kind === 'photo', 'School Head panel: John’s photo on “Confirm”');
  await ev(a, u => { confirmHead(u); }, hUid);
  await until(h, () => headMe && headMe.status === 'active', 'head active', 8000);
  await ev(h, () => switchMainView('HEAD'));
  await loaded(h, '#hdAvatar', 'head page photo');
  const hd = await avatarOf(h, '#hdAvatar');
  check(hd && hd.kind === 'photo' && /john-photo/.test(hd.src) && /Good day, John/.test(await ev(h, () => document.getElementById('hdHello').textContent)), 'head page: photo next to “Good day, John / For your approval”');
  await h.screenshot({ path: '/tmp/e2e_photos_head.png' });
  check(await refused(h, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'heads', uid), { photo: 'https://evil.example/x.png' }), sid, hUid), 'rules: a head card photo must be a Google photo');
  await ev(a, () => closeHeadPanel());

  out('4 the assistant custodian (Google): card photo, and their own More button');
  await ev(a, () => openAssistPanel());
  await until(a, () => !!document.getElementById('assistLinkText'), 'assistant link', 8000);
  const alink = await ev(a, () => document.getElementById('assistLinkText').textContent);
  await ev(a, () => closeAssistPanel());
  const b = await openPhone('assistant-ben', backend);
  await openLink(b, { email: 'ben.cruz@deped.gov.ph', name: 'Ben Cruz', photo: BEN_PHOTO }, '#assist=' + alink.split('#assist=')[1]);
  await ev(b, () => { hjDesig.value = 'Teacher I · supply room'; });
  await b.click('#hjBtn');
  await until(b, () => reqRole && reqRole.role === 'incoming' && reqRole.kind === 'assist' && turnJoinLoaded, 'assistant waiting', 8000);
  const bUid = await ev(b, () => cloud.user.uid);
  await waitNode(() => (backend.store.get(`schools/${sid}/staff/${bUid}`) || {}).photo === BEN_PHOTO);
  check((backend.store.get(`schools/${sid}/staff/${bUid}`) || {}).photo === BEN_PHOTO, 'assistant card carries the photo (while waiting)');
  await ev(a, () => openAssistPanel());
  await until(a, () => staffList.some(s => s.photo), 'custodian sees the photo', 8000);
  await loaded(a, '[data-staff-av]', 'staff card photo');
  check((await avatarOf(a, '[data-staff-av]')).kind === 'photo', 'Assistant panel: Ben’s photo on “Confirm”');
  await ev(a, uid => { confirmAssistant(uid); }, bUid);
  await until(b, () => reqRole && reqRole.role === 'custodian' && reqRole.assistant, 'assistant active', 12000);
  await ev(b, () => switchMainView('HOME'));
  await loaded(b, '#moreAv', 'assistant More photo');
  check(/ben-photo/.test((await avatarOf(b, '#moreAv')).src), 'assistant: their own photo on the More button');
  await ev(b, () => openMoreMenu());
  check(await ev(b, () => /Assistant custodian/.test(document.getElementById('moreAccount').textContent)) && (await avatarOf(b, '[data-more-av]')).kind === 'photo', 'More → Account: photo, “Assistant custodian”');
  check(await refused(b, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'staff', uid), { photo: 'javascript:alert(1)' }), sid, bUid), 'rules: an assistant card photo must be a Google photo');
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('photos-everyone');
}
