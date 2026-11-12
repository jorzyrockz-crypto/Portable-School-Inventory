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
