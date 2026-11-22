// Background picture (Nov 2026): More → Appearance → Background picture opens a window. The picture
// is the original (sign-in art), this month's art (the printed calendar's) or your own (Pro, kept
// in IndexedDB on this device); it can show on every page of the custodian, the teacher and the
// School Head. Free schools see the crown and what Pro adds; the printed calendar's photo is Pro too.
import { execFileSync } from 'child_process';
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { custodian, teacher, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const state = page => ev(page, () => ({ on: document.body.classList.contains('page-art'), wide: document.body.classList.contains('art-wide'), art: document.body.dataset.art, img: document.body.style.getPropertyValue('--art-img') }));

try {
  out('1 the custodian: a window from More');
  const { page: a, sid } = await custodian(backend, { width: 390, height: 844 });
  await ev(a, () => switchMainView('HOME'));
  await ev(a, () => openMoreMenu());
  check(await ev(a, () => document.querySelectorAll('#moreArt [data-bg-open]').length === 1 && !document.querySelector('#moreArt [data-art-opt]')), 'More: one Background picture row (no tick boxes in the menu)');
  await ev(a, () => document.querySelector('#moreArt [data-bg-open]').click());
  check(await ev(a, () => !document.getElementById('bgModal').classList.contains('hidden') && document.getElementById('moreMenu').classList.contains('hidden')), 'the window opens, More closes');
  const pics = await ev(a, () => [...document.querySelectorAll('#bgBody [data-bg-pic]')].map(b => b.dataset.bgPic + ':' + b.getAttribute('aria-checked')).join(' '));
  check(pics === 'original:true month:false custom:false', `three pictures, Original picked (${pics})`);
  const pages = await ev(a, () => [...document.querySelectorAll('#bgBody [data-art-opt]')].map(b => b.dataset.artOpt));
  check(['HOME', 'ITEMS', 'CATALOG', 'REPORTS', 'REQUESTS', 'TEACHERS', 'BOOKS'].every(k => pages.includes(k)), `every custodian page has a tick box (${pages.join(', ')})`);

  out('2 this month’s picture, on every page');
  await ev(a, () => document.querySelector('[data-bg-pic="month"]').click());
  const mm = String(new Date().getMonth() + 1).padStart(2, '0');
  let s = await state(a);
  check(s.on && s.wide && s.art === 'month' && s.img.includes(`cal-art/m${mm}.webp`), `Home: this month’s art (m${mm}) as a wide strip`);
  await ev(a, () => document.querySelector('[data-art-all]').click());
  check(await ev(a, () => [...document.querySelectorAll('#bgBody [data-art-opt]')].every(b => b.getAttribute('aria-checked') === 'true') && /every page/.test(document.getElementById('bgBody').textContent)), 'All ticks every page');
  for (const v of ['REQUESTS', 'TEACHERS', 'BOOKS', 'REPORTS']) {
    await ev(a, v => { closeBgModal(); switchMainView(v); }, v);
    s = await state(a);
    check(s.on && s.art === 'month', `${v}: the picture shows`);
  }
  await ev(a, () => { openBgModal(); document.querySelector('[data-art-none]').click(); });
  check(!(await state(a)).on, 'None: no picture anywhere');
  await ev(a, () => { document.querySelector('[data-art-opt="HOME"]').click(); document.querySelector('[data-bg-pic="original"]').click(); closeBgModal(); switchMainView('HOME'); });
  s = await state(a);
  check(s.on && !s.wide && s.art === 'original' && !s.img, 'back to the original on Home');

  out('3 your own picture: Pro');
  await ev(a, () => openBgModal());
  check(await ev(a, () => !!document.querySelector('[data-bg-pic="custom"] [data-bg-pro]')), 'Free school: Your own shows Pro');
  await ev(a, () => document.querySelector('[data-bg-pic="custom"]').click());
  check(await ev(a, () => !!document.querySelector('[data-bg-pro-box="free"]') && !!document.querySelector('[data-bg-about-pro]') && artPic() === 'original'), 'tapping it shows what Pro adds and About Pro; the picture stays');
  check(await ev(a, () => !!document.querySelector('[data-pro-feat="bg"][data-pro-stage="pro"]') || (openProSheet(), !!document.querySelector('[data-pro-feat="bg"][data-pro-stage="pro"]'))), 'More · Pro lists Your own background');
  await ev(a, () => { closeProSheet(); proStartTrial(); });
  await until(a, () => schoolPro().live && bgCanUpload(), 'Pro trial', 8000);
  await ev(a, () => openBgModal());
  check(await ev(a, () => !document.querySelector('[data-bg-pic="custom"] [data-bg-pro]')), 'Pro trial: no crown');
  execFileSync('convert', ['-size', '1200x1200', 'gradient:#7dd3fc-#fde68a', '/tmp/bg-own.jpg']);
  const inp = await a.$('#bgFile');
  await inp.uploadFile('/tmp/bg-own.jpg');
  await until(a, () => document.body.dataset.art === 'custom', 'own picture', 8000);
  s = await state(a);
  check(s.on && s.wide && /blob:/.test(s.img), 'your picture is the background');
  const kept = await ev(a, async () => { const b = await cprIdb('readonly', st => st.get(bgKey())); if (!b) return null; const im = new Image(); im.src = URL.createObjectURL(b); await im.decode(); return { size: b.size, type: b.type, w: im.naturalWidth, h: im.naturalHeight }; });
  check(kept && kept.type === 'image/jpeg' && kept.size < 400000 && kept.w <= 1600 && Math.abs(kept.w / kept.h - 1584 / 672) < 0.02, `kept on this device: a wide JPEG (${kept && `${kept.w}×${kept.h}, ${Math.round(kept.size / 1024)} KB`})`);
  await a.reload({ waitUntil: 'networkidle0' });
  await until(a, () => document.body.dataset.art === 'custom', 'own picture after a restart', 8000);
  check((await state(a)).art === 'custom', 'still there after a restart');
  check(await ev(a, () => /Your own/.test(document.querySelector('#moreArt [data-bg-open]').textContent)), 'More: “Your own · …”');
  await ev(a, () => { openBgModal(); document.querySelector('[data-bg-remove]').click(); });
  await until(a, () => artPic() === 'original' && !bgCustomUrl, 'removed', 8000);
  check((await state(a)).art === 'original', 'Remove: the original comes back');

  out('4 a teacher: every page of their screen');
  const { page: t } = await teacher(backend, sid);
  await ev(t, () => setTeacherTab('today'));
  check((await state(t)).on, 'Today: the picture (on by default)');
  await ev(t, () => openAppearPanel());
  check(await ev(t, () => /Every page/.test(document.querySelector('#rqArt [data-bg-open]').textContent)), 'Appearance: “Original · Every page”');
  await ev(t, () => document.querySelector('#rqArt [data-bg-open]').click());
  const tPages = await ev(t, () => [...document.querySelectorAll('#bgBody [data-art-opt]')].map(b => b.dataset.artOpt));
  check(['T:today', 'T:items', 'T:requests', 'T:stock', 'T:library', 'T:more'].every(k => tPages.includes(k)) && !tPages.includes('HOME'), `the teacher’s pages (${tPages.join(', ')})`);
  await ev(t, () => { document.querySelector('[data-art-opt="T:items"]').click(); document.querySelector('[data-bg-pic="month"]').click(); closeBgModal(); });
  check((await state(t)).art === 'month', 'Today: this month’s art');
  await ev(t, () => setTeacherTab('items'));
  check(!(await state(t)).on, 'My Items: plain (unticked)');
  await ev(t, () => setTeacherTab('more'));
  check((await state(t)).on, 'More: the picture');
  await ev(t, () => openBgModal());
  check(await ev(t, () => bgCanUpload() && !document.querySelector('[data-bg-pic="custom"] [data-bg-pro]')), 'the school is in its Pro trial: the teacher may upload too');
  await ev(t, () => closeBgModal());

  out('5 the School Head: every page of their screen');
  await a.setViewport({ width: 1100, height: 900 });
  const { page: h } = await schoolHead(backend, a, sid);
  await until(h, () => activeMainView === 'HEAD', 'head view', 8000);
  check((await state(h)).on, 'Today: the picture (on by default)');
  await ev(h, () => openBgModal());
  const hPages = await ev(h, () => [...document.querySelectorAll('#bgBody [data-art-opt]')].map(b => b.dataset.artOpt));
  check(['H:today', 'H:approve', 'H:school', 'H:items', 'H:people', 'H:history'].every(k => hPages.includes(k)), `the head’s pages (${hPages.join(', ')})`);
  await ev(h, () => { document.querySelector('[data-art-opt="H:approve"]').click(); closeBgModal(); setHeadTab('approve'); });
  check(!(await state(h)).on, 'Approve: plain (unticked)');
  await ev(h, () => setHeadTab('school'));
  check((await state(h)).on, 'School: the picture');

  out('6 the old switch (one for the teacher’s screen) carries over');
  await ev(t, () => { localStorage.setItem(ART_KEY, JSON.stringify(['HOME', 'REQUESTER'])); setTeacherTab('items'); syncPageArt(); });
  check(await ev(t, () => document.body.classList.contains('page-art') && artPages().includes('T:items') && artPages().includes('H:today') && !artPages().includes('REQUESTER')), 'REQUESTER becomes every teacher and head page');
  check(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('background');
  await closeAll();
}
