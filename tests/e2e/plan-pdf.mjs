// Reading the school calendar from a PDF, a photo or pasted text (Nov 2026). The reader turns
// lines of text into dates (formats, years, kinds, terms, school year, memo); the AO pastes a
// DepEd Order into a school year that is not set up, checks the dates and adds them; reading it
// again marks them Already there; a typed PDF (made here) and a scanned one (an image, read by a
// stand-in text reader) are read on the phone; the admin publishes it for every school, and
// another school loads it as the DepEd calendar. Plan: docs/plans/calendar-from-pdf.md
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, refused } from './lib/school-setup.mjs';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const year = (sid, sy) => backend.store.get(`schools/${sid}/planYears/${sy}`);
const ppas = sid => [...backend.store.entries()].filter(([k]) => k.startsWith(`schools/${sid}/ppas/`)).map(([k, v]) => ({ ...v, id: k.split('/').pop() }));
const turnOn = page => ev(page, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); });
const items = page => ev(page, () => (cpdf && cpdf.items || []).map(x => ({ ...x })));
const find = (list, title) => list.find(x => x.title === title);

// A one-page PDF: typed lines (Helvetica) and/or a JPEG covering the page (a scan)
function makePdf({ lines = [], jpeg = null, jw = 0, jh = 0 }) {
  const W = 612, H = 792;
  const enc = s => s.replace(/[\\()]/g, m => '\\' + m).replace(/\u2013/g, '\x96').replace(/\u2019/g, '\x92');
  let content = jpeg ? `q ${W} 0 0 ${H} 0 0 cm /Im1 Do Q\n` : '';
  if (lines.length) content += 'BT /F1 11 Tf\n' + lines.map(l => `1 0 0 1 ${l.x} ${l.y} Tm (${enc(l.t)}) Tj`).join('\n') + '\nET\n';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R >>${jpeg ? ' /XObject << /Im1 6 0 R >>' : ''} >> /Contents 4 0 R >>`,
    Buffer.concat([Buffer.from(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n`, 'latin1'), Buffer.from(content, 'latin1'), Buffer.from('endstream', 'latin1')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  if (jpeg) objs.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${jw} /Height ${jh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'), jpeg, Buffer.from('\nendstream', 'latin1')]));
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')], offs = [];
  let len = parts[0].length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]);
    offs.push(len); parts.push(b); len += b.length;
  });
  parts.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

const ORDER = `DepEd Order No. 12, s. 2027
SCHOOL CALENDAR AND ACTIVITIES FOR SCHOOL YEAR 2027–2028
Annex B
Activity | Date
Brigada Eskwela | June 1–5
Opening of classes | Monday, June 7
Term 1 | June 7 – September 10
Independence Day | June 12 (Saturday)
Term 1: first teacher-made summative test | July 5
INSET | September 13–14, 2027
Second Term | Sept. 15 – Dec. 17
National Achievement Test for Grade 10 | October 4–8
All Saints’ Day | Nov. 1
Christmas Break | Dec. 18, 2027 – Jan. 2, 2028
Third Term | January 3 – April 7
Term 3 examinations | March 25 and 26
Mid-year performance review and
evaluation of teachers | February 1–5
School Foundation Day | 08/27/2027
End of School Year | April 7, 2028`;

