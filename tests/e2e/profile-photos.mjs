// Profile photos and phone notification pictures:
//  · the teacher's Google photo at the top of their screen (initials without Google, with a
//    hint to sign in with Google), the custodian's photo next to "To the property custodian of …";
//  · photos in the custodian's list of teachers (member card: photo), initials as the fallback;
//  · phone notifications: a picture for each kind (its icon and colour), and the person's photo
//    with the icon in a bubble when it is about someone; the same in the bell list.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, ev, sleep, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { waitNode, refused } from './lib/school-setup.mjs';

const backend = createBackend();
const CUST_PHOTO = 'https://lh3.googleusercontent.com/a/rhea-photo=s96-c';
const ANA_PHOTO = 'https://lh3.googleusercontent.com/a/ana-photo=s96-c';
const CARLA_PHOTO = 'https://lh3.googleusercontent.com/a/broken-carla=s96-c';

// Phone notifications are recorded instead of shown (headless Chrome always says "denied").
async function instrument(page) {
  await page.evaluateOnNewDocument(() => {
    window.Notification = class {
      constructor(title, o) { window.__shown.push({ title, ...o, direct: true }); }
      static get permission() { return 'granted'; }
      static requestPermission() { return Promise.resolve('granted'); }
    };
    window.__shown = [];
    window.__hidden = false;
    try { localStorage.setItem('custodian_notification_prefs_v1', JSON.stringify({ quiet: false, system: true })); } catch (e) {}
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (title, o) => { window.__shown.push({ title, ...o }); } });
  });
}
async function joinTeacher(sid, name, google) {
  const t = await openPhone('teacher-' + name.split(' ')[0].toLowerCase(), backend);
  await instrument(t);
  if (google) await t.evaluateOnNewDocument(a => { window.__googleAccount = a; }, google);
  await t.goto(BASE_URL + '#join=' + sid, { waitUntil: 'networkidle0' });
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await until(t, () => !!cloud.user && !document.getElementById('joinGoogleBtn').disabled, 'signed in on the join sheet', 8000);
  await ev(t, n => { joinName.value = n; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 4'; }, name);
  if (google) await ev(t, () => { joinWithGoogle(); }); else await t.click('#joinBtn');
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded && myMemberStatus() === 'active', `${name} joined`, 8000);
  return { page: t, uid: await ev(t, () => cloud.user.uid) };
}
const avatarOf = (page, sel) => ev(page, s => { const el = document.querySelector(s); const av = el && (el.matches('[data-avatar]') ? el : el.querySelector('[data-avatar]')); return av ? { kind: av.dataset.avatar, text: av.textContent.trim(), src: (av.querySelector('img') || {}).src || '', loaded: !!(av.querySelector('img') && av.querySelector('img').complete && av.querySelector('img').naturalWidth) } : null; }, sel);

try {
  out('1 the custodian signs in with Google');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await instrument(a);
  await a.evaluateOnNewDocument(p => { window.__googleAccount = { email: 'rhea.nadado@deped.gov.ph', name: 'Rhealyn B. Nadado', photo: p }; }, CUST_PHOTO);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'Administrative Officer II'; openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcGoogle'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'Guanko Elementary School'; });
  await a.click('#rcGoogle');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected', 10000);
  await ev(a, () => { if (typeof closeInvite === 'function') closeInvite(); });
  const sid = await ev(a, () => reqRole.schoolId);
  await waitNode(() => (backend.store.get(`schools/${sid}`) || {}).custodianPhoto === CUST_PHOTO);
  check(backend.store.get(`schools/${sid}`).custodianPhoto === CUST_PHOTO, 'the school document carries the custodian’s Google photo');

  out('2 Ana joins with Google: her photo at the top of her screen');
  const { page: t, uid: ana } = await joinTeacher(sid, 'Ana Reyes', { email: 'ana.reyes@deped.gov.ph', name: 'Ana Reyes', photo: ANA_PHOTO });
  await waitNode(() => (backend.store.get(`schools/${sid}/members/${ana}`) || {}).photo === ANA_PHOTO);
  check((backend.store.get(`schools/${sid}/members/${ana}`) || {}).photo === ANA_PHOTO, 'her member card keeps the photo');
  await ev(t, () => setTeacherTab('items'));
  await until(t, () => { const i = document.querySelector('#rqAvatar img'); return !!(i && i.complete && i.naturalWidth); }, 'header photo loads', 6000);
  const hdr = await avatarOf(t, '#rqAvatar');
  check(hdr && hdr.kind === 'photo' && /ana-photo=s192-c$/.test(hdr.src) && hdr.loaded, `header: her photo, sharp (192 px) (${hdr && hdr.src})`);
  check(await ev(t, () => document.querySelector('#rqAvatar img').getAttribute('referrerpolicy') === 'no-referrer'), 'loaded without a referrer (Google may refuse it otherwise)');
  await until(t, () => !document.getElementById('rqCustAv').classList.contains('hidden'), 'custodian photo', 8000);
  const cust = await avatarOf(t, '#rqCustAv');
  check(cust && cust.kind === 'photo' && /rhea-photo/.test(cust.src) && /To the property custodian of Guanko/.test(await ev(t, () => document.getElementById('rqSchool').textContent)), 'next to “To the property custodian of …”: the custodian’s photo');
  check(await ev(t, () => reqRole.custName === 'Rhealyn B. Nadado'), 'the custodian’s name is known (for initials, notifications)');
  await ev(t, () => setTeacherTab('stock'));
  await sleep(100);
  check(await ev(t, () => document.getElementById('rqCustAv').classList.contains('hidden')), 'School stock tab (“Supplies left at …”): no custodian chip');
  await ev(t, () => setTeacherTab('items'));
  await t.click('#rqAvatar');
  await sleep(200);
  check(await ev(t, () => !document.getElementById('joinModal').classList.contains('hidden')), 'tapping her photo opens My details');
  await ev(t, () => closeJoin());
  await t.screenshot({ path: '/tmp/e2e_photo_header.png' });

  out('3 Ben joins without Google: initials, and a hint');
  const { page: tb, uid: ben } = await joinTeacher(sid, 'Ben Cruz', null);
  await ev(tb, () => setTeacherTab('items'));
  await sleep(200);
  const bh = await avatarOf(tb, '#rqAvatar');
  check(bh && bh.kind === 'initials' && bh.text === 'BC', `header: his initials (${bh && bh.text})`);
  check(await ev(tb, () => /Sign in with Google to show your photo/.test(document.getElementById('rqAccount').textContent)), 'hint: Sign in with Google to show your photo');
  check(!(backend.store.get(`schools/${sid}/members/${ben}`) || {}).photo, 'no photo on his card');

  out('4 Carla’s Google photo is broken: initials instead');
  const { uid: carla } = await joinTeacher(sid, 'Carla Dizon', { email: 'carla@gmail.com', name: 'Carla Dizon', photo: CARLA_PHOTO });
  await waitNode(() => (backend.store.get(`schools/${sid}/members/${carla}`) || {}).photo === CARLA_PHOTO);

  out('5 the custodian’s list of teachers');
  await until(a, (x, y, z) => [x, y, z].every(u => memberList.some(m => m.uid === u)) && memberPhoto(x) !== '', 'three teachers, Ana’s photo', 8000, ana, ben, carla);
  await ev(a, () => openTeachersView());
  await until(a, u => { const i = document.querySelector(`button[onclick="openTeachersView('${u}')"] img`); return !!(i && i.complete && i.naturalWidth); }, 'Ana’s row photo', 6000, ana);
  const rowA = await avatarOf(a, `button[onclick="openTeachersView('${ana}')"]`);
  const rowB = await avatarOf(a, `button[onclick="openTeachersView('${ben}')"]`);
  await sleep(500);
  const rowC = await avatarOf(a, `button[onclick="openTeachersView('${carla}')"]`);
  check(rowA && rowA.kind === 'photo' && rowA.loaded, 'Ana’s row: her photo');
  check(rowB && rowB.kind === 'initials' && rowB.text === 'BC', 'Ben’s row: initials');
  check(rowC && rowC.kind === 'initials' && rowC.text === 'CD' && !rowC.src, 'Carla’s row: the broken photo falls back to initials');
  await a.screenshot({ path: '/tmp/e2e_photo_list.png' });
  await ev(a, u => openTeachersView(u), ana);
  await sleep(300);
  const pg = await avatarOf(a, '#tvPersonAv');
  check(pg && pg.kind === 'photo' && /ana-photo/.test(pg.src), 'Ana’s page: her photo in the header');

  out('6 rules: only a Google photo address, only on your own card');
  check(await refused(tb, (F, s, u) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', s, 'members'), u), { photo: 'https://evil.example/x.png' }), sid, ben), 'a teacher can’t put another address as photo');
  check(await refused(tb, (F, s, u) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', s, 'members'), u), { photo: 'https://lh3.googleusercontent.com/a/ben=s96-c' }), sid, ana), 'a teacher can’t change another teacher’s photo');
  check(!(await refused(tb, (F, s, u) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', s, 'members'), u), { photo: '' }), sid, ben)), 'a teacher may clear their own');

  out('7 phone notifications: a picture for each kind, a photo when it is about someone');
  const pics = await ev(a, async u => {
    const tray = await notifPictures({ icon: 'ph-tray', tone: 'amber', person: u });
    const pkg = await notifPictures({ icon: 'ph-package', tone: 'amber' });
    const warn = await notifPictures({ icon: 'ph-warning', tone: 'rose' });
    const glyphs = ['ph-tray', 'ph-package', 'ph-warning', 'ph-user-plus'].every(i => !!notifGlyph(i));
    return { tray: { ...tray, icon: tray.icon.length }, pkgIcon: pkg.icon, warnIcon: warn.icon, pkgPerson: pkg.person, badge: pkg.badge.slice(0, 22), glyphs, same: pkg.icon === warn.icon };
  }, ana);
  check(pics.glyphs, 'each notification icon is found in the app’s icon font');
  check(/^data:image\/png/.test(pics.pkgIcon) && /^data:image\/png/.test(pics.badge) && !pics.pkgPerson, 'not about a person: the coloured icon, and a status-bar badge');
  check(!pics.same, 'different kinds get different pictures');
  check(pics.tray.person === 'Ana Reyes' && pics.tray.photo, 'about Ana: her photo (with the icon in a bubble)');
  const supply = await ev(a, () => items.find(x => x.type === 'CONSUMABLE' && x.qty >= 8 && !relIsEquip(x)).name);
  const hidden = await ev(a, () => { window.__shown = []; window.__hidden = true; return true; });
  await ev(t, w => { openRequestForm(); document.getElementById('rfSearch').value = w; addReqLine(); reqDraft.lines[0].qty = 2; sendRequest(); }, supply);
  await until(a, () => window.__shown.some(x => /New supply request from Ana Reyes/.test(x.title)), 'custodian’s phone notification', 10000);
  const sh = await ev(a, () => window.__shown.find(x => /New supply request from Ana Reyes/.test(x.title)));
  check(hidden && /^data:image\/png/.test(sh.icon) && /^data:image\/png/.test(sh.badge) && sh.icon !== 'assets/icons/icon-192.png', 'custodian’s phone: “New supply request from Ana Reyes” with its own picture');
  await ev(a, () => { window.__hidden = false; openNotifPanel(); });
  await sleep(300);
  check(await ev(a, () => { const row = [...document.querySelectorAll('[data-notif]')].find(b => /Ana Reyes/.test(b.textContent)); return !!(row && row.querySelector('[data-notif-person] [data-avatar="photo"]')); }), 'bell list: Ana’s photo with the icon in a bubble');
  await a.screenshot({ path: '/tmp/e2e_photo_bell.png' });
  await ev(a, () => { if (typeof closeNotifPanel === 'function') closeNotifPanel(); });
  // The teacher's phone: the custodian approves → picture with the custodian's photo
  const rq = await ev(a, () => reqList.find(r => r.status === 'pending' && /Ana/.test(r.name)).id);
  await ev(t, () => { window.__shown = []; window.__hidden = true; });
  await ev(a, id => { openReview(id); approveRequest(); }, rq);
  await until(t, () => window.__shown.some(x => /approved/.test(x.title)), 'Ana’s phone notification', 10000);
  const tsh = await ev(t, () => window.__shown.find(x => /approved/.test(x.title)));
  check(/^data:image\/png/.test(tsh.icon) && /^data:image\/png/.test(tsh.badge), 'Ana’s phone: “approved” with its own picture');
  check(await ev(t, async () => { const p = await notifPictures({ icon: 'ph-check-circle', tone: 'emerald', go: 'teacher-requests' }); return p.person === 'Rhealyn B. Nadado' && p.photo; }), '…showing the custodian’s photo');
  check(await ev(t, async () => !(await notifPictures({ icon: 'ph-hand-heart', tone: 'emerald', go: 'library' })).person), 'Library notifications (from the librarian): the icon only');
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('profile-photos');
}
