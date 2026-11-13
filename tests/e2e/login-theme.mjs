// Sign-in screen (required before using the app), the school art behind it and behind the
// top of Home, and light / dark mode (follows the phone, or System / Light / Dark in More).
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const SHOTS = process.env.SHOTS || '/tmp';
const gated = page => ev(page, () => document.documentElement.classList.contains('gated'));
const isDark = page => ev(page, () => document.documentElement.classList.contains('dark'));
const bgOf = (page, sel) => ev(page, s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
const gateStepNow = page => ev(page, () => document.getElementById('loginGate').dataset.step);

async function custodianSignIn(page, { create = false } = {}) {
  await ev(page, () => gateGo('custodian'));
  await until(page, () => !!document.getElementById('rcEmail'), 'sign-in form');
  await ev(page, () => { rcSchool.value = 'San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await page.click(create ? '#rcCreate' : '#rcSignIn');
  await until(page, () => reqRole && reqRole.role === 'custodian' && !document.documentElement.classList.contains('gated'), 'signed in');
  await ev(page, () => closeInvite());
}

try {
  out('1 a new phone opens on the sign-in screen');
  const a = await openPhone('custodian', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await gated(a), 'sign-in screen is up');
  check(await gateStepNow(a) === 'welcome', 'welcome step');
  check(await ev(a, () => document.querySelectorAll('[data-gate-role]').length) === 2, 'two choices: property custodian, teacher');
  check(await ev(a, () => document.querySelector('body > header').inert && document.getElementById('tabBar').inert), 'the app behind it cannot be reached');
  check(await ev(a, () => getComputedStyle(document.querySelector('.gate-art')).backgroundImage.includes('login-portrait.webp')), 'portrait art on a phone');
  check(await ev(a, () => document.getElementById('appToast') && true), 'page loaded');
  await a.screenshot({ path: `${SHOTS}/login-portrait-light.png` });

  out('2 inventory from before sign-in was required is kept');
  await ev(a, () => loadSampleInventory());
  await sleep(300);
  const before = await ev(a, () => items.filter(i => i.qty > 0).length);
  await ev(a, () => { document.getElementById('loginGate').dataset.step = ''; renderLoginGate(); });
  check(await ev(a, () => /This phone has \d+ items/.test(document.getElementById('gatePanel').innerText)), 'welcome card says the items on this phone are safe');

  out('3 property custodian signs in → Home with the art strip');
  await ev(a, () => gateGo('custodian'));
  check(await gateStepNow(a) === 'custodian', 'custodian step');
  check(await ev(a, () => document.querySelectorAll('#rcEmail').length) === 1, 'one sign-in form on the page');
  await a.screenshot({ path: `${SHOTS}/login-custodian-form.png` });
  await ev(a, () => gateGo('welcome'));
  await custodianSignIn(a, { create: true });
  check(!(await gated(a)), 'sign-in screen gone');
  check(await ev(a, () => activeMainView) === 'HOME', 'lands on Home');
  check(await ev(a, () => document.body.classList.contains('page-art')), 'art strip behind the top of Home');
  check(await ev(a, () => !document.querySelector('body > header').inert), 'app usable again');
  await until(a, n => items.filter(i => i.qty > 0).length === n, 'items still there', 5000, before);
  check(await ev(a, () => items.filter(i => i.qty > 0).length) === before, `the ${before} items on this phone are still there`);
  await a.screenshot({ path: `${SHOTS}/home-light.png` });
  await ev(a, () => switchMainView('ITEMS'));
  check(await ev(a, () => !document.body.classList.contains('page-art')), 'lists stay plain (no art on Inventory)');
  await ev(a, () => switchMainView('HOME'));

  out('4 opening the app again goes straight in');
  await a.reload({ waitUntil: 'domcontentloaded' });
  check(!(await gated(a)), 'no sign-in screen on the next launch (not even for a moment)');
  await a.waitForNetworkIdle();
  check(!(await gated(a)), 'still in after the cloud reconnects');

  out('5 light / dark: More → Appearance');
  check(!(await isDark(a)), 'light by default (phone is in light mode)');
  await ev(a, () => openMoreMenu());
  check(await ev(a, () => document.querySelectorAll('#moreTheme [data-theme-opt]').length) === 3, 'System / Light / Dark switch in More');
  check(await ev(a, () => document.querySelector('#moreTheme [data-theme-opt="system"]').getAttribute('aria-checked')) === 'true', 'System is selected');
  check(await ev(a, () => /rosa@deped\.gov\.ph/.test(document.getElementById('moreAccount').innerText)), 'More shows who is signed in');
  await a.click('#moreTheme [data-theme-opt="dark"]');
  check(await isDark(a), 'Dark turns dark mode on');
  check(await ev(a, () => localStorage.getItem('custodian_theme_v1')) === 'dark', 'choice saved');
  await a.screenshot({ path: `${SHOTS}/more-dark.png` });
  await ev(a, () => closeMoreMenu());
  check(await bgOf(a, 'body') === 'rgb(11, 18, 32)', 'dark page background');
  check(await bgOf(a, '#homeTiles > button') === 'rgb(18, 26, 43)', 'white cards turn dark navy');
  check(await ev(a, () => getComputedStyle(document.querySelector('#viewHome label[for=homeSearch]')).color) === 'rgb(241, 245, 249)', 'dark text turns light');
  await a.screenshot({ path: `${SHOTS}/home-dark.png` });
  await ev(a, () => switchMainView('ITEMS'));
  await sleep(200);
  await a.screenshot({ path: `${SHOTS}/items-dark.png` });
  await ev(a, () => switchMainView('HOME'));
  await a.emulateMediaType('print');
  check(await bgOf(a, '#homeTiles > button') === 'rgb(255, 255, 255)', 'printing keeps the light look');
  await a.emulateMediaType('screen');
  await a.reload({ waitUntil: 'domcontentloaded' });
  check(await isDark(a), 'dark choice survives a restart (applied before first paint)');
  await a.waitForNetworkIdle();
  await ev(a, () => setTheme('system'));
  check(!(await isDark(a)), 'System follows the phone (light)');
  await a.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await until(a, () => document.documentElement.classList.contains('dark'), 'follows the phone switching to dark');
  check(await isDark(a), 'phone switches to dark → app follows');
  await ev(a, () => setTheme('light'));
  check(!(await isDark(a)), 'Light wins over a dark phone');
  await ev(a, () => setTheme('system'));
  await a.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  out('5b background picture: More → Appearance, per tab');
  await ev(a, () => { switchMainView('HOME'); openMoreMenu(); });
  const artOpts = () => ev(a, () => Object.fromEntries([...document.querySelectorAll('#moreArt [data-art-opt]')].map(b => [b.dataset.artOpt, b.getAttribute('aria-checked') === 'true'])));
  check(JSON.stringify(await artOpts(a)) === JSON.stringify({ HOME: true, ITEMS: false, CATALOG: false, REPORTS: false }), 'four tick boxes: Home on by default, the others off');
  await a.click('#moreArt [data-art-opt="ITEMS"]');
  await a.click('#moreArt [data-art-opt="CATALOG"]');
  check((await artOpts(a)).ITEMS && (await artOpts(a)).CATALOG, 'tapping Inventory and Catalog ticks them');
  await a.screenshot({ path: `${SHOTS}/more-background.png` });
  await ev(a, () => closeMoreMenu());
  await ev(a, () => switchMainView('ITEMS'));
  check(await ev(a, () => document.body.classList.contains('page-art')), 'the picture now shows on Inventory');
  const card = await ev(a, () => { const b = document.getElementById('masterLedgerSection').getBoundingClientRect(); const h = document.querySelector('body > header').getBoundingClientRect(); return { left: b.left, gap: b.top - h.bottom, r: getComputedStyle(document.getElementById('masterLedgerSection')).borderTopLeftRadius }; });
  check(card.left >= 15 && card.gap >= 15 && card.r === '16px', `on a phone the Inventory card floats so the picture shows around it (left ${card.left}, gap ${Math.round(card.gap)})`);
  await a.screenshot({ path: `${SHOTS}/items-with-picture.png` });
  await ev(a, () => switchMainView('REPORTS'));
  check(await ev(a, () => !document.body.classList.contains('page-art')), 'Reports stays plain (not ticked)');
  await ev(a, () => { openMoreMenu(); });
  await a.click('#moreArt [data-art-opt="HOME"]');
  await ev(a, () => { closeMoreMenu(); switchMainView('HOME'); });
  check(await ev(a, () => !document.body.classList.contains('page-art')), 'unticking Home removes the picture there');
  await a.reload({ waitUntil: 'networkidle0' });
  await ev(a, () => switchMainView('CATALOG'));
  check(await ev(a, () => document.body.classList.contains('page-art') && (l => l.includes('ITEMS') && l.includes('CATALOG') && !l.includes('HOME'))(JSON.parse(localStorage.getItem('custodian_page_art_v1')))), 'the choice is kept after a restart');
  await ev(a, () => { localStorage.removeItem('custodian_page_art_v1'); switchMainView('ITEMS'); });
  check(await ev(a, () => !document.body.classList.contains('page-art')), 'back to the default: Inventory plain again');
  await ev(a, () => switchMainView('HOME'));

  out('6 sign out → back to the sign-in screen, same person can sign in again');
  // The app's own dialog, tapped for real (no browser "… says" box).
  const dlgOpen = () => ev(a, () => !document.getElementById('appDialog').classList.contains('hidden'));
  await ev(a, () => { window.__dialogUI = true; openMoreMenu(); });
  await a.click('#moreSignOut');
  await until(a, () => !document.getElementById('appDialog').classList.contains('hidden'), 'sign-out dialog');
  const dlg = await ev(a, () => ({ title: appDialogTitle.innerText, msg: appDialogMsg.innerText, ok: appDialogOk.innerText, cancel: appDialogCancel.innerText,
    z: +getComputedStyle(document.getElementById('appDialog')).zIndex, focus: document.activeElement && document.activeElement.id }));
  check(dlg.title === 'Sign out of CustodianPro?' && /stays on this phone/.test(dlg.msg) && dlg.ok === 'Sign out' && dlg.cancel === 'Cancel', 'in-app sign-out dialog: title, explanation, Sign out / Cancel');
  check(dlg.z > 70, 'dialog sits above sheets and toasts');
  await sleep(250);
  check(await ev(a, () => document.activeElement.id) === 'appDialogOk', 'Sign out button has focus (keyboard: Enter)');
  await a.screenshot({ path: `${SHOTS}/dialog-signout.png` });
  await a.mouse.click(8, 8); // outside the card
  await sleep(150);
  check(await dlgOpen(), 'tapping outside does not close it');
  await a.click('#appDialogCancel');
  await sleep(150);
  check(!(await dlgOpen()) && !(await gated(a)) && await ev(a, () => !!cloud.user), 'Cancel: still signed in');
  await ev(a, () => { setTheme('dark'); openMoreMenu(); });
  await a.click('#moreSignOut');
  await until(a, () => !document.getElementById('appDialog').classList.contains('hidden'), 'dialog again');
  await sleep(250);
  check(await ev(a, () => getComputedStyle(appDialogCard).backgroundColor) !== 'rgb(255, 255, 255)', 'dark dialog in dark mode');
  await a.screenshot({ path: `${SHOTS}/dialog-signout-dark.png` });
  await a.keyboard.press('Escape');
  await sleep(150);
  check(!(await dlgOpen()) && !(await gated(a)), 'Escape cancels');
  // Prompt with a field, and two at once wait their turn.
  const answers = await ev(a, async () => {
    const p1 = appPrompt('Teachers will see this.', 'San Jose NHS', { title: 'Name of your school' });
    const p2 = appConfirm('Second question', { title: 'Second?' });
    await new Promise(r => setTimeout(r, 120));
    const first = appDialogTitle.innerText, val = appDialogInput.value;
    appDialogInput.value = 'San Jose National High School';
    appDialogInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const r1 = await p1;
    await new Promise(r => setTimeout(r, 60));
    const second = appDialogTitle.innerText;
    closeDialog(false);
    return { first, val, r1, second, r2: await p2, hidden: document.getElementById('appDialog').classList.contains('hidden') };
  });
  check(answers.first === 'Name of your school' && answers.val === 'San Jose NHS' && answers.r1 === 'San Jose National High School', 'prompt: filled-in value, Enter answers');
  check(answers.second === 'Second?' && answers.r2 === false && answers.hidden, 'a second dialog waits for the first, then closes');
  await ev(a, () => { setTheme('system'); openMoreMenu(); });
  await a.click('#moreSignOut');
  await until(a, () => !document.getElementById('appDialog').classList.contains('hidden'), 'dialog for real');
  await a.click('#appDialogOk');
  await ev(a, () => { window.__dialogUI = false; });
  await until(a, () => document.documentElement.classList.contains('gated'), 'signed out');
  check(await gated(a), 'sign-in screen after signing out');
  check(await gateStepNow(a) === 'custodian', 'opens on the custodian form');
  check(await ev(a, () => document.getElementById('rcEmail').value) === 'rosa@deped.gov.ph', 'email filled in');
  check(await ev(a, () => activeMainView) === 'HOME', 'Home is behind it');
  await custodianSignIn(a);
  check(await ev(a, () => items.filter(i => i.qty > 0).length) === before, 'inventory intact after signing in again');
  const schoolId = await ev(a, () => reqRole.schoolId);

  out('7 custodian whose sign-in ended');
  await ev(a, () => { cloud.user = null; renderLoginGate(); });
  check(await gated(a), 'sign-in screen when the account session ended');
  check(await ev(a, () => /Sign in again/.test(document.getElementById('gatePanel').innerText) && /Start over/.test(document.getElementById('gatePanel').innerText)), 'asks to sign in again, or start over');
  await custodianSignIn(a);
  check(!(await gated(a)), 'back in');

  out('8 teacher: invite code on the sign-in screen');
  const t = await openPhone('teacher', backend);
  await t.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await gated(t), 'teacher phone opens on the sign-in screen');
  await t.click('[data-gate-role="teacher"]');
  check(await gateStepNow(t) === 'teacher', 'teacher step');
  await t.type('#gateCode', 'not a code!');
  await t.click('#gateJoinBtn');
  check(await ev(t, () => !document.getElementById('gateCodeError').classList.contains('hidden')), 'a wrong code is explained');
  await t.screenshot({ path: `${SHOTS}/login-teacher.png` });
  await ev(t, link => { gateCode.value = link; }, `${BASE_URL}#join=${schoolId}`);
  await t.click('#gateJoinBtn');
  await until(t, () => !document.getElementById('joinModal').classList.contains('hidden') && /San Jose/.test(document.getElementById('joinSchool').textContent), 'join sheet for the school');
  check(await ev(t, () => /San Jose/.test(document.getElementById('joinSchool').textContent)), 'pasted invite link opens the join sheet');
  check(await ev(t, () => +getComputedStyle(document.getElementById('joinModal')).zIndex > +getComputedStyle(document.getElementById('loginGate')).zIndex), 'join sheet sits above the sign-in screen');
  await ev(t, () => { joinName.value = 'Ana Reyes'; submitJoin(); });
  check(!(await gated(t)), 'joined → sign-in screen gone');
  check(await ev(t, () => activeMainView) === 'REQUESTER', 'teacher screen');
  check(await ev(t, () => document.querySelectorAll('#rqTheme [data-theme-opt]').length) === 3, 'teachers get the appearance switch too');
  check(await ev(t, () => document.body.classList.contains('page-art') && document.querySelector('#rqArt [data-art-opt="REQUESTER"]').getAttribute('aria-checked') === 'true'), 'teachers: background picture on, with a switch to turn it off');
  await ev(t, () => { const el = document.getElementById('appToast'); el.classList.add('hidden'); el.classList.remove('flex'); }); // the welcome toast fades on its own
  await t.click('#rqArt [data-art-opt="REQUESTER"]');
  check(await ev(t, () => !document.body.classList.contains('page-art')), 'teachers: the switch turns the picture off');
  await t.click('#rqArt [data-art-opt="REQUESTER"]');
  await ev(t, () => setTheme('dark'));
  await t.screenshot({ path: `${SHOTS}/teacher-dark.png`, fullPage: true });
  await ev(t, () => setTheme('system'));
  await ev(t, () => leaveSchool());
  await until(t, () => document.documentElement.classList.contains('gated'), 'left');
  check(await gated(t) && await gateStepNow(t) === 'welcome', 'leaving the school → sign-in screen');

  out('9 invite link opened on a new phone');
  const j = await openPhone('link', backend);
  await j.goto(`${BASE_URL}#join=${schoolId}`, { waitUntil: 'networkidle0' });
  await until(j, () => !document.getElementById('joinModal').classList.contains('hidden'), 'join sheet');
  check(await gated(j) && await gateStepNow(j) === 'teacher', 'teacher step behind the join sheet');
  check(await ev(j, () => !document.getElementById('joinModal').classList.contains('hidden')), 'join sheet open straight away');

  out('9b Anonymous sign-in turned off in Firebase → join with Google');
  const g = await openPhone('google-only', backend);
  await g.evaluateOnNewDocument(() => { window.__anonOff = true; window.__googleAccount = { email: 'mila.santos@gmail.com', name: 'Mila Santos' }; });
  await g.goto(`${BASE_URL}#join=${schoolId}`, { waitUntil: 'networkidle0' });
  await until(g, () => !document.getElementById('joinGoogleOnly').classList.contains('hidden'), 'google-only note', 8000);
  check(await ev(g, () => !document.getElementById('joinGoogleOnly').classList.contains('hidden') && document.getElementById('joinError').classList.contains('hidden')), 'explains: use Continue with Google (no red error)');
  check(await ev(g, () => document.getElementById('joinBtn').disabled && !document.getElementById('joinGoogleBtn').disabled), 'name-only Continue off, Google on');
  check(await ev(g, () => document.getElementById('joinSchool').textContent) === 'Join your school', 'heading: Join your school');
  await g.screenshot({ path: `${SHOTS}/join-google-only.png` });
  await g.click('#joinGoogleBtn');
  await until(g, () => reqRole && reqRole.role === 'teacher', 'joined with Google', 8000);
  check(await ev(g, () => reqRole && reqRole.role === 'teacher' && /San Jose/.test(reqRole.schoolName) && reqRole.email === 'mila.santos@gmail.com'), 'joined the school with Google');
  check(await ev(g, () => reqRole.me.name) === 'Mila Santos', 'name taken from the Google account');
  check(!(await gated(g)), 'sign-in screen gone');
  await g.close();

  out('10 big screens, dark phone');
  const d = await openPhone('desktop', backend, { width: 1280, height: 800 });
  await d.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await d.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await isDark(d), 'dark phone/computer → dark from the start');
  check(await ev(d, () => getComputedStyle(document.querySelector('.gate-art')).backgroundImage.includes('login-landscape-dark.webp')), 'landscape art on a wide screen (night version in dark mode)');
  await d.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await sleep(300);
  check(await ev(d, () => getComputedStyle(document.querySelector('.gate-art')).backgroundImage.includes('login-landscape.webp')), 'day version in light mode');
  await d.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await sleep(300);
  await d.screenshot({ path: `${SHOTS}/login-landscape-dark.png` });
  await d.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await until(d, () => !document.documentElement.classList.contains('dark'), 'light');
  await d.screenshot({ path: `${SHOTS}/login-landscape-light.png` });
  await custodianSignIn(d);
  await ev(d, () => loadSampleInventory());
  await sleep(300);
  await d.screenshot({ path: `${SHOTS}/home-landscape-light.png` });
  await ev(d, () => setTheme('dark'));
  await d.screenshot({ path: `${SHOTS}/home-landscape-dark.png` });
  await ev(d, () => openRequestsView());
  await sleep(300);
  await d.screenshot({ path: `${SHOTS}/requests-landscape-dark.png` });

  const p = await openPhone('dark-phone', backend);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await p.screenshot({ path: `${SHOTS}/login-portrait-dark.png` });

  out('10b explore without an account (sample data, nothing saved)');
  const x = await openPhone('explorer', backend);
  await x.goto(BASE_URL, { waitUntil: 'networkidle0' });
  check(await gated(x), 'sign-in screen first');
  check(await ev(x, () => !!document.getElementById('gateExplore')), 'Explore without an account button on the welcome card');
  await ev(x, () => { localStorage.setItem('custodian_school_info_v1', JSON.stringify({ school: 'Before Explore School' })); localStorage.setItem('custodian_theme_v1', 'light'); });
  const keysBefore = await ev(x, () => Object.keys(localStorage).filter(k => k !== 'custodian_theme_v1').sort().join(','));
  const writesBefore = backend.writes.length;
  await x.click('#gateExplore');
  await until(x, () => !document.documentElement.classList.contains('gated') && !!sampleStore(), 'exploring');
  check(!(await gated(x)), 'app opens without an account');
  check(await ev(x, () => !document.querySelector('body > header').inert), 'app usable');
  check(await ev(x, () => !reqRole && exploring()), 'no role, exploring');
  check(await ev(x, () => !document.getElementById('exploreBar').classList.contains('hidden')), 'Exploring bar with Sign in at the top');
  check(await ev(x, () => !!sampleStore() && items.filter(i => i.qty > 0).length > 5), 'sample data loaded (no confirm)');
  await ev(x, () => openTeachersView());
  await until(x, () => document.querySelectorAll('#tvReviewBox [data-rv-tile]').length > 0, 'sample To review cards');
  check(await ev(x, () => document.querySelectorAll('#tvReviewBox [data-rv-tile]').length) === 3, 'Teachers page shows the sample To review');
  await ev(x, () => openRequestsView());
  check(await ev(x, () => !document.getElementById('rcEmail') && /exploring without an account/i.test(document.getElementById('reqViewBody').innerText)), 'Requests: an explore card instead of a sign-in form');
  await ev(x, () => openMoreMenu());
  check(await ev(x, () => !!document.getElementById('moreExploreEnd')), 'More → Account: Sign in or join a school');
  await ev(x, () => closeMoreMenu());
  await ev(x, () => { localStorage.setItem('custodian_theme_v1', 'dark'); });
  check(backend.writes.length === writesBefore, `nothing written to the cloud while exploring (${backend.writes.length - writesBefore})`);
  await x.reload({ waitUntil: 'networkidle0' });
  check(!(await gated(x)) && await ev(x, () => exploring()), 'still exploring after reopening');
  await Promise.all([x.waitForNavigation({ waitUntil: 'networkidle0' }), x.click('#exploreSignIn')]);
  check(await gated(x), 'Sign in → back to the sign-in screen');
  check(await gateStepNow(x) === 'welcome', 'welcome step');
  check(await ev(x, () => !sampleStore() && !localStorage.getItem('custodian_explore_v1')), 'sample data and explore flag gone');
  check(await ev(x, () => Object.keys(localStorage).filter(k => k !== 'custodian_theme_v1').sort().join(',')) === keysBefore, 'phone storage back as before exploring');
  check(await ev(x, () => JSON.parse(localStorage.getItem('custodian_school_info_v1')).school) === 'Before Explore School', 'school info from before is back');
  check(await ev(x, () => localStorage.getItem('custodian_theme_v1')) === 'dark', 'theme chosen while exploring is kept');
  await x.close();

  out('11 no cloud project → the app stays local-only');
  await ev(p, () => { window.FIREBASE_CONFIG = null; renderLoginGate(); });
  check(!(await gated(p)), 'no sign-in screen without firebase-config.js');

  check(backend.denied.length === 0, `no access-rule refusals (${backend.denied.length})`);
} catch (e) {
  check(false, `crashed: ${e.stack || e}`);
} finally {
  await closeAll();
  summary('login-theme');
}
