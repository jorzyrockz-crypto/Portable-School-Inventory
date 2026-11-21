// School Planning, part D3 (Nov 2026): the printed Monthly Calendar. Everyone who sees the
// calendar can print it: the month, a range or the whole SY, 1 or 2 months per sheet (stacked or
// side by side), on A4, Folio (8.5 × 13 in) or A3, with clay art for the month, a general scene,
// the school's own photo or none; colours, what shows, header and footer. The options and the
// photo and logo stay on the device.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead } from './lib/school-setup.mjs';
import { execFileSync } from 'node:child_process';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const turnOn = page => ev(page, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); });
// SHOTS=1 saves screenshots to /tmp/cpr-*.png (for looking at the screens; not checked)
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: `/tmp/cpr-${name}.png`, fullPage: false }) : null);
const set = (page, k, v) => ev(page, (k, v) => cprSet(k, v), k, v);
const prev = (page, fn, ...a) => ev(page, fn, ...a);
// Write a ppa straight from the AO's page (the AO may)
const addPpa = (page, doc) => ev(page, async d => {
  const F = cloud.sdk;
  await F.setDoc(F.doc(F.collection(cloud.db, 'schools', reqRole.schoolId, 'ppas')), { sy: '2026-2027', status: 'planned', log: [], by: { uid: cloud.user.uid, name: 'Rhea', role: 'ao' }, to: d.from, ...d });
}, doc);

