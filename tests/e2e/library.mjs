// The Library, day to day: importing the division's delivery list, the custodian lending at the
// desk, a request declined or cancelled, an overdue reminder, a library corner kept by the
// librarian (requests go to them; when the librarian is removed they come back to the custodian),
// and unserviceable books disposed of with the School Head's approval.
import fs from 'fs';
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { refused, waitNode, custodian, teacher, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const col = (sid, name) => backend.docs(`schools/${sid}/${name}/`).filter(d => d.path.split('/').length === 4).map(d => ({ ...d, id: d.path.split('/').pop() }));
const csv = '/tmp/books-delivery.csv';
fs.writeFileSync(csv, [
  'Delivery list of learning resources,,,,,',
  'Title,Grade,Subject,Kind,ISBN,Copies,Unit cost',
  'English 5 Learner’s Material,Grade 5,English,,9786214060001,40,"₱ 150.00"',
  'English 5 Teacher’s Manual,5,English,TM,,2,180',
  'Ang Mahiwagang Tandang,K,,Fiction,,3,95',
  ',,,,,,',
].join('\n'));

try {
  out('1 the custodian imports the delivery list');
  const { page: a, sid } = await custodian(backend);
  await ev(a, () => openBooksView());
  await ev(a, () => openBkImport());
  const input = await a.$('#bkImportInput');
  await input.uploadFile(csv);
  await until(a, () => !!document.getElementById('bkImportOk'), 'preview');
  check(await ev(a, () => /3 titles · 45 copies/.test(document.getElementById('bkModalBody').textContent)), 'preview: 3 titles, 45 copies (heading row found under a banner line)');
  await ev(a, () => bkImportOk());
  await waitNode(() => col(sid, 'books').length === 3);
  const books = col(sid, 'books');
  const en = books.find(b => /Learner/.test(b.title)), tm = books.find(b => b.kind === 'TM'), lf = books.find(b => b.kind === 'LF');
  check(en && en.kind === 'TX' && en.grades[0] === '5' && en.cost === 150 && en.hold[0].n === 40 && en.area === 'English', 'textbook: Grade 5, English, ₱150.00, 40 copies');
  check(tm && tm.hold[0].n === 2 && lf && lf.grades[0] === 'K' && lf.acc && lf.accNos.length === 3, 'teacher’s manual (TM) and a Kindergarten library book with accession numbers');
  // importing the same file again adds copies, not titles
  await ev(a, () => openBkImport());
  await (await a.$('#bkImportInput')).uploadFile(csv);
  await until(a, () => !!document.getElementById('bkImportOk'), 'preview again');
  check(await ev(a, () => /3 titles already listed/.test(document.getElementById('bkModalBody').textContent)), 'second import: “3 titles already listed”');
  await ev(a, () => bkImportOk());
  await waitNode(() => (col(sid, 'books').find(b => /Learner/.test(b.title)) || {}).hold?.[0]?.n === 80);
  check(col(sid, 'books').length === 3, 'copies added: still 3 titles, 80 copies of the textbook');

  out('2 lending at the desk, a request declined, one cancelled');
  const { page: t, uid: anaUid } = await teacher(backend, sid);
  const { page: u, uid: benUid } = await teacher(backend, sid, 'Ben Cruz', 'Teacher I', 'Grade 5');
  await until(a, (x, y) => teacherRoster().filter(r => [x, y].includes(r.uid) && r.joined).length === 2, 'both on the roster', 8000, anaUid, benUid);
  await ev(a, id => openBkLend(id), lf.id);
  await sleep(100);
  await ev(a, uid => { document.getElementById('bkf-who').value = uid; document.getElementById('bkf-qty').value = '1'; document.getElementById('bkf-acc').value = 'lib-' + new Date().getFullYear() + '-0002'; }, anaUid);
  await ev(a, () => bkFormOk());
  await waitNode(() => col(sid, 'loans').length === 1);
  const desk = col(sid, 'loans')[0];
  check(desk.status === 'out' && desk.borrowerUid === anaUid && desk.acc[0] === `LIB-${new Date().getFullYear()}-0002` && desk.dueISO > desk.reqMs * 0 + '', 'lent at the desk: Ana, copy LIB-YYYY-0002, with a due date');
  await until(t, () => bk.loans.some(l => l.status === 'out'), 'Ana sees her loan');
  await ev(t, () => setTeacherTab('library'));
  check(await ev(t, () => /Return by|Due/.test(document.querySelector('[data-bk-mine]').textContent)), 'Ana: “My loans” with the due date');
  // a typed-in borrower (not on the roster)
  await ev(a, id => openBkLend(id), tm.id);
  await sleep(100);
  await ev(a, () => { document.getElementById('bkf-who').value = ''; document.getElementById('bkf-name').value = 'Juan Dela Cruz'; document.getElementById('bkf-section').value = 'PTA'; });
  await ev(a, () => bkFormOk());
  await waitNode(() => col(sid, 'loans').some(l => l.borrowerName === 'Juan Dela Cruz' && l.borrowerUid === ''));
  check(true, 'lent to someone without an account (name typed in)');
  // textbooks are not lent by default; the custodian allows it for this one
  check(await ev(a, id => libEntries().find(e => e.i === id).l === 0, en.id), 'textbooks: no Borrow button by default');
  await ev(a, id => openBkTitleForm(id), en.id);
  await ev(a, () => { document.getElementById('bkf-lendable').checked = true; });
  await ev(a, () => bkFormOk());
  await waitNode(() => col(sid, 'books').find(b => b.id === en.id).lendable === true);
  check(true, 'edit: “Teachers may borrow it” turned on');
  await ev(a, () => closeBkModal());
  // Ben asks for the textbook; the custodian declines with a reason
  await until(u, id => libEntries().some(e => e.i === id && e.l === 1), 'Ben’s catalogue', 20000, en.id);
  await ev(u, id => { setTeacherTab('library'); openLibTitle(id); }, en.id);
  await ev(u, () => { libQty.value = '5'; });
  await ev(u, id => libAsk(id), en.id);
  await waitNode(() => col(sid, 'loans').some(l => l.borrowerUid === benUid && l.qty === 5));
  const req = col(sid, 'loans').find(l => l.borrowerUid === benUid);
  a.dialogs.prompt = 'We are using them this week';
  await until(a, id => bk.loans.some(l => l.id === id), 'custodian sees the request', 8000, req.id);
  await ev(a, id => bkLoanDecline(id), req.id);
  await waitNode(() => col(sid, 'loans').find(l => l.id === req.id).status === 'declined');
  check(col(sid, 'loans').find(l => l.id === req.id).decidedNote === 'We are using them this week', 'declined, with the reason');
  await until(u, () => loadNotifs().items.some(n => /declined|not lent|can’t lend/i.test(n.title)), 'Ben notified', 8000);
  check(await ev(u, () => loadNotifs().items.some(n => /declined|not lent|can’t lend/i.test(n.title))), 'Ben is told (with the reason)');
  await ev(u, () => closeBkModal());
  // Ben asks again, then cancels
  await ev(u, id => openLibTitle(id), en.id);
  await ev(u, id => libAsk(id), en.id);
  await waitNode(() => col(sid, 'loans').filter(l => l.borrowerUid === benUid).length === 2);
  const req2 = col(sid, 'loans').find(l => l.borrowerUid === benUid && l.status === 'requested');
  await until(u, id => bk.loans.some(l => l.id === id), 'Ben sees his request', 8000, req2.id);
  await ev(u, id => bkLoanCancel(id), req2.id);
  await waitNode(() => col(sid, 'loans').find(l => l.id === req2.id).status === 'cancelled');
  check(true, 'Ben cancels his request');
  check(await refused(u, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'loans', id), { status: 'requested' }), sid, req2.id), 'rules: a cancelled request can’t be reopened by the borrower');
  check(await refused(u, (F, sid, uid) => F.setDoc(F.doc(F.collection(cloud.db, 'schools', sid, 'loans')), { bookId: 'x', title: 'x', qty: 1, status: 'out', borrowerUid: uid, keeperUid: '', placeId: 'storage' }), sid, benUid), 'rules: a teacher can’t record a loan as already lent to himself');
  await ev(u, () => closeBkModal());

  out('3 overdue');
  backend.store.set(`schools/${sid}/loans/${desk.id}`, { ...backend.store.get(`schools/${sid}/loans/${desk.id}`), dueISO: '2026-01-05', updatedMs: Date.now(), updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } });
  await until(t, id => (bk.loans.find(l => l.id === id) || {}).dueISO === '2026-01-05', 'Ana sees the due date', 8000, desk.id);
  await ev(t, () => notifBookDue());
  check(await ev(t, () => loadNotifs().items.some(n => /Please return/.test(n.title))), 'Ana: “Please return …”');
  await until(a, id => (bk.loans.find(l => l.id === id) || {}).dueISO === '2026-01-05', 'custodian sees the due date', 8000, desk.id);
  await ev(a, () => notifBookDue());
  check(await ev(a, () => loadNotifs().items.some(n => /overdue/.test(n.title))), 'custodian: “1 loan overdue”');
  check(await ev(a, () => bkStats().overdue.length === 1 && /overdue/i.test(document.getElementById('homeBooksCard').textContent + document.getElementById('bkView').textContent)), 'overdue count on the Books page');
  await ev(a, () => bkPrintLoans('overdue'));
  check(await ev(a, () => /OVERDUE/i.test(printPrSection.textContent) && /ANA REYES|Ana Reyes/.test(printPrSection.textContent)), 'overdue list prints');
  await ev(a, id => bkLoanReturn(id), desk.id);
  await waitNode(() => col(sid, 'loans').find(l => l.id === desk.id).status === 'returned');
  check(true, 'returned at the desk');

  out('4 a library corner kept by the librarian');
  await ev(a, () => openBkLibrarian());
  await until(a, uid => !!document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-on]`), 'librarian list', 8000, benUid);
  await ev(a, uid => document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-on]`).click(), benUid);
  await waitNode(() => (backend.store.get(`schools/${sid}`).librarians || []).includes(benUid));
  await ev(a, () => closeBkModal());
  await ev(a, () => { setBkTab('places'); openBkPlaceForm(); });
  await ev(a, uid => { document.getElementById('bkf-name').value = 'Reading corner'; document.getElementById('bkf-kind').value = 'library'; document.getElementById('bkf-keeper').value = uid; }, benUid);
  await ev(a, () => bkFormOk());
  await until(a, () => bkPlaces().some(p => p.name === 'Reading corner'), 'place');
  const corner = await ev(a, () => bkPlaces().find(p => p.name === 'Reading corner'));
  check(corner.keeperUid === benUid && corner.keeperName === 'Ben Cruz', 'Reading corner kept by Ben (the librarian)');
  await ev(a, (id, p) => bkMoveCopies([{ b: id, n: 3 }], 'storage', p, { kind: 'move' }), lf.id, corner.id);
  await until(u, () => isLibrarianDevice() && bk.loaded, 'Ben is the librarian', 10000);
  await until(t, (id, p) => (libEntries().find(e => e.i === id) || { w: [] }).w.some(w => w[0] === p), 'Ana’s catalogue shows the corner', 12000, lf.id, corner.id);
  await ev(t, id => openLibTitle(id), lf.id);
  check(await ev(t, () => /Ask Ben Cruz/.test(document.getElementById('bkModalBody').textContent)), 'Ana: “Ask Ben Cruz”');
  await ev(t, p => { libFrom.value = p; }, corner.id);
  await ev(t, id => libAsk(id), lf.id);
  await waitNode(() => col(sid, 'loans').some(l => l.borrowerUid === anaUid && l.status === 'requested'));
  const req3 = col(sid, 'loans').find(l => l.borrowerUid === anaUid && l.status === 'requested');
  check(req3.keeperUid === benUid && req3.placeId === corner.id, 'the request goes to Ben, who keeps the corner');
  await until(u, () => loadNotifs().items.some(n => /Ana Reyes asks to borrow/.test(n.title)), 'Ben notified', 8000);
  check(true, 'Ben is notified');
  // removing the librarian: the corner and the open request come back to the custodian
  await ev(t, () => closeBkModal());
  await ev(a, () => openBkLibrarian());
  await ev(a, uid => document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-off]`).click(), benUid);
  await waitNode(() => col(sid, 'loans').find(l => l.id === req3.id).keeperUid === '' && !(backend.store.get(`schools/${sid}/bookMeta/places`).places.find(p => p.name === 'Reading corner') || {}).keeperUid, 10000);
  check(col(sid, 'loans').find(l => l.id === req3.id).keeperUid === '', 'librarian removed: the open request and the corner go back to the custodian');
  await ev(a, () => closeBkModal());
  await until(a, id => (bk.loans.find(l => l.id === id) || {}).keeperUid === '', 'custodian sees it', 8000, req3.id);
  await ev(a, id => bkLoanLend(id), req3.id);
  await waitNode(() => col(sid, 'loans').find(l => l.id === req3.id).status === 'out');
  check(true, 'the custodian lends it');

  out('5 disposal with the School Head’s approval');
  await ev(a, (id) => openBkCondition(id, 'storage'), en.id);
  await ev(a, () => { document.getElementById('bkf-u').value = '4'; document.getElementById('bkf-d').value = '6'; });
  await ev(a, () => bkFormOk());
  await waitNode(() => (col(sid, 'books').find(b => b.id === en.id).hold.find(h => h.p === 'storage') || {}).u === 4);
  check(true, 'condition: 6 damaged, 4 unserviceable');
  await until(a, id => libEntries().find(e => e.i === id).av === 76, 'unserviceable copies are not counted as free', 8000, en.id);
  check(await ev(a, id => libEntries().find(e => e.i === id).av === 76, en.id), 'free copies: 80 − 4 unserviceable (damaged can still be read)');
  const { page: h } = await schoolHead(backend, a, sid);
  await ev(a, () => openBkDisposal());
  await until(a, () => !!document.getElementById('bkDispOk') && /Send to the School Head/.test(document.getElementById('bkDispOk').textContent), 'disposal sheet');
  await ev(a, () => bkDisposalOk(false));
  await waitNode(() => col(sid, 'approvals').some(x => x.kind === 'books' && x.status === 'pending'));
  const ap = col(sid, 'approvals').find(x => x.kind === 'books');
  check(ap.lines[0].qty === 4 && ap.lines[0].amount === 600 && ap.data.lines[0].b === en.id, 'sent to the head: 4 copies, ₱600.00');
  await until(h, () => document.querySelector('[data-head-ap][data-kind="books"]'), 'head sees it', 10000);
  check(await ev(h, () => !!document.querySelector('[data-head-ap][data-kind="books"]')), 'the head sees “Unserviceable books”');
  await ev(h, id => { headDecideAp(id, true); }, ap.id);
  await waitNode(() => col(sid, 'approvals').find(x => x.id === ap.id).appliedMs > 0, 12000);
  const enNow = col(sid, 'books').find(b => b.id === en.id);
  check(enNow.gone === 4 && enNow.hold.find(h => h.p === 'storage').u === 0 && enNow.hold.find(h => h.p === 'storage').n === 76, 'approved: 4 leave the count (disposed of), applied once');
  await ev(a, () => openBkDisposal());
  check(await ev(a, () => /No unserviceable/.test(document.getElementById('bkModalBody').textContent)), 'nothing left to dispose of');
  await ev(a, () => closeBkModal());
  await until(h, () => dashDoc && dashDoc.books && dashDoc.books.t === 3, 'head summary', 15000);
  check(await ev(h, () => dashDoc.books.t === 3 && dashDoc.books.o === 2 && /Books & Library/.test(document.querySelector('[data-dash-books]')?.textContent || '')), 'head: Books & Library in the summary (3 titles, 2 borrowed)');

  out('6 what a teacher can’t change');
  check(await refused(t, (F, sid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'bookMeta', 'places'), { places: [] }), sid), 'rules: a teacher can’t change the places');
  check(await refused(t, (F, sid) => F.setDoc(F.doc(cloud.db, 'schools', sid, 'bookIndex', '0'), { items: [] }), sid), 'rules: a teacher can’t change the catalogue');

  const unexpected = backend.denied.filter(d => !/books write|read books|list loans|loan|bookMoves|member|bookMeta|bookIndex|approvals|read classBooks|list classBooks/.test(d));
  check(unexpected.length === 0, `no unexpected refusals ${JSON.stringify(unexpected).slice(0, 400)}`);
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('library');
}
