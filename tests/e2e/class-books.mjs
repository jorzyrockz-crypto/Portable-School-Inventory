// Textbooks for a class: the custodian issues to the adviser (Book Issuance List), the adviser
// taps Received, then records on their phone what the learners have, returned, damaged or lost
// (counts only, or with learner names, SF3-style). Names stay between the adviser and the
// custodian, never go to the history, and are erased with "Clear names" or after the school year
// ends; the counts stay. The custodian records the losses (Summary of Losses) and takes the books
// back at year end.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { refused, waitNode, custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const col = (sid, name) => backend.docs(`schools/${sid}/${name}/`).filter(d => d.path.split('/').length === 4).map(d => ({ ...d, id: d.path.split('/').pop() }));

try {
  out('1 the custodian issues two textbooks to Ana');
  const { page: a, sid } = await custodian(backend);
  await ev(a, () => openBooksView());
  for (const [title, area, cost] of [['Science 4 Learner’s Material', 'Science', '110'], ['Mathematics 4 Learner’s Material', 'Mathematics', '125']]) {
    await ev(a, () => openBkTitleForm());
    await ev(a, (t, ar, c) => { document.getElementById('bkf-title').value = t; document.getElementById('bkf-qty').value = '40'; document.getElementById('bkf-area').value = ar; document.getElementById('bkf-cost').value = c; document.querySelector('#bkf-grades [data-g="4"]').click(); }, title, area, cost);
    await ev(a, () => bkFormOk());
    await ev(a, () => closeBkModal());
  }
  await waitNode(() => col(sid, 'books').length === 2);
  const [sci, math] = ['Science', 'Mathematics'].map(x => col(sid, 'books').find(b => b.title.startsWith(x)));
  const { page: t, uid: anaUid } = await teacher(backend, sid);
  const { page: u } = await teacher(backend, sid, 'Ben Cruz', 'Teacher I', 'Grade 5');
  await until(a, uid => teacherRoster().some(r => r.uid === uid && r.joined), 'Ana on the roster', 8000, anaUid);
  await ev(a, uid => { setBkTab('classes'); openBkIssue(null, uid); }, anaUid);
  await until(a, () => document.querySelectorAll('[data-bk-issue]').length >= 2, 'issue sheet');
  check(await ev(a, () => /Grade 4/.test(document.getElementById('bkModalBody').textContent)), 'issue sheet lists the Grade 4 titles');
  await ev(a, (s, m) => { document.querySelector(`[data-bk-issue="${s}"]`).value = '3'; document.querySelector(`[data-bk-issue="${m}"]`).value = '3'; }, sci.id, math.id);
  await ev(a, () => bkIssueOk());
  await waitNode(() => col(sid, 'bookMoves').some(m => m.kind === 'issue' && m.lines.length === 2));
  const mv = col(sid, 'bookMoves').find(m => m.kind === 'issue');
  check(mv.lines.map(l => l.n).join() === '3,3' && mv.toUid === anaUid, 'one Book Issuance List, 3 + 3 copies');
  await until(t, () => !!document.querySelector('[data-bk-ack]') || (setTeacherTab('library'), false), 'Ana sees Received', 10000);
  await ev(t, () => document.querySelector('[data-bk-ack]').click());
  await waitNode(() => col(sid, 'bookMoves').find(m => m.id === mv.id).status === 'done');
  check(true, 'Ana: Received');

  out('2 Ana records the class (counts, then names)');
  await until(t, () => !!document.getElementById('bkMyClassBtn'), 'My class card');
  check(await ev(t, () => /6 copies received/.test(document.getElementById('bkMyClassBtn').textContent)), '“My class’s textbooks · 6 copies received”');
  await ev(t, () => openBkMyClass());
  check(await ev(t, () => document.querySelectorAll('[data-bk-cls-table] tbody tr').length === 2), 'both titles listed with what she got');
  await ev(t, () => { document.getElementById('bkClsSection').value = 'Grade 4 – Rizal'; document.getElementById('bkClsSize').value = '38'; });
  await ev(t, () => { const el = document.querySelector('[data-bk-cls$="|n"]'); el.value = '3'; bkClassNum(el); });
  await ev(t, () => bkSaveMyClass());
  const cid = `${await ev(t, () => bkSY())}_${anaUid}`;
  await waitNode(() => (backend.store.get(`schools/${sid}/classBooks/${cid}`) || {}).section === 'Grade 4 – Rizal');
  let doc = backend.store.get(`schools/${sid}/classBooks/${cid}`);
  check(doc && doc.uid === anaUid && doc.section === 'Grade 4 – Rizal' && doc.titles.length === 2 && doc.titles.some(x => x.n === 3) && !(doc.learners || []).length, 'counts only: saved as {school year}_{adviser}, no names' + (doc && doc.titles && doc.titles.length === 2 && doc.uid === anaUid ? '' : JSON.stringify(doc) + anaUid));
  check(doc.size === 38, 'class size saved (38 learners)');
  // learner names (optional)
  await ev(t, () => openBkMyClass());
  check(await ev(t, () => /Names only: no LRN/.test(document.querySelector('[data-bk-learners]').textContent)), 'privacy notice next to the names');
  await ev(t, () => { document.querySelector('[data-bk-learners]').open = true; document.getElementById('bkLearnerPaste').value = '1. Andres, Maria\n2) Bautista, Jose\nCruz, Liza\nCruz, Liza'; bkAddLearners(); });
  check(await ev(t, () => bkSheet.doc.learners.length === 3 && bkSheet.doc.learners[0].n === 'Andres, Maria'), '3 names added (numbering and the repeat removed)');
  await ev(t, () => bkCellAll('o'));
  check(await ev(t, () => document.querySelectorAll('[data-bk-cell]').length === 6 && bkSheet.doc.titles.every(x => x.n === 3)), 'All have them: 3 learners × 2 titles');
  // Maria returned Science; Jose lost Mathematics and paid; Liza's Science came back damaged
  await ev(t, s => { bkCell(0, s); }, sci.id);                                   // o → r
  await ev(t, m => { bkCell(1, m); bkCell(1, m); bkCell(1, m); bkCell(1, m); }, math.id);   // o → r → d → l → p
  await ev(t, s => { bkCell(2, s); bkCell(2, s); }, sci.id);                     // o → r → d
  await ev(t, m => { const el = document.querySelector(`[data-bk-cls="${m}|amt"]`); el.value = '125'; bkClassNum(el); }, math.id);
  check(await ev(t, () => document.querySelector('[data-bk-cls$="|n"]').readOnly), 'with names, the counts come from the boxes');
  await ev(t, () => bkSaveMyClass());
  await waitNode(() => (backend.store.get(`schools/${sid}/classBooks/${cid}`).learners || []).length === 3);
  doc = backend.store.get(`schools/${sid}/classBooks/${cid}`);
  const ts = doc.titles.find(x => x.b === sci.id), tm = doc.titles.find(x => x.b === math.id);
  check(ts.n === 3 && ts.r === 1 && ts.d === 1 && tm.p === 1 && tm.amt === 125, 'counts: Science 1 returned, 1 damaged; Mathematics 1 lost (paid ₱125)');
  check(!backend.docs(`schools/${sid}/auditLog/`).some(d => /Andres|Bautista|Liza/.test(JSON.stringify(d))), 'no learner name in the school history');
  await ev(t, () => bkPrintClassDoc(bk.myClass));
  await sleep(200);
  check(await ev(t, () => /TEXTBOOKS ISSUED TO LEARNERS/.test(printPrSection.textContent) && /Bautista, Jose/.test(printPrSection.textContent) && /LP/.test(printPrSection.textContent)), 'SF3-style class sheet prints with the names');

  out('3 who can see the names');
  check(await refused(u, (F, sid, id) => F.getDoc(F.doc(cloud.db, 'schools', sid, 'classBooks', id)), sid, cid), 'rules: another teacher can’t read Ana’s class');
  check(await refused(u, (F, sid, id, uid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'classBooks', id), { uid, sy: '2026-2027', titles: [], learners: [] }), sid, cid, anaUid), 'rules: …nor write it');
  const benUid = await ev(u, () => cloud.user.uid);
  check(await refused(u, (F, sid, uid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'classBooks', '2026-2027_' + uid), { uid, sy: '2026-2027', titles: [], learners: Array.from({ length: 81 }, (_, i) => ({ n: 'L' + i })) }), sid, benUid), 'rules: at most 80 learners');
  await until(a, id => bk.classes.some(c => c.id === id && (c.learners || []).length === 3), 'custodian sees the class', 10000, cid);
  await ev(a, () => setBkTab('classes'));
  check(await ev(a, id => !!document.querySelector(`[data-bk-class="${id}"]`) && /1 lost not yet taken off/.test(document.getElementById('bkPane').textContent), cid), 'custodian: Classes tab, “1 lost not yet taken off the count”');

  // 3 Science + 3 Mathematics for 38 learners: 6 of 76 = 8%
  check(await ev(a, () => bkDashSummary().r === 8), 'head summary: learners with their textbooks 8% (from the class sheet)');
  await ev(a, () => openYearEnd());
  check(await ev(a, () => !!document.querySelector('[data-ye-section="books"]') && /Not counted in the app yet/.test(document.querySelector('[data-ye-books-count]').textContent) && /6 accounted for|of 6 accounted for/.test(document.querySelector('[data-ye-books-retrieval]').textContent)), 'Year-end & reminders: Books (count, retrieval: … of 6 accounted for)');
  await ev(a, () => bkMarkCounted());
  await until(a, () => /Last counted/.test(document.querySelector('[data-ye-books-count]').textContent), 'Counted today');
  await waitNode(() => !!((backend.store.get(`schools/${sid}/bookMeta/places`) || {}).opts || {}).countedISO);
  check(true, 'Counted today: saved for the quarterly reminder');
  await ev(a, () => closeYearEnd());

  out('4 the custodian records the loss and takes the books back');
  await ev(a, id => openBkClass(id), cid);
  check(await ev(a, () => /3 learner names/.test(document.getElementById('bkModalBody').textContent)), 'class view: 3 learner names, erased after the school year');
  await ev(a, id => bkApplyClassLosses(id), cid);
  await waitNode(() => (col(sid, 'books').find(b => b.id === math.id) || {}).lost === 1 && (backend.store.get(`schools/${sid}/classBooks/${cid}`).ap || {})[math.id] === 1);
  const mb = col(sid, 'books').find(b => b.id === math.id);
  check(mb.hold.find(h => h.p === `room-${anaUid}`).n === 2 && mb.losses[0].paid === 125 && mb.losses[0].src === 'class', 'Mathematics: 1 off Ana’s room, learner paid ₱125 (Summary of Losses)');
  await ev(a, id => bkApplyClassLosses(id), cid);
  await sleep(800);
  check(col(sid, 'books').find(b => b.id === math.id).lost === 1, 'recorded once (pressing again changes nothing)');
  await ev(a, () => bkPrintLosses());
  await sleep(200);
  check(await ev(a, () => /SUMMARY OF LOSSES/.test(printPrSection.textContent) && /Mathematics 4/.test(printPrSection.textContent) && /125\.00/.test(printPrSection.textContent)), 'Summary of Losses prints (amount paid)');
  check(await ev(a, () => !/Andres|Bautista/.test(printPrSection.textContent)), '…without learner names');
  await ev(a, () => closeBkModal());
  await ev(a, uid => openBkTakeBack(`room-${uid}`), anaUid);
  await ev(a, () => document.querySelectorAll('[data-bk-back]').forEach(el => { el.value = el.max; }));
  await ev(a, () => bkTakeBackOk());
  await waitNode(() => col(sid, 'bookMoves').some(m => m.kind === 'return'));
  const back = col(sid, 'bookMoves').find(m => m.kind === 'return');
  check(back.lines.reduce((n, l) => n + l.n, 0) === 5 && back.to === 'storage', 'take back: 5 copies return to the Supply room');
  await waitNode(() => col(sid, 'books').every(b => !b.hold.some(h => h.p === `room-${anaUid}`)));
  check(col(sid, 'books').find(b => b.id === sci.id).hold[0].n === 40, 'Science: all 40 back in the Supply room');
  await ev(a, () => closeBkModal());

  out('5 names erased: Clear names, and after the school year');
  await until(t, () => bk.myClass && (bk.myClass.learners || []).length === 3, 'Ana’s class');
  await ev(t, () => openBkMyClass());
  await ev(t, () => bkClearLearners());
  await waitNode(() => !(backend.store.get(`schools/${sid}/classBooks/${cid}`).learners || []).length);
  doc = backend.store.get(`schools/${sid}/classBooks/${cid}`);
  check(doc.namesClearedMs > 0 && doc.titles.find(x => x.b === sci.id).r === 1 && doc.titles.find(x => x.b === math.id).p === 1, 'Clear names: names gone, counts stay');
  await ev(t, () => closeBkModal());
  // last school year's sheet that still has names: erased by the custodian's phone
  const old = `2024-2025_${anaUid}`;
  backend.store.set(`schools/${sid}/classBooks/${old}`, { uid: anaUid, sy: '2024-2025', name: 'Ana Reyes', section: 'Grade 4 – Rizal', titles: [{ b: sci.id, t: sci.title, n: 2, r: 0 }], learners: [{ n: 'Old, Learner', s: { [sci.id]: 'r' } }, { n: 'Other, Learner', s: { [sci.id]: 'o' } }], updatedMs: Date.now(), createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }, updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } });
  await waitNode(() => !(backend.store.get(`schools/${sid}/classBooks/${old}`).learners || []).length, 12000);
  doc = backend.store.get(`schools/${sid}/classBooks/${old}`);
  check(!(doc.learners || []).length && doc.namesClearedMs > 0 && doc.titles[0].r === 1 && doc.titles[0].n === 2, 'after the school year: names erased automatically, counts kept (1 returned)');

  out('6 rules');
  check(await refused(t, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'classBooks')), sid), 'rules: a teacher can’t list every class');
  const unexpected = backend.denied.filter(d => !/classBooks|books|loan|bookMoves|member/.test(d));
  check(unexpected.length === 0, `no unexpected refusals ${JSON.stringify(unexpected).slice(0, 400)}`);
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('class-books');
}
