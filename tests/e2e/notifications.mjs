// Notifications: the bell (unread count + list), toasts, the app-icon badge, phone notifications
// while the app is in the background, tapping one, nothing for your own actions, no repeats
// after a reload, catching up on what happened while the app was closed, and the install bar
// and home-screen shortcuts that ship in the same change. Also: a teacher joined, low stock /
// out of stock, reminders to tap Received, and the switches for those in the sheet.
import fs from 'node:fs';
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const reports = () => backend.docs('schools/').filter(d => /\/teacherReports\//.test(d.path));
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
// Record what the page would show outside the browser: app badge and phone notifications.
async function instrument(page, { granted = false } = {}) {
  // (Headless Chrome always answers "denied", so the permission API is stood in for too.)
  await page.evaluateOnNewDocument(granted => {
    window.__perm = granted ? 'granted' : 'default';
    window.__permAsked = 0;
    window.Notification = class {
      constructor(title, o) { window.__shown.push({ title, ...o, direct: true }); }
      static get permission() { return window.__perm; }
      static requestPermission() { window.__permAsked++; window.__perm = window.__permAnswer || 'granted'; return Promise.resolve(window.__perm); }
    };
    window.__badge = [];
    navigator.setAppBadge = n => { window.__badge.push(n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__badge.push(0); return Promise.resolve(); };
    window.__shown = [];
    window.__hidden = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (title, o) => { window.__shown.push({ title, ...o }); } });
    }
  }, granted);
}
async function joinAsTeacher(page, schoolId, name, position, office) {
  await page.goto(BASE_URL + '#join=' + schoolId, { waitUntil: 'networkidle0' });
  await until(page, () => !document.getElementById('joinModal').classList.contains('hidden') && !document.getElementById('joinBtn').disabled, 'join sheet');
  await ev(page, (n, p, o) => { joinName.value = n; joinPosition.value = p; joinOffice.value = o; }, name, position, office);
  await page.click('#joinBtn');
  await until(page, () => reqRole && reqRole.role === 'teacher' && cloud.user, 'joined');
  return ev(page, () => cloud.user.uid);
}
async function teacherRequest(page, what) {
  await ev(page, w => { openRequestForm(); document.getElementById('rfSearch').value = w; addReqLine(); sendRequest(); }, what);
}
async function release(a, uid, lines) {
  await ev(a, (uid, lines) => openRelease({ teacherUid: uid, lines }), uid, lines);
  await sleep(200);
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
}
const notifs = page => ev(page, () => (notifScope() ? loadNotifs().items.map(n => ({ id: n.id, title: n.title, body: n.body, read: n.read, go: n.go })) : []));
const bell = page => ev(page, () => ({
  shown: !document.getElementById('notifBtn').classList.contains('hidden'),
  count: document.getElementById('notifCount').classList.contains('hidden') ? 0 : document.getElementById('notifCount').textContent
}));
const waitNotif = (page, re, what, ms = 9000) =>
  until(page, src => notifScope() && loadNotifs().items.some(n => new RegExp(src).test(n.title + ' ' + n.body)), what, ms, re.source);