try {
  out('1 the admin school (Testing ES), another school, a teacher');
  const { page: a, sid: sA } = await custodian(backend, { name: 'admin' });
  const { page: b, sid: sB } = await custodian(backend, { name: 'other', email: 'jo@deped.gov.ph', school: 'Lahug Elementary School' });
  const { page: t } = await teacher(backend, sA);
  backend.setAdminSchool(sA);
  for (const p of [a, b, t]) { await ev(p, s => { ADMIN_SCHOOL = s; featApply(); }, sA); await turnOn(p); }
  check(await ev(a, () => isAdminDevice()) && !(await ev(b, () => isAdminDevice())), 'the admin is the Testing ES custodian');
  check(await ev(a, () => WHATS_NEW.some(r => r.id === '2026-11-calendar-from-pdf' && r.pilot === 'plan')), 'What’s new: Read the school calendar from a PDF (pilot)');

  out('2 the reader: lines of text in, dates out');
  const R = await ev(a, src => { const r = cpdfParse(src.split('\n'), '2027-2028', 'deped'); return { ...r, sy: cpdfFindSy(src), memo: cpdfFindMemo(src), def: cpdfDefKind(src) }; }, ORDER);
  const I = t2 => find(R.items, t2) || {};
  check(R.sy === '2027-2028' && R.memo === 'DepEd Order No. 012, s. 2027' && R.def === 'deped', `school year, memo and kind of paper (${R.sy} · ${R.memo})`);
  check(I('Brigada Eskwela').from === '2027-06-01' && I('Brigada Eskwela').to === '2027-06-05' && I('Brigada Eskwela').kind === 'deped', 'June 1–5: the first year of the school year');
  check(I('Opening of classes').from === '2027-06-07' && R.start === '2027-06-07' && R.end === '2028-04-07', 'the first and last day: opening of classes, end of school year');
  check(I('Independence Day').kind === 'holiday' && I('Independence Day').sub === 'regular' && I('All Saints’ Day').sub === 'special' && I('All Saints’ Day').from === '2027-11-01', 'holidays: regular and special (weekday words left out)');
  check(I('Term 1: first teacher-made summative test').kind === 'exam' && I('INSET').kind === 'inset' && I('INSET').to === '2027-09-14', 'exams and INSET');
  check(I('Christmas Break').kind === 'break' && I('Christmas Break').from === '2027-12-18' && I('Christmas Break').to === '2028-01-02', 'a break from December to January');
  const exams = R.items.filter(x => x.title === 'Term 3 examinations').map(x => x.from).join(',');
  check(exams === '2028-03-25,2028-03-26', `March 25 and 26: two days (${exams})`);
  check(I('Mid-year performance review and evaluation of teachers').from === '2028-02-01', 'a title that starts on the line above');
  check(I('School Foundation Day').from === '2027-08-27', 'numbers: 08/27/2027');
  check(I('National Achievement Test for Grade 10').nat === true, 'national-only activities are marked (NAT)');
  check(JSON.stringify(R.terms) === JSON.stringify([{ n: 1, from: '2027-06-07', to: '2027-09-10' }, { n: 2, from: '2027-09-15', to: '2027-12-17' }, { n: 3, from: '2028-01-03', to: '2028-04-07' }]) && I('Second Term').term === 2, 'three terms: Term 1, Second Term, Third Term');
  const R2 = await ev(a, () => cpdfParse([
    'JUNE 2027', '21 Family Day', '28–30 Science camp', 'Reading month | 3 November – 30 November 2027',
    'Quarterly test | 06/14/27', 'Grade 6 recognition | 1 April | 2 April', 'Seminar on child protection',
    'June 1, 8 and 15, 2027 | Flag ceremony practice', 'December 8', 'Feast of the Immaculate Conception', 'Classes suspended | Aug. 4'
  ], '2027-2028', 'event'), null);
  const J = t2 => find(R2.items, t2) || {};
  check(J('Family Day').from === '2027-06-21' && J('Science camp').to === '2027-06-30' && J('Family Day').kind === 'event', 'a month heading, then days; a school calendar: school events');
  check(J('Reading month').from === '2027-11-03' && J('Reading month').to === '2027-11-30', 'day first: 3 November – 30 November 2027');
  check(J('Quarterly test').from === '2027-06-14' && J('Quarterly test').kind === 'exam', 'two-digit years: 06/14/27');
  check(J('Grade 6 recognition').from === '2028-04-01' && J('Grade 6 recognition').to === '2028-04-02', 'start and end in two columns: one range');
  check(R2.items.filter(x => x.title === 'Flag ceremony practice').length === 3, 'June 1, 8 and 15: three dates');
  check(J('Feast of the Immaculate Conception').from === '2027-12-08' && J('Feast of the Immaculate Conception').kind === 'holiday', 'a date on a row of its own: the title is on the next line');
  check(J('Classes suspended').kind === 'suspension', 'class suspension');

  out('3 the AO pastes the order into SY 2027–2028 (not set up yet)');
  await ev(a, () => openCalendar());
  await until(a, () => activeMainView === 'CALENDAR', 'calendar page');
  await ev(a, () => setCalSy(1));
  await until(a, () => !!document.querySelector('[data-cal-setup]') && !!document.getElementById('calPdfSetup'), 'setup card: Read a calendar PDF');
  check(await ev(a, () => !document.getElementById('calLoadBtn') && /bg-teal-700/.test(document.getElementById('calPdfSetup').className)), 'no DepEd calendar for 2027–2028 yet: reading a PDF is the main button');
  await ev(a, () => document.getElementById('calPdfSetup').click());
  await until(a, () => !!document.getElementById('cpdfFile') && !!document.getElementById('cpdfPasteBtn'), 'pick: a PDF or photo, or paste');
  await ev(a, () => document.getElementById('cpdfPasteBtn').click());
  await ev(a, src => { document.getElementById('cpdfText').value = src; document.getElementById('cpdfReadText').click(); }, ORDER);
  await until(a, () => !!document.querySelector('[data-cpdf-list]'), 'check the dates');
  let L = await items(a);
  check(await ev(a, () => cpdf.sy === '2027-2028' && cpdfSy.value === '2027-2028' && cpdfStart.value === '2027-06-07' && cpdfEnd.value === '2028-04-07' && /Term 1: Jun 7/.test(document.querySelector('[data-cpdf-terms]').textContent)), 'the school year, first and last day and terms are filled in');
  check(L.filter(x => x.tag === 'term').length === 3 && L.filter(x => x.tag === 'term').every(x => !x.on) && await ev(a, () => document.querySelectorAll('[data-cpdf-tag="term"]').length === 3), 'term lines: unticked, Used for Term n');
  check(await ev(a, () => cpdfMemo.value === 'DepEd Order No. 012, s. 2027' && cpdfDef.value === 'deped'), 'memo found; most entries: DepEd activities');
  // The foundation day is the school's own: change its kind; untick the NAT
  const fd = find(L, 'School Foundation Day').i, nat = find(L, 'National Achievement Test for Grade 10').i;
  await ev(a, i => { cpdfOpen(i); }, fd);
  await until(a, () => !!document.querySelector('[data-cpdf-edit] [data-cpdf-kindsel]'), 'edit one');
  await ev(a, () => { const s = document.querySelector('[data-cpdf-edit] [data-cpdf-kindsel]'); s.value = 'event'; s.dispatchEvent(new Event('change')); });
  await ev(a, i => { document.querySelector(`[data-cpdf-item="${i}"] [data-cpdf-tick]`).click(); }, nat);
  L = await items(a);
  const on = L.filter(x => x.on).length;
  check(find(L, 'School Foundation Day').kind === 'event' && !find(L, 'National Achievement Test for Grade 10').on && await ev(a, n => new RegExp(`Add ${n} to the calendar`).test(document.getElementById('cpdfSave').textContent), on), `change the kind, untick one: Add ${on} to the calendar`);
  await ev(a, () => document.getElementById('cpdfSave').click());
  await waitNode(() => !!year(sA, '2027-2028'));
  const Y = year(sA, '2027-2028');
  check(Y.start === '2027-06-07' && Y.end === '2028-04-07' && Y.terms.length === 3 && Y.terms[1].from === '2027-09-15' && Y.memo === 'DepEd Order No. 012, s. 2027', 'saved: SY 2027–2028 with its first and last day, terms and memo');
  check(Y.days.length === on - 1 && Y.days.every(d => d.src === 'pdf') && !Y.days.some(d => /Achievement/.test(d.title)) && Y.days.find(d => d.title === 'Independence Day').sub === 'regular', `${on - 1} dates (from a calendar file), the NAT left out`);
  await waitNode(() => ppas(sA).some(p => p.kind === 'event' && p.title === 'School Foundation Day'));
  check(ppas(sA).find(p => p.title === 'School Foundation Day').from === '2027-08-27' && ppas(sA).find(p => p.title === 'School Foundation Day').sy === '2027-2028', 'the foundation day became a school event');
  await until(a, () => !!document.querySelector('[data-cal-strip]'), 'the calendar shows SY 2027–2028');
  check(await ev(a, () => calClassDays(calYears['2027-2028']).total > 150), `class days counted (${await ev(a, () => calClassDays(calYears['2027-2028']).total)})`);
  check(!(await ev(a, () => loadNotifs().items.some(n => /No classes: Christmas Break/.test(n.title)))), 'no notification for each date read from a file');

  out('4 reading it again: everything is Already there');
  await until(a, () => !!document.getElementById('calPdfBtn'), 'Read dates from a PDF or photo');
  await ev(a, () => document.getElementById('calPdfBtn').click());
  await ev(a, () => document.getElementById('cpdfPasteBtn').click());
  await ev(a, src => { document.getElementById('cpdfText').value = src; document.getElementById('cpdfReadText').click(); }, ORDER);
  await until(a, () => !!document.querySelector('[data-cpdf-list]'), 'check the dates');
  L = await items(a);
  const left = L.filter(x => x.on).map(x => x.title);
  check(L.filter(x => x.tag === 'have').length >= on - 1 && left.length === 1 && /Achievement/.test(left[0]), `already there: unticked (left: ${left.join(', ')})`);
  check(await ev(a, () => !document.getElementById('cpdfStart')), 'the school year is set up: no first and last day to type');
  await ev(a, () => closeCalModal());

  out('5 a typed PDF (two columns)');
  const pdf = makePdf({ lines: [
    { x: 60, y: 740, t: 'Division Memorandum No. 88, s. 2027' },
    { x: 60, y: 720, t: 'Division calendar of activities, School Year 2027–2028' },
    { x: 60, y: 690, t: 'Activity' }, { x: 380, y: 690, t: 'Date' },
    { x: 60, y: 670, t: 'Division Science Fair' }, { x: 380, y: 670, t: 'September 22–24, 2027' },
    { x: 60, y: 650, t: 'Bonifacio Day' }, { x: 380, y: 650, t: 'November 30, 2027' },
    { x: 60, y: 630, t: 'Division Festival of Talents' }, { x: 380, y: 630, t: 'Feb. 15 – 19, 2028' },
    { x: 60, y: 610, t: 'Midyear break' }, { x: 380, y: 610, t: 'January 31, 2028' }
  ] });
  fs.writeFileSync('/tmp/cal-typed.pdf', pdf);
  await ev(a, () => document.getElementById('calPdfBtn').click());
  await until(a, () => !!document.getElementById('cpdfFile'), 'pick');
  await (await a.$('#cpdfFile')).uploadFile('/tmp/cal-typed.pdf');
  await until(a, () => !!document.querySelector('[data-cpdf-list]') || !!document.querySelector('[data-cpdf-err]'), 'the PDF is read', 30000);
  const err = await ev(a, () => (document.querySelector('[data-cpdf-err]') || {}).textContent || '');
  L = await items(a);
  out('   read: ' + L.map(x => `${x.title} ${x.from}`).join(' · ') + (err ? ' · error: ' + err : ''));
  check(!err && find(L, 'Division Science Fair') && find(L, 'Division Science Fair').from === '2027-09-22' && find(L, 'Division Science Fair').to === '2027-09-24', 'PDF: Division Science Fair, Sep 22–24, 2027 (title and date in two columns)');
  check(find(L, 'Bonifacio Day') && find(L, 'Bonifacio Day').kind === 'holiday' && find(L, 'Division Festival of Talents').to === '2028-02-19' && find(L, 'Midyear break').kind === 'break', 'PDF: a holiday, a range in February, a break');
  check(await ev(a, () => cpdfMemo.value === 'Division Memorandum No. 088, s. 2027' && !document.querySelector('[data-cpdf-scanned]')), 'PDF: the memo; typed text, so no scan warning');
  await ev(a, () => closeCalModal());

  out('6 a scanned PDF and a photo (the text reader is a stand-in here)');
  execFileSync('convert', ['-size', '850x1100', 'xc:white', '-fill', 'black', '-draw', 'rectangle 80,80 770,140', '-colorspace', 'sRGB', '-type', 'TrueColor', '-quality', '80', '/tmp/cal-scan.jpg']);
  const jpg = fs.readFileSync('/tmp/cal-scan.jpg');
  fs.writeFileSync('/tmp/cal-scan.pdf', makePdf({ jpeg: jpg, jw: 850, jh: 1100 }));
  execFileSync('convert', ['-size', '600x400', 'xc:white', '-fill', 'black', '-draw', 'rectangle 40,40 560,90', '/tmp/cal-photo.png']);
  await ev(a, () => {
    window.__ocrIn = [];
    window.isOcrDownloaded = async () => true;
    window.getOcrWorker = async () => ({ recognize: async img => { __ocrIn.push(img && img.width); return { data: { text: 'SY 2027-2028\nNov. 2, 2027      All Souls Day\nDecember 21, 2027 - January 1, 2028      Christmas break' } }; } });
  });
  await ev(a, () => document.getElementById('calPdfBtn').click());
  await until(a, () => !!document.getElementById('cpdfFile'), 'pick');
  await (await a.$('#cpdfFile')).uploadFile('/tmp/cal-scan.pdf');
  await until(a, () => !!document.querySelector('[data-cpdf-list]') || !!document.querySelector('[data-cpdf-err]'), 'the scan is read', 30000);
  L = await items(a);
  check(await ev(a, () => __ocrIn.length === 1 && __ocrIn[0] > 1000), `scanned page: drawn and given to the text reader (${await ev(a, () => __ocrIn.join(','))} px wide)`);
  check(await ev(a, () => /A scanned page was read with the text reader/.test(document.querySelector('[data-cpdf-scanned]').textContent)) && find(L, 'All Souls Day').from === '2027-11-02' && find(L, 'Christmas break').to === '2028-01-01', 'scan: check carefully; All Souls Day, Christmas break');
  await ev(a, () => cpdfAgain());
  await until(a, () => !!document.getElementById('cpdfFile'), 'read another file');
  await (await a.$('#cpdfFile')).uploadFile('/tmp/cal-photo.png');
  await until(a, () => !!document.querySelector('[data-cpdf-list]') || !!document.querySelector('[data-cpdf-err]'), 'the photo is read', 30000);
  check(await ev(a, () => __ocrIn.length === 2 && /The photo was read/.test(document.querySelector('[data-cpdf-scanned]').textContent) && cpdf.items.length === 2), 'photo: read with the text reader');
  await ev(a, () => closeCalModal());

  out('7 the admin publishes it for every school');
  await ev(a, () => document.getElementById('calPdfBtn').click());
  await ev(a, () => document.getElementById('cpdfPasteBtn').click());
  await ev(a, src => { document.getElementById('cpdfText').value = src; document.getElementById('cpdfReadText').click(); }, ORDER);
  await until(a, () => !!document.querySelector('[data-cpdf-admin]'), 'admin: Publish for every school');
  await ev(a, () => { cpdfTick('all'); cpdf.items.forEach(x => { if (x.tag !== 'out') x.on = !x.term; }); cpdfDraw(); });
  const nPub = await ev(a, () => cpdf.items.filter(x => x.on && x.kind !== 'event').length);
  await ev(a, () => document.getElementById('cpdfPublish').click());
  await waitNode(() => !!backend.store.get('depedCalendars/2027-2028'));
  const P = backend.store.get('depedCalendars/2027-2028') || {};
  check(P.v === 1 && P.memo === 'DepEd Order No. 012, s. 2027' && P.start === '2027-06-07' && P.terms.length === 3 && P.days.length === nPub && P.days.every(d => d.k && d.f && d.n), `published: v1, ${P.days && P.days.length} dates, terms, memo`);
  check(!P.days.some(d => d.n === 'School Foundation Day' && d.k === 'event'), 'school events are not published');
  check(a.dialogs.some(d => /confirm: .*dates for SY 2027–2028/.test(d)), 'asked first: Publish for every school?');

  out('8 another school loads it; nobody else can publish');
  check(await refused(b, F => F.setDoc(F.doc(cloud.db, 'depedCalendars', '2027-2028'), { sy: '2027-2028', v: 9, memo: 'x', start: '', end: '', terms: [], days: [] })), 'rules: only the admin publishes');
  check(await refused(b, F => F.getDocs(F.collection(cloud.db, 'depedCalendars'))), 'rules: no listing, only one school year at a time');
  await ev(b, () => { openCalendar(); setCalSy(1); });
  await until(b, () => !!document.getElementById('calLoadBtn'), 'Load the DepEd calendar (published)', 10000);
  check(await ev(b, () => /DepEd Order No\. 012, s\. 2027/.test(document.querySelector('[data-cal-setup]').textContent) && !document.querySelector('[data-cpdf-admin]')), 'the other school: Load the DepEd calendar (DepEd Order No. 012, s. 2027)');
  await ev(b, () => document.getElementById('calLoadBtn').click());
  await waitNode(() => !!year(sB, '2027-2028'));
  const YB = year(sB, '2027-2028');
  check(YB.start === '2027-06-07' && YB.days.length === nPub && YB.days.every(d => d.src === 'deped') && YB.depedV === 1 && YB.terms.length === 3, 'loaded: the published dates, as DepEd dates (v1)');
  check(await ev(b, () => !!document.getElementById('calPdfBtn')) && !(await ev(b, () => { openCalPdf(); return !!document.querySelector('[data-cpdf-admin]'); })), 'the other school can read its own memos (no Publish)');
  await ev(b, () => closeCalModal());
  // 2026-2027 keeps the list built into the app (v2) until the admin publishes a newer one
  check(await ev(b, () => calStarter('2026-2027').v === 2 && /DepEd Order No\. 009/.test(calStarter('2026-2027').memo)), 'SY 2026–2027: the built-in DepEd calendar still applies');

  out('9 teachers read the calendar; they do not read files');
  await ev(t, () => { renderRequesterView(); });
  check(await ev(t, () => !calCanEdit() && (openCalPdf(), !document.querySelector('#calModalBody [data-cpdf-reading], #cpdfFile'))), 'teacher: no Read a calendar PDF');

  const bad = backend.denied.filter(d => !/deped calendar write|list schools · .*depedCalendars/.test(d));
  check(!bad.length, `no refused reads or writes besides the test’s own (${bad.join(' | ').slice(0, 400)})`);
  check(!errors.length, `no page errors (${errors.join(' | ').slice(0, 300)})`);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('plan-pdf');
  await closeAll();
}