try {
  out('1 a pilot school with its calendar, events and activities');
  const { page: a, sid } = await custodian(backend);
  const { page: t, uid: tUid } = await teacher(backend, sid);
  await turnOn(a); await turnOn(t);
  await ev(t, () => calSync());
  const { page: h } = await schoolHead(backend, a, sid);
  await turnOn(h);
  await ev(h, () => calSync());
  await ev(a, () => { calNav(); openCalendar(); });
  await until(a, () => activeMainView === 'CALENDAR' && !!document.getElementById('calLoadBtn'), 'calendar setup', 8000);
  await ev(a, () => document.getElementById('calLoadBtn').click());
  await waitNode(() => !!backend.store.get(`schools/${sid}/planYears/2026-2027`));
  await addPpa(a, { kind: 'event', title: 'Parent–Teacher Conference', from: '2026-06-19', startTime: '13:00', venue: 'Gym' });
  await addPpa(a, { kind: 'activity', title: 'Reading camp', from: '2026-06-24', who: [{ uid: tUid, name: 'Ana Reyes' }], budget: 0, source: '' });
  await addPpa(a, { kind: 'activity', title: 'Math quiz bee', from: '2026-06-25', who: [{ uid: '', name: 'Pedro Cruz' }], budget: 0, source: '' });
  for (let i = 1; i <= 7; i++) await addPpa(a, { kind: 'event', title: `Club meeting number ${i} with a longer name`, from: '2026-06-17' });
  await until(a, () => calEvents.filter(e => !e.removed).length >= 10, 'AO has the entries', 8000);
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-calendar-print' && r.pilot === 'plan') && wnList().some(r => r.id === '2026-11-calendar-print')), 'What’s new: Print the school calendar (pilot)');

  out('2 the print sheet: June 2026 on A4 landscape');
  await a.bringToFront();
  await ev(a, () => { localStorage.removeItem('cp_calprint_v1'); cpr = null; calMonth = '2026-06'; calPage = 'cal'; calPaint(); });
  check(await ev(a, () => !!document.getElementById('calPrintBtn')), 'AO: Print on the calendar');
  await ev(a, () => document.getElementById('calPrintBtn').click());
  await until(a, () => !!document.querySelector('#cprPreview .cpr-sheet'), 'preview');
  check(await ev(a, () => document.getElementById('calModalBox').classList.contains('cal-wide') && /Sheet 1 of 1 · 1 month/.test(document.getElementById('cprCount').textContent)), 'preview: Sheet 1 of 1 · 1 month');
  check(await prev(a, () => { const m = document.querySelector('#cprPreview [data-cpr-month]'); return m.dataset.cprMonth === '2026-06' && m.querySelectorAll('[data-cpr-day]').length === 30; }), 'June 2026: 30 days');
  check(await prev(a, () => { const cells = [...document.querySelectorAll('#cprPreview .cpr-grid > .cpr-cell')]; return !cells[0].dataset.cprDay && cells[1].dataset.cprDay === '2026-06-01'; }), 'Sunday first: June 1 (a Monday) in the 2nd box');
  check(await prev(a, () => { const d = document.querySelector('#cprPreview [data-cpr-day="2026-06-12"]'); return d.hasAttribute('data-cpr-off') && /Independence Day/.test(d.textContent); }), 'June 12: no classes, “Independence Day” in the box');
  check(await prev(a, () => /1:00 PM Parent–Teacher Conference/.test(document.querySelector('#cprPreview [data-cpr-day="2026-06-19"]').textContent)), 'June 19: the event with its time');
  check(await prev(a, () => !!document.querySelector('#cprPreview [data-cpr-day="2026-06-17"] [data-cpr-more]') && /More this month:.*Club meeting/.test(document.querySelector('#cprPreview [data-cpr-morelist]').textContent)), 'a full box: “+N more”, and the rest under the grid');
  check(await prev(a, () => /assets\/cal-art\/m06\.webp/.test(document.querySelector('#cprPreview .cpr-banner img').getAttribute('src'))), 'this month’s art: the June picture in the banner');
  check(await prev(a, () => /Term 1/.test(document.querySelector('#cprPreview [data-cpr-term]').textContent) && /class days/.test(document.querySelector('#cprPreview [data-cpr-term]').textContent)), 'under the month: Term 1 · N class days');
  check(await prev(a, () => /OQUENDO ELEMENTARY SCHOOL/i.test(document.querySelector('#cprPreview [data-cpr-school]').textContent) && /School ID 644584 · SY 2026–2027/.test(document.querySelector('#cprPreview .cpr-hdr').textContent)), 'header: school name, School ID 644584, SY 2026–2027');
  check(await prev(a, () => !!document.querySelector('#cprPreview [data-cpr-legend]') && /Printed/.test(document.querySelector('#cprPreview .cpr-ft').textContent)), 'footer: legend and printed date');
  await shot(a, 'sheet');
  // the page fits the paper (nothing spills over)
  check(await prev(a, () => { const s = document.querySelector('#cprPreview .cpr-sheet'); return s.scrollHeight <= s.clientHeight + 1; }), 'A4 landscape: the month fits on the page');

  out('3 art, colour and what shows');
  await set(a, 'weekStart', 1);
  check(await prev(a, () => document.querySelector('#cprPreview .cpr-grid > .cpr-cell').dataset.cprDay === '2026-06-01' && /^Mon/.test(document.querySelector('#cprPreview .cpr-dows').textContent)), 'Monday first: June 1 in the 1st box');
  await set(a, 'theme', 'g:grounds');
  check(await prev(a, () => /login-landscape\.webp/.test(document.querySelector('#cprPreview .cpr-banner img').getAttribute('src'))), 'a general scene: School grounds');
  await set(a, 'place', 'page');
  check(await prev(a, () => !document.querySelector('#cprPreview .cpr-banner') && !!document.querySelector('#cprPreview .cpr-wm')), 'behind the grid: a watermark, no banner');
  await set(a, 'theme', 'none');
  check(await prev(a, () => !document.querySelector('#cprPreview img[data-cpr-art]')), 'None: no picture');
  await set(a, 'accent', 'bw');
  check(await prev(a, () => getComputedStyle(document.querySelector('#cprPreview .cpr-dows')).backgroundColor === 'rgb(229, 229, 229)'), 'Black and white: grey day row');
  await ev(a, () => cprShow('holiday', false));
  check(await prev(a, () => !/Independence Day/.test(document.querySelector('#cprPreview [data-cpr-day="2026-06-12"]').textContent)), 'Holidays off: June 12 shows nothing');
  await ev(a, () => cprShow('holiday', true));
  await ev(a, () => { cprSet('venues', true); cprSet('motto', 'Excellence in every learner', true); });
  check(await prev(a, () => /Gym/.test(document.querySelector('#cprPreview [data-cpr-day="2026-06-19"]').textContent) && /Excellence in every learner/.test(document.querySelector('#cprPreview [data-cpr-motto]').textContent)), 'venues and the motto line');
  await ev(a, () => { cprSet('theme', 'auto'); cprSet('place', 'banner'); cprSet('accent', 'teal'); });

  out('4 paper and months per sheet');
  await ev(a, () => { cprSet('range', 'sy'); });
  check(await ev(a, () => /Sheet 1 of 11 · 11 months/.test(document.getElementById('cprCount').textContent)), 'whole SY: 11 sheets (June to April)');
  await set(a, 'per', 2);
  check(await ev(a, () => /Sheet 1 of 6/.test(document.getElementById('cprCount').textContent) && cpr.orient === 'portrait' && document.querySelectorAll('#cprPreview [data-cpr-month]').length === 2), '2 per sheet, stacked: 6 sheets, portrait');
  check(await prev(a, () => { const m = [...document.querySelectorAll('#cprPreview [data-cpr-month]')].map(x => x.getBoundingClientRect()); return m[1].top >= m[0].bottom - 1; }), 'stacked: one month above the other');
  await ev(a, () => { cprGo(5); });
  check(await prev(a, () => document.querySelectorAll('#cprPreview [data-cpr-month]').length === 1 && document.querySelector('#cprPreview [data-cpr-month]').dataset.cprMonth === '2027-04'), 'the last sheet: April only');
  await set(a, 'layout', 'side');
  check(await prev(a, () => { const m = [...document.querySelectorAll('#cprPreview [data-cpr-month]')].map(x => x.getBoundingClientRect()); return cpr.orient === 'landscape' && m.length === 2 && Math.abs(m[0].top - m[1].top) < 2 && m[1].left >= m[0].right - 1; }), 'side by side: landscape, months next to each other');
  await shot(a, 'side');
  check(await prev(a, () => [...document.querySelectorAll('#cprPreview [data-cpr-month]')].every(m => /m0[67]\.webp/.test(m.querySelector('img').getAttribute('src')))), 'each month its own art (June, July)');
  for (const [paper, orient, size] of [['a4', 'landscape', '297mm 210mm'], ['folio', 'portrait', '215.9mm 330.2mm'], ['a3', 'landscape', '420mm 297mm']]) {
    await ev(a, (p, o) => { cprSet('paper', p); cprSet('orient', o); }, paper, orient);
    check(await prev(a, () => { const s = document.querySelector('#cprPreview .cpr-sheet'); return s.scrollHeight <= s.clientHeight + 1; }), `${paper} ${orient}: the sheet fits`);
    await ev(a, () => { window.__printed = 0; cprPrint(); });
    await until(a, () => window.__printed === 1, 'printed', 8000);
    check(await ev(a, sz => document.getElementById('printPrSection').innerHTML.includes(`size: ${sz}`) && document.querySelectorAll('#printPrSection .cpr-sheet').length === 6, size), `${paper} ${orient}: @page ${size}, 6 sheets printed`);
  }
  await ev(a, () => { cprSet('per', 1); cprSet('paper', 'a4'); cprSet('orient', 'landscape'); cprSet('range', 'range'); cprSet('from', '2026-08'); cprSet('to', '2026-10'); });
  check(await ev(a, () => /Sheet 1 of 3 · 3 months/.test(document.getElementById('cprCount').textContent) && document.querySelector('#cprPreview [data-cpr-month]').dataset.cprMonth === '2026-08'), 'From – to: August to October, 3 sheets');
  await ev(a, () => cprSet('range', 'month'));

  out('5 the school’s photo and logo (this device)');
  await a.bringToFront();
  execFileSync('convert', ['-size', '1200x500', 'gradient:#7dd3fc-#fde68a', '/tmp/cpr-photo.png']);
  execFileSync('convert', ['-size', '300x300', 'xc:none', '-fill', '#1d4ed8', '-draw', 'circle 150,150 150,20', '/tmp/cpr-logo.png']);
  await ev(a, () => cprSet('theme', 'photo'));
  await until(a, () => !!document.getElementById('cprPhotoIn'), 'photo picker');
  await sleep(400);
  const inp = await a.$('#cprPhotoIn');
  await inp.uploadFile('/tmp/cpr-photo.png');
  await until(a, () => /^blob:/.test(cprPics.photo) && !!document.querySelector('#cprPreview .cpr-banner img[src^="blob:"]'), 'photo in the banner', 8000);
  check(await ev(a, async () => { const b = await cprIdb('readonly', st => st.get(cprPicKey('photo'))); return !!b && b.size < 300000 && b.type === 'image/jpeg'; }), 'photo: shrunk (JPEG < 300 KB), kept in IndexedDB');
  check(await ev(a, () => { const im = new Image(); im.src = cprPics.photo; return im.decode().then(() => im.naturalWidth <= 1600); }), 'photo: at most 1600 px wide');
  await ev(a, () => cprSet('photoY', 20, true));
  check(await prev(a, () => /center 20%/.test(document.querySelector('#cprPreview .cpr-banner img').style.objectPosition)), 'which part shows: the slider moves the photo');
  await ev(a, () => { const d = document.querySelector('details[data-cpr-sec="hdr"]'); d.open = true; });
  await sleep(400);
  const logo = await a.$('#cprLogoIn');
  await logo.uploadFile('/tmp/cpr-logo.png');
  await until(a, () => /^blob:/.test(cprPics.logo) && !!document.querySelector('#cprPreview .cpr-hdr img'), 'logo in the header', 8000);
  check(true, 'logo: in the header');
  await shot(a, 'photo');
  out('   reload: the choices and pictures are still there');
  await a.reload({ waitUntil: 'networkidle0' });
  await until(a, () => cloud.user && planOn() && calEvLoaded, 'reloaded', 10000);
  await ev(a, () => { calNav(); openCalendar(); calMonth = '2026-06'; openCalPrint(); });
  await until(a, () => !!document.querySelector('#cprPreview .cpr-banner img[src^="blob:"]') && !!document.querySelector('#cprPreview .cpr-hdr img'), 'photo after reload', 10000);
  check(await ev(a, () => cpr.theme === 'photo' && cpr.photoY === 20 && cpr.motto === 'Excellence in every learner' && cpr.weekStart === 1), 'remembered: photo, its position, motto, Monday first');
  await ev(a, () => cprDropPic('photo'));
  await until(a, () => !cprPics.photo && cpr.theme === 'auto', 'photo removed');
  check(true, 'Remove: back to this month’s art');
  await ev(a, () => closeCalModal());
  check(await ev(a, () => !document.getElementById('calModalBox').classList.contains('cal-wide')), 'closing: the sheet is narrow again');

  out('6 the teacher and the School Head print too');
  await t.bringToFront();
  await ev(t, () => { setTeacherTab('calendar'); calMode = 'month'; calMonth = '2026-06'; calPaint(); });
  await until(t, () => !!document.querySelector('#rqCalPane #calPrintBtn'), 'teacher Print', 8000);
  await ev(t, () => document.querySelector('#rqCalPane #calPrintBtn').click());
  await until(t, () => !!document.querySelector('#cprPreview .cpr-sheet'), 'teacher preview');
  await ev(t, () => cprSet('mine', true));
  check(await prev(t, () => { const s = document.querySelector('#cprPreview'); return /Reading camp/.test(s.textContent) && !/Math quiz bee/.test(s.textContent) && /Parent–Teacher Conference/.test(s.textContent); }), 'teacher · Mine only: her activity, not Pedro’s; events stay');
  await shot(t, 'teacher');
  await ev(t, () => { window.__printed = 0; cprPrint(); });
  await until(t, () => window.__printed === 1, 'teacher printed', 8000);
  check(true, 'teacher: printed');
  await ev(h, () => { setHeadTab('plan'); renderHeadView(); });
  await until(h, () => !!document.querySelector('#hdBody [data-hd-pane="plan"] #calPrintBtn'), 'head Print', 10000);
  check(true, 'School Head: Print on the Plan tab');

  out('7 Reset app removes the pictures');
  check(await ev(a, () => /indexedDB\.deleteDatabase\(CPR_DB\)/.test(wipeThisDevice.toString())), 'Reset app deletes the print pictures');

  check(!backend.denied.length, `no refused writes (${backend.denied.join(' | ').slice(0, 300)})`);
  check(!errors.length, `no page errors (${errors.join(' | ').slice(0, 300)})`);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('plan-print');
  await closeAll();
}
