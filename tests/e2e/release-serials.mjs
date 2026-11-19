// Release to teacher: useful life box per equipment line, and serial numbers required for
// items that have them (ICT / audio-visual / electronics, or a unit already has one), with
// "Has serial numbers" to turn it off (remembered per item). Phone layout.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, ev, sleep, until, closeAll, summary, errors } from './lib/harness.mjs';
import { custodian, teacher } from './lib/school-setup.mjs';

const LAPTOP = '43211503-LAP001', DESKTOP = '43211507-DSK001', CHAIR = '56101504-CM-B01';
const backend = createBackend();
const releasesOf = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/releases/`)).map(([, v]) => v);
const type = async (page, sel, text) => { await page.focus(sel); await page.$eval(sel, el => el.select()); await page.keyboard.press('Backspace'); await page.type(sel, text); };

try {
  const { page: a, sid } = await custodian(backend, { width: 390, height: 844 });
  const { uid: ana } = await teacher(backend, sid, 'Ana Reyes');
  await until(a, () => memberList.some(m => m.name === 'Ana Reyes'), 'Ana on the list', 8000);

  out('the Release form: useful life, Has serial numbers, a serial box per unit');
  await ev(a, (uid, l, c) => openRelease({ teacherUid: uid, purpose: 'Grade 4 classroom', lines: [{ code: l, qty: 2 }, { code: c, qty: 1 }] }), ana, LAPTOP, CHAIR);
  await until(a, () => !!document.querySelector('[data-relsn]'), 'serial boxes');
  const form = await ev(a, (l, c) => ({
    lifeL: !!document.querySelector(`[data-rellife="${l}"]`), lifeC: !!document.querySelector(`[data-rellife="${c}"]`),
    lifePh: document.querySelector(`[data-rellife="${l}"]`).placeholder,
    snL: document.querySelector(`[data-relhassn="${l}"]`).checked, snC: document.querySelector(`[data-relhassn="${c}"]`).checked,
    boxesL: document.querySelectorAll(`[data-relsn^="${l}:"]`).length, boxesC: document.querySelectorAll(`[data-relsn^="${c}:"]`).length,
    hint: document.querySelector(`[data-relsnhint="${l}"]`).textContent
  }), LAPTOP, CHAIR);
  check(form.lifeL && form.lifeC && /5 years/.test(form.lifePh), `each equipment line has a Useful life box (hint “${form.lifePh}”)`);
  check(form.snL && !form.snC, 'laptop: Has serial numbers ticked (ICT); monobloc chair: not ticked');
  check(form.boxesL === 2 && form.boxesC === 0, 'two serial boxes for the two laptops, none for the chair');
  check(/2 serial numbers still to type/.test(form.hint), `hint: “${form.hint.trim()}”`);

  out('Release is stopped until each unit has a serial number');
  a.dialogs.length = 0;
  await a.click('#relSaveBtn');
  await sleep(400);
  check(a.dialogs.some(d => /LAPTOP.*2 serial numbers still to type/i.test(d)), `told to type them (${a.dialogs.at(-1)})`);
  check(await ev(a, () => !releaseDone) && releasesOf(sid).length === 0, 'nothing released');
  const boxes = await ev(a, l => [...document.querySelectorAll(`[data-relsn^="${l}:"]`)].map(x => x.dataset.relsn), LAPTOP);
  await type(a, `[data-relsn="${boxes[0]}"]`, 'PF3K2A91');
  await type(a, `[data-relsn="${boxes[1]}"]`, 'pf3k2a91');
  a.dialogs.length = 0;
  await a.click('#relSaveBtn');
  await sleep(400);
  check(a.dialogs.some(d => /typed twice/.test(d)) && await ev(a, () => !releaseDone), 'the same serial number twice is caught');
  await type(a, `[data-relsn="${boxes[1]}"]`, 'PF3K2B07');
  check(/all typed/.test(await ev(a, l => document.querySelector(`[data-relsnhint="${l}"]`).textContent, LAPTOP)), 'hint turns to “all typed”');
  await type(a, `[data-rellife="${LAPTOP}"]`, '7');
  await a.screenshot({ path: '/tmp/rel_sn.png' });
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');

  out('saved on the units, the release and the ICS');
  const units = await ev(a, l => getUnits(l).filter(u => u.toUid).map(u => ({ s: u.serial, life: u.life })), LAPTOP);
  check(units.length === 2 && units.map(u => u.s).sort().join() === 'PF3K2A91,PF3K2B07', `serial numbers saved on the units (${units.map(u => u.s)})`);
  check(units.every(u => u.life === '7 years'), 'useful life “7” saved as “7 years” on both');
  check(await ev(a, (l, c) => userState[l].serials === true && userState[c].serials === false, LAPTOP, CHAIR), 'the choice is remembered per item');
  const ics = releasesOf(sid).find(r => r.kind === 'ICS' && r.lines.some(l => l.code === LAPTOP));
  const lapLine = ics && ics.lines.find(l => l.code === LAPTOP);
  check(lapLine && lapLine.units.every(u => u.serial && u.life === '7 years'), 'the release in the cloud carries serial and useful life (prints on other phones)');
  const html = await ev(a, () => icsPrintHTML(releaseDone.docs.find(d => d.kind === 'ICS' && d.lines.some(l => /LAPTOP/.test(l.desc)))));
  check(/S\/N: PF3K2A91, PF3K2B07/.test(html) && />7 years</.test(html), 'the ICS shows S/N and Estimated Useful Life 7 years');
  await ev(a, () => closeRelease());

  out('a serial number already on another unit');
  await ev(a, (uid, l) => openRelease({ teacherUid: uid, lines: [{ code: l, qty: 1 }] }), ana, LAPTOP);
  await until(a, () => !!document.querySelector('[data-relsn]'), 'serial box');
  await type(a, '[data-relsn]', 'PF3K2A91');
  a.dialogs.length = 0;
  await a.click('#relSaveBtn');
  await sleep(400);
  check(a.dialogs.some(d => /already on another unit/.test(d)) && await ev(a, () => !releaseDone), 'refused: already on another unit');
  await ev(a, () => closeRelease());

  out('an item without serial numbers: untick, remembered next time');
  await ev(a, (uid, d) => openRelease({ teacherUid: uid, lines: [{ code: d, qty: 1 }] }), ana, DESKTOP);
  await until(a, () => !!document.querySelector('[data-relsn]'), 'serial box');
  await a.click(`[data-relhassn="${DESKTOP}"]`);
  await until(a, () => !document.querySelector('[data-relsn]'), 'boxes gone');
  check(true, 'unticking hides the serial boxes');
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released without serials');
  check(await ev(a, d => userState[d].serials === false, DESKTOP), 'released; “no serial numbers” remembered for the desktop');
  await ev(a, () => closeRelease());
  await ev(a, (uid, d) => openRelease({ teacherUid: uid, lines: [{ code: d, qty: 1 }] }), ana, DESKTOP);
  await sleep(300);
  check(await ev(a, d => !document.querySelector(`[data-relhassn="${d}"]`).checked && !document.querySelector('[data-relsn]'), DESKTOP), 'next release of the desktop starts unticked');
  await ev(a, () => closeRelease());

  out('a unit that already has a serial number turns it on for any item');
  await ev(a, c => { const u = getUnits(c).find(x => !x.to && !x.toUid) || null; if (u) { u.serial = 'CH-001'; } else { userState[c].units = [...getUnits(c), { id: newUnitId(), no: 'X-1', serial: 'CH-001', loc: '', to: '', cond: 'S', seen: null, printed: null, added: Date.now() }]; } delete userState[c].serials; saveState(); }, CHAIR);
  check(await ev(a, c => itemHasSerials(items.find(i => i.code === c)), CHAIR), 'chair with a serial on one unit: Has serial numbers on');
  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('release-serials');
}