try {
  out('1 custodian and a teacher');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await instrument(a);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(!(await bell(a)).shown, 'no bell before signing in to a school');
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rosa Villanueva'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); }); // signed out: the sign-in screen carries the form
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  const sid = await ev(a, () => reqRole.schoolId);
  const P = '45111609-MM-P01';
  await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }, P);
  let b = await bell(a);
  check(b.shown && b.count === 0, 'custodian: bell in the header, nothing unread');

  const t = await openPhone('teacher-ana', backend);
  await instrument(t, { granted: true });
  const ana = await joinAsTeacher(t, sid, 'Ana Reyes', 'Teacher III', 'Grade 7 – Science');
  await until(t, () => !!notifScope() && loadNotifs().primed.requests, 'teacher primed', 8000);
  check((await bell(t)).shown && (await notifs(t)).length === 0, 'teacher: bell shown, no old history announced');
  await waitNotif(a, /Ana Reyes joined your school/, 'joined');
  const joined = (await notifs(a)).find(n => /joined/.test(n.title));
  check(joined && joined.body === 'Teacher III · Grade 7 – Science' && joined.go === 'teachers', `custodian: “${joined && joined.title}” · ${joined && joined.body}`);
  await ev(a, id => openNotif(id), joined.id);
  await sleep(300);
  check(await ev(a, uid => activeMainView === 'TEACHERS' && teachersSel === uid, ana), 'tap → Teachers, Ana’s page');
  // (taken off the list so the counts below stay about requests)
  await ev(a, () => { loadNotifs().items = loadNotifs().items.filter(n => !/joined/.test(n.title)); saveNotifs(); renderNotifBell(); switchMainView('HOME'); });

  out('2 teacher sends a request → custodian is told');
  await teacherRequest(t, 'Bond paper, A4');
  await waitNotif(a, /New supply request from Ana Reyes/, 'custodian notified');
  let list = await notifs(a);
  check(list.length === 1 && /Bond paper, A4/.test(list[0].body), `custodian: “${list[0] && list[0].title}” · ${list[0] && list[0].body}`);
  b = await bell(a);
  check(b.count === '1', 'bell shows 1 unread');
  check(await ev(a, () => window.__badge.includes(1)), 'app icon badge set to 1');
  await until(a, () => /New supply request from Ana Reyes/.test(document.getElementById('appToast').innerText), 'toast', 3000);
  check(await ev(a, () => /View/i.test(document.getElementById('appToast').innerText)), 'a toast with “View” while the app is open');
  check(await ev(a, () => window.__shown.length) === 0, 'no phone notification while looking at the app');
  check((await notifs(t)).length === 0, 'teacher is not notified of her own request');

  out('3 custodian opens the bell and taps it');
  await ev(a, () => switchMainView('HOME'));
  await a.click('#notifBtn');
  await sleep(200);
  const panel = await ev(a, () => document.getElementById('notifPanel').innerText);
  check(/Notifications/.test(panel) && /New supply request from Ana Reyes/.test(panel) && /just now/.test(panel), 'sheet lists the notification with its time');
  check(/Get these on your phone too/.test(panel), 'offers to turn on phone notifications (never asked automatically)');
  check(await ev(a, () => Notification.permission === 'default' && window.__permAsked === 0), 'browser permission was not requested by itself');
  await a.screenshot({ path: '/tmp/e2e_n_panel.png' });
  await a.click('[data-notif]');
  await sleep(300);
  check(await ev(a, () => activeMainView === 'REQUESTS' && reqTab === 'pending' && document.getElementById('notifPanel').classList.contains('hidden')), 'tap → Supply requests, Pending tab');
  b = await bell(a);
  check(b.count === 0 && (await notifs(a))[0].read, 'marked read; bell count cleared');
  check(await ev(a, () => window.__badge[window.__badge.length - 1] === 0), 'app icon badge cleared');

  out('4 approved while the teacher’s app is in the background → phone notification');
  await ev(t, () => { notifPrefs.system = true; window.__hidden = true; });
  const rq1 = await ev(a, () => reqList.find(r => r.name === 'Ana Reyes').id);
  await ev(a, id => { openReview(id); approveRequest(); }, rq1);
  await waitNotif(t, /approved/, 'teacher approved');
  await until(t, () => window.__shown.length >= 1, 'phone notification', 3000);
  const shown = await ev(t, () => window.__shown[0]);
  check(shown.title === 'Your supply request was approved' && /Bond paper/.test(shown.body), `phone notification: “${shown.title}” · ${shown.body}`);
  check(shown.icon === 'assets/icons/icon-192.png' && shown.badge === 'assets/icons/badge-96.png' && !!shown.data.nid && shown.tag === shown.data.nid, 'with app icon, status-bar badge and the notification id');
  check((await notifs(a)).length === 1, 'custodian is not notified of their own approval');
  // Tapping it: the service worker focuses the app and posts the id.
  await ev(t, nid => { window.__hidden = false; navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'open-notification', nid } })); }, shown.data.nid);
  await sleep(300);
  check(await ev(t, () => activeMainView === 'REQUESTER' && teacherTab === 'requests'), 'tapping it opens My requests');
  check((await notifs(t))[0].read, '…and marks it read');

  out('5 declined (with reason) and ready');
  await teacherRequest(t, 'Whiteboard marker');
  await teacherRequest(t, 'Stapler');
  await until(a, () => reqList.filter(r => r.name === 'Ana Reyes' && r.status === 'pending' && !r.sending).length === 2, 'two more', 9000);
  const [rqM, rqS] = await ev(a, () => ['Whiteboard marker', 'Stapler'].map(w => reqList.find(r => reqLinesOf(r)[0].desc === w).id));
  a.dialogs.prompt = 'Use the ones in the faculty room';
  await ev(a, id => { openReview(id); declineRequest(); }, rqM);
  await ev(a, id => markReqSupplied(id), rqS);
  await waitNotif(t, /declined/, 'declined');
  await waitNotif(t, /Ready/, 'ready');
  list = await notifs(t);
  const dec = list.find(n => /declined/.test(n.title));
  check(dec && /Whiteboard marker · Use the ones in the faculty room/.test(dec.body), `declined: ${dec && dec.body}`);
  check(list.some(n => n.title === 'Ready · get it from the property custodian' && /Stapler/.test(n.body)), 'ready: get it from the property custodian');
  check(list.filter(n => /approved/.test(n.title)).length === 1, 'approval announced once');
  b = await bell(t);
  check(b.count === '2', `teacher bell: ${b.count} unread`);

  out('6 items released to the teacher');
  await release(a, ana, [{ code: P, qty: 1 }]);
  await waitNotif(t, /New items released to you/, 'release');
  const relN = (await notifs(t)).find(n => /released/.test(n.title));
  check(/^ICS /.test(relN.body) && /MULTIMEDIA PROJECTOR/.test(relN.body) && /Received/.test(relN.body), `release: ${relN.body}`);
  await ev(t, id => openNotif(id), relN.id);
  await sleep(200);
  check(await ev(t, () => activeMainView === 'REQUESTER' && teacherTab === 'items'), 'tap → My items');

  out('7 teacher confirms, reports and returns → custodian is told');
  const before = (await notifs(a)).length;
  await until(t, () => myReleases.length === 1, 'release on teacher', 8000);
  await ev(t, () => ackRelease(myReleases[0].id));
  await waitNotif(a, /Ana Reyes confirmed receipt/, 'ack');
  const unit = await ev(a, (c, uid) => getUnits(c).find(u => u.toUid === uid), P, ana);
  await ev(t, uid => { openTeacherReport('problem', myReleases[0].id, uid); document.getElementById('trNote').value = 'Lamp is dim'; sendTeacherReport(); }, unit.id);
  await waitNotif(a, /Problem reported by Ana Reyes/, 'problem');
  list = await notifs(a);
  const prob = list.find(n => /Problem/.test(n.title));
  check(/Needs repair/.test(prob.body) && prob.body.includes(unit.no), `problem: ${prob.body}`);
  const ack = list.find(n => /confirmed receipt/.test(n.title));
  check(ack && /ICS/.test(ack.body), `receipt: ${ack && ack.body}`);
  await ev(a, id => openNotif(id), ack.id);
  await sleep(300);
  check(await ev(a, uid => activeMainView === 'TEACHERS' && teachersSel === uid, ana), 'receipt → Teachers, Ana’s page');
  await ev(a, id => openNotif(id), prob.id);
  await sleep(300);
  check(await ev(a, () => activeMainView === 'REQUESTS' && /From teachers/.test(document.getElementById('reqViewBody').innerText)), 'problem → From teachers inbox');
  check((await notifs(t)).every(n => !/Problem|confirmed/.test(n.title)), 'teacher not notified of her own reports');

  out('8 custodian answers → teacher is told');
  await until(a, () => openTeacherReports().length === 1, 'report in inbox', 8000);
  await ev(a, () => resolveTeacherReport(openTeacherReports()[0].id, 'repair'));
  await waitNotif(t, /The custodian answered your report/, 'answer');
  await ev(t, uid => { openTeacherReport('return', myReleases[0].id, uid); sendTeacherReport(); }, unit.id);
  await waitNotif(a, /Ana Reyes wants to return an item/, 'return');
  await until(a, () => openTeacherReports().some(x => x.kind === 'return'), 'return in inbox', 8000);
  await ev(a, () => acceptTeacherReturn(openTeacherReports().find(x => x.kind === 'return').id));
  await waitNotif(t, /Return accepted/, 'return accepted');
  const ret = (await notifs(t)).find(n => /Return accepted/.test(n.title));
  check(/off your list/.test(ret.body), `return accepted: ${ret.body}`);
  check((await notifs(a)).length === before + 3, `custodian got exactly 3 more (receipt, problem, return)`);

  out('9 walk-in request by the custodian: no notification');
  const n0 = (await notifs(a)).length;
  await ev(a, () => { openRequestForm(); rfName.value = 'Pedro Santos'; rfSearch.value = 'Folder'; addReqLine(); sendRequest(); });
  await until(a, () => reqList.some(r => r.name === 'Pedro Santos' && !r.sending), 'walk-in', 8000);
  await sleep(1200);
  check((await notifs(a)).length === n0, 'nothing for a request the custodian typed in');

  out('10 reload: nothing repeats; changes while closed show up on the next open');
  const tBefore = await notifs(t);
  await t.reload({ waitUntil: 'networkidle0' });
  await until(t, () => cloud.user && myReleases && notifScope() && loadNotifs().primed.reports, 'teacher back', 9000);
  await sleep(1500);
  const tAfter = await notifs(t);
  check(tAfter.length === tBefore.length && tAfter[0].id === tBefore[0].id, `no repeats after reload (${tAfter.length})`);
  check((await bell(t)).count === String(tAfter.filter(n => !n.read).length), 'unread count kept');
  check(await ev(t, () => document.title === BASE_TITLE), 'title bar is for app updates only: no unread count in the window title');
  // The teacher sends one more request from the same phone, then closes the app.
  await t.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await until(t, () => cloud.user && notifScope() && loadNotifs().primed.requests, 'teacher reopened', 9000);
  await teacherRequest(t, 'Glue stick');
  await until(a, () => reqList.some(r => reqLinesOf(r)[0].desc === 'Glue stick' && r.status === 'pending' && !r.sending), 'glue', 9000);
  await sleep(1500);
  await t.goto('about:blank');
  await ev(a, () => { openReview(reqList.find(r => reqLinesOf(r)[0].desc === 'Glue stick').id); approveRequest(); });
  await waitNode(() => backend.docs('schools/').some(d => /\/requests\//.test(d.path) && (d.data || d).status === 'approved' && (d.data || d).lines[0].desc === 'Glue stick'), 'glue approved');
  await t.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await waitNotif(t, /approved Glue stick/, 'caught up');
  check((await notifs(t)).some(n => /approved/.test(n.title) && /Glue stick/.test(n.body)), 'approved while the app was closed → shown on the next open');

  out('11 phone notifications: turn on / off from the sheet');
  await ev(t, () => { notifPrefs.system = false; openNotifPanel(); });
  let tp = await ev(t, () => document.getElementById('notifPanel').innerText);
  check(/Get these on your phone too/.test(tp), 'teacher sheet offers “Turn on”');
  await t.click('#notifTurnOn');
  await sleep(300);
  tp = await ev(t, () => document.getElementById('notifPanel').innerText);
  check(/Phone notifications are on/.test(tp) && await ev(t, () => JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY)).system === true), 'turned on (permission granted) and remembered');
  await t.screenshot({ path: '/tmp/e2e_n_teacher_panel.png' });
  await ev(t, () => markAllNotifsRead());
  check((await bell(t)).count === 0 && (await notifs(t)).every(n => n.read), 'Mark all read');
  await ev(t, () => closeNotifPanel());

  out('12 home-screen shortcuts and notification links');
  await a.goto(BASE_URL + '?go=requests', { waitUntil: 'networkidle0' });
  await until(a, () => activeMainView === 'REQUESTS', 'shortcut requests', 5000);
  check(await ev(a, () => location.search === ''), 'custodian ?go=requests → Supply requests (address cleaned)');
  await a.goto(BASE_URL + '?go=items', { waitUntil: 'networkidle0' });
  await until(a, () => activeMainView === 'ITEMS', 'shortcut items', 5000);
  check(true, 'custodian ?go=items → Inventory');
  await t.goto(BASE_URL + '?go=items', { waitUntil: 'networkidle0' });
  await until(t, () => activeMainView === 'REQUESTER' && teacherTab === 'items', 'teacher shortcut', 5000);
  check(true, 'teacher ?go=items → her My items');
  const lastA = (await notifs(a))[0];
  await ev(a, id => { const st = loadNotifs(); st.items.find(n => n.id === id).read = false; saveNotifs(); }, lastA.id);
  await a.goto(BASE_URL + '?notif=' + lastA.id, { waitUntil: 'networkidle0' });
  await until(a, id => notifScope() && loadNotifs().items.find(n => n.id === id).read, 'opened from link', 8000, lastA.id);
  check(true, 'opened with ?notif=<id> (app was closed) → marked read and navigated');

  out('13 install as an app');
  await ev(a, () => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__prompted = (window.__prompted || 0) + 1; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  check(await ev(a, () => !document.getElementById('installBar').classList.contains('hidden')), 'install bar shown when Chrome offers it');
  check(await ev(a, () => document.getElementById('moreInstallItem').style.display !== 'none'), '“Install app on this phone” in More');
  await a.screenshot({ path: '/tmp/e2e_n_install.png' });
  await a.click('#installBtn');
  await sleep(200);
  check(await ev(a, () => window.__prompted) === 1, 'Install opens Chrome’s install prompt');
  await ev(a, () => window.dispatchEvent(new Event('appinstalled')));
  check(await ev(a, () => document.getElementById('installBar').classList.contains('hidden') && document.getElementById('moreInstallItem').style.display === 'none'), 'hidden after installing');
  await ev(a, () => { const e = new Event('beforeinstallprompt'); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await ev(a, () => dismissInstall());
  check(await ev(a, () => document.getElementById('installBar').classList.contains('hidden')), '“Not now” hides it (for two weeks)');

  out('15 low stock and out of stock (custodian)');
  await ev(a, () => { switchMainView('HOME'); window.__hidden = false; });
  await until(a, () => loadNotifs().primed.stock, 'stock primed', 5000);
  const L = await ev(a, () => { const i = items.find(i => i.type !== 'EQUIPMENT' && i.qty > i.minQty + 2 && i.minQty > 0); return { code: i.code, name: i.name, qty: i.qty, min: i.minQty }; });
  let n15 = (await notifs(a)).length;
  await ev(a, c => adjustQty(c, -1), L.code);
  await sleep(1600);
  check((await notifs(a)).length === n15, `still above the alert (${L.qty - 1} > ${L.min}): nothing`);
  // tapping − several times to the alert level and below → one notification
  await ev(a, (c, n) => { for (let k = 0; k < n; k++) adjustQty(c, -1); }, L.code, L.qty - 1 - L.min + 1);
  await waitNotif(a, new RegExp('Low stock: ' + L.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'low stock', 5000);
  list = await notifs(a);
  const low = list.find(n => /^Low stock:/.test(n.title));
  check(list.length === n15 + 1 && /left · the alert is set at/.test(low.body), `one notification: “${low.title}” · ${low.body}`);
  await ev(a, c => adjustQty(c, -1), L.code);
  await sleep(1600);
  check((await notifs(a)).length === n15 + 1, 'lower but still not out: no repeat');
  await ev(a, c => setExactQty(c, 0), L.code);
  await waitNotif(a, /Out of stock:/, 'out of stock', 5000);
  check((await notifs(a)).filter(n => /^Out of stock:/.test(n.title)).length === 1, 'running out → “Out of stock”');
  await ev(a, id => openNotif(id), (await notifs(a)).find(n => /^Low stock:/.test(n.title)).id);
  await sleep(300);
  check(await ev(a, () => activeMainView === 'ITEMS' && ledgerFilter === 'LOW'), 'tap → Inventory, Low stock filter');
  // restocked, then down again → told again; a brand-new item stocked low is not announced
  await ev(a, (c, q) => setExactQty(c, q), L.code, L.qty);
  await sleep(1600);
  n15 = (await notifs(a)).length;
  const fresh = await ev(a, () => { const i = items.find(i => i.qty === 0 && i.minQty > 1 && i.type !== 'EQUIPMENT'); setExactQty(i.code, 1); return i.code; });
  await sleep(1600);
  check((await notifs(a)).length === n15, 'an item first stocked below its alert: no notification');
  await ev(a, () => { notifPrefs.lowStock = false; });
  await ev(a, (c, m) => setExactQty(c, m), L.code, L.min);
  await sleep(1600);
  check((await notifs(a)).length === n15, 'switched off: no low-stock notification');
  await ev(a, () => { notifPrefs.lowStock = true; });
  await ev(a, c => setExactQty(c, 0), fresh);
  await sleep(1600);

  out('16 reminders to confirm received items');
  const t2 = await openPhone('teacher-ben', backend);
  await instrument(t2);
  const ben = await joinAsTeacher(t2, sid, 'Ben Cruz', 'Teacher I', 'Grade 4');
  await until(t2, () => !!notifScope() && loadNotifs().primed.releases, 'ben primed', 8000);
  await waitNotif(a, /Ben Cruz joined your school/, 'ben joined');
  const S = await ev(a, () => items.find(i => i.type !== 'EQUIPMENT' && i.qty > 5).code);
  await release(a, ben, [{ code: S, qty: 1 }]);
  await waitNotif(t2, /New items released to you/, 'ben release');
  await until(t2, () => myRelLoaded && tRepLoaded && myReleases.length === 1, 'ben loaded', 8000);
  await until(a, () => releasesLoaded && tRepLoaded && releaseList.some(r => r.teacherName === 'Ben Cruz'), 'custodian loaded', 8000);
  const day = 864e5;
  const tn = async (p, ms) => { await ev(p, ms => notifReminders(Date.now() + ms), ms); await sleep(400); return notifs(p); };
  let bl = await tn(t2, 1.5 * day);
  check(!bl.some(n => /Reminder/.test(n.title)), 'teacher: nothing before 2 days');
  bl = await tn(t2, 2.1 * day);
  const rem = bl.find(n => /^Reminder: did you receive RIS/.test(n.title));
  check(!!rem && /released 2 days ago · tap Received/.test(rem.body), `teacher after 2 days: “${rem && rem.title}” · ${rem && rem.body}`);
  bl = await tn(t2, 3 * day);
  check(bl.filter(n => /Reminder/.test(n.title)).length === 1, 'no repeat the next day');
  bl = await tn(t2, 7.2 * day);
  check(bl.filter(n => /Reminder/.test(n.title)).length === 2, 'reminded once more after 7 days');
  await ev(t2, id => openNotif(id), rem.id);
  await sleep(300);
  check(await ev(t2, () => activeMainView === 'REQUESTER' && teacherTab === 'items'), 'tap → My items (Received button)');
  let al = await tn(a, 2 * day);
  check(!al.some(n => /not confirmed/.test(n.title)), 'custodian: nothing before 3 days');
  al = await tn(a, 3.2 * day);
  const cr = al.find(n => /Ben Cruz has not confirmed RIS/.test(n.title));
  check(!!cr && /Released 3 days ago/.test(cr.body) && cr.go === 'teachers', `custodian after 3 days: “${cr && cr.title}” · ${cr && cr.body}`);
  check(!al.some(n => /Ana Reyes has not confirmed/.test(n.title)), 'Ana already tapped Received: no reminder about her');
  al = await tn(a, 9 * day);
  check(al.filter(n => /not confirmed/.test(n.title)).length === 1, 'custodian reminded only once');
  // Received tapped → no more reminders; very old releases are left alone
  await ev(t2, () => ackRelease(myReleases[0].id));
  await until(t2, () => tReports.some(x => x.kind === 'received'), 'acked', 8000);
  await ev(t2, () => { delete loadNotifs().seen['rm:' + myReleases[0].id]; });
  bl = await tn(t2, 8 * day);
  check(bl.filter(n => /Reminder/.test(n.title)).length === 2, 'after Received: no more reminders');
  await ev(a, () => { releaseList.forEach(r => { delete loadNotifs().seen['rm:' + r.id]; }); });
  al = await tn(a, 40 * day);
  check(al.filter(n => /not confirmed/.test(n.title)).length === 1, 'releases older than 30 days: no reminder');
  // the switches in the sheet
  await ev(a, () => openNotifPanel());
  const sws = await ev(a, () => [...document.querySelectorAll('[data-notif-pref]')].map(b => b.getAttribute('aria-label') + ':' + b.getAttribute('aria-checked')));
  check(sws.join() === 'Low stock:true,Unconfirmed releases:true', `custodian sheet: ${sws.join(', ')}`);
  await a.click('[data-notif-pref="lowStock"]');
  check(await ev(a, () => notifPrefs.lowStock === false && JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY)).lowStock === false && document.querySelector('[data-notif-pref="lowStock"]').getAttribute('aria-checked') === 'false'), 'Low stock switch turns off (and is saved)');
  await a.click('[data-notif-pref="lowStock"]');
  await a.screenshot({ path: '/tmp/e2e_n_prefs.png' });
  await ev(a, () => closeNotifPanel());
  await ev(t2, () => openNotifPanel());
  check((await ev(t2, () => [...document.querySelectorAll('[data-notif-pref]')].map(b => b.getAttribute('aria-label')))).join() === 'Reminders to tap Received', 'teacher sheet: reminders switch only');
  await ev(t2, () => { closeNotifPanel(); setNotifPref('reminders', false); delete loadNotifs().seen['rm:' + myReleases[0].id]; myReleases[0].id += '-x'; });
  bl = await tn(t2, 3 * day);
  check(bl.filter(n => /Reminder/.test(n.title)).length === 2, 'teacher reminders switched off: none');

  out('14 manifest and service worker');
  const m = JSON.parse(fs.readFileSync(new URL('../../manifest.webmanifest', import.meta.url)));
  check(m.theme_color === '#122e76' && (await ev(a, () => document.querySelector('meta[name=theme-color]').content)) === '#122e76', 'navy theme colour (manifest + page)');
  check(m.shortcuts.length === 4 && m.shortcuts.every(s => s.url.startsWith('./?go=') && fs.existsSync(new URL('../../' + s.icons[0].src, import.meta.url))), '4 shortcuts with icons');
  check(m.screenshots.some(s => s.form_factor === 'wide') && m.screenshots.some(s => s.form_factor === 'narrow') &&
    m.screenshots.every(s => fs.existsSync(new URL('../../' + s.src, import.meta.url))), 'screenshots for phone and tablet exist');
  const sw = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  check(/notificationclick/.test(sw) && /open-notification/.test(sw) && !/screenshots/.test(sw.split('PRECACHE_URLS')[1].split('];')[0]), 'sw.js handles notification taps; screenshots not precached');
} catch (e) {
  check(false, 'unexpected error: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('notifications');
}
