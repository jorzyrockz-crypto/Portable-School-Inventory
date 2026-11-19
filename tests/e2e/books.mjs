// Books & Library: the custodian lists titles (counted copies, places with keepers, accession
// numbers for library books), issues textbooks to an adviser (Book Issuance List, "Received"),
// every teacher searches one Library (what is free, where), borrows from the library or from a
// teacher's room (the keeper answers), and a teacher can be made the Librarian (Library desk).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, openPhone, closeAll, summary, BASE_URL } from './lib/harness.mjs';
import { refused, waitNode, custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const col = (sid, name) => backend.docs(`schools/${sid}/${name}/`).filter(d => d.path.split('/').length === 4).map(d => ({ ...d, id: d.path.split('/').pop() }));
const year = String(new Date().getFullYear());

try {
  out('1 exploring (no account): books stay on this phone');
  const x = await openPhone('explorer', backend);
  await x.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(x, () => openBooksView());
  check(await ev(x, () => activeMainView === 'BOOKS' && !!document.querySelector('[data-bk-empty]')), 'Books page opens with an empty list');
  await ev(x, () => openBkTitleForm());
  await ev(x, () => { document.getElementById('bkf-title').value = 'Science 4 Learner’s Material'; document.getElementById('bkf-qty').value = '35'; document.querySelector('#bkf-grades [data-g="4"]').click(); });
  await ev(x, () => bkFormOk());
  await until(x, () => bkBooks().length === 1, 'title added');
  const local = await ev(x, () => JSON.parse(localStorage.getItem('custodian_books_local_v1') || '{}'));
  check(local.books && local.books[0].title === 'Science 4 Learner’s Material' && local.books[0].hold[0].n === 35 && local.books[0].grades[0] === '4', 'saved on the phone: title, 35 copies in the Supply room, Grade 4');
  check(await ev(x, () => bkSheet && bkSheet.view === 'title' && /Science 4/.test(document.querySelector('[data-bk-sheet-title]').textContent)), 'the title opens after adding');
  await ev(x, () => closeBkModal());

  out('2 the custodian lists books in the school');
  const { page: a, sid } = await custodian(backend);
  await ev(a, () => openBooksView());
  check(await ev(a, () => activeMainView === 'BOOKS' && !!document.querySelector('#tabBar [data-view="BOOKS"]')), 'Books & Library page (sidebar on a computer)');
  await ev(a, () => openBkTitleForm());
  await ev(a, () => { document.getElementById('bkf-title').value = 'Araling Panlipunan 4 Learner’s Material'; document.getElementById('bkf-qty').value = '30'; document.querySelector('#bkf-grades [data-g="4"]').click(); document.getElementById('bkf-area').value = 'Araling Panlipunan'; document.getElementById('bkf-cost').value = '120'; });
  await ev(a, () => bkFormOk());
  await ev(a, () => closeBkModal());
  await ev(a, () => openBkTitleForm(null, { kind: 'LF' }));
  check(await ev(a, () => document.getElementById('bkf-acc').checked && document.getElementById('bkf-lendable').checked), 'library fiction: numbered copies and lendable by default');
  await ev(a, () => { document.getElementById('bkf-title').value = 'Ang Alamat ng Ampalaya'; document.getElementById('bkf-qty').value = '3'; document.getElementById('bkf-author').value = 'Augie Rivera'; document.getElementById('bkf-isbn').value = '9789718585450'; });
  await ev(a, () => bkFormOk());
  await ev(a, () => closeBkModal());
  await ev(a, () => openBkTitleForm(null, { kind: 'BIG' }));
  await ev(a, () => { document.getElementById('bkf-title').value = 'Si Pagong at si Matsing (Big Book)'; document.getElementById('bkf-qty').value = '2'; });
  await ev(a, () => bkFormOk());
  await ev(a, () => closeBkModal());
  await waitNode(() => col(sid, 'books').length === 3);
  const lf = col(sid, 'books').find(b => b.kind === 'LF');
  check(lf && JSON.stringify(lf.accNos) === JSON.stringify([`LIB-${year}-0001`, `LIB-${year}-0002`, `LIB-${year}-0003`]) && lf.hold[0].p === 'storage', 'accession numbers LIB-YYYY-0001 to 0003, kept in the Supply room');
  // a duplicate (same ISBN) adds copies instead of a second title
  await ev(a, () => openBkTitleForm(null, { kind: 'LF' }));
  await ev(a, () => { document.getElementById('bkf-title').value = 'Alamat ng Ampalaya'; document.getElementById('bkf-qty').value = '1'; document.getElementById('bkf-isbn').value = '971-8585-45-7'; });
  await ev(a, () => bkFormOk());
  await waitNode(() => (col(sid, 'books').find(b => b.kind === 'LF') || {}).accNos?.length === 4);
  check(col(sid, 'books').length === 3 && col(sid, 'books').find(b => b.kind === 'LF').hold[0].n === 4, 'same ISBN (10-digit form): 1 copy added to the listed title, numbered 0004');
  await ev(a, () => closeBkModal());
  // a library place kept by nobody (the custodian / librarian lends)
  await ev(a, () => { setBkTab('places'); openBkPlaceForm(); });
  await ev(a, () => { document.getElementById('bkf-name').value = 'Library corner'; document.getElementById('bkf-kind').value = 'library'; });
  await ev(a, () => bkFormOk());
  await until(a, () => bkPlaces().some(p => p.name === 'Library corner'), 'place added');
  const libPlace = await ev(a, () => bkPlaces().find(p => p.name === 'Library corner').id);
  await ev(a, (p, id) => bkMoveCopies([{ b: id, n: 4 }], 'storage', p, { kind: 'move' }), libPlace, lf.id);
  await waitNode(() => (backend.store.get(`schools/${sid}/bookMeta/places`)?.places || []).some(p => p.name === 'Library corner'));
  check(true, 'places saved in the cloud (bookMeta/places)');
  await waitNode(() => ((backend.store.get(`schools/${sid}/bookIndex/0`)?.items || []).find(e => e.t === 'Ang Alamat ng Ampalaya') || { w: [[]] }).w[0][0] === libPlace, 10000);
  const idx = backend.store.get(`schools/${sid}/bookIndex/0`);
  const ie = (idx?.items || []).find(e => e.t === 'Ang Alamat ng Ampalaya');
  check(ie && ie.av === 4 && ie.w[0][0] === libPlace && ie.s === '9789718585450', 'the teachers’ catalogue (bookIndex/0): 4 free, in the Library corner, ISBN');

  out('3 teachers see the Library');
  const { page: t, uid: anaUid } = await teacher(backend, sid);
  const { page: u, uid: benUid } = await teacher(backend, sid, 'Ben Cruz', 'Teacher I', 'Grade 5');
  await ev(t, () => setTeacherTab('library'));
  await until(t, () => document.querySelectorAll('[data-lib-title]').length === 3, 'Ana sees 3 titles');
  check(await ev(t, () => /Library/.test(rqTitle.textContent) && !rqLibraryPane.classList.contains('hidden')), 'Library tab (4th tab)');
  check(await ev(t, () => { const c = k => (document.querySelector(`#libList [data-bk-kind-icon="${k}"]`) || {}).className || ''; return /bg-blue-50/.test(c('TX')) && /bg-violet-50/.test(c('LF')) && /bg-pink-50/.test(c('BIG')); }), 'each kind has its own colour (textbook blue, fiction violet, Big Book pink)');
  await ev(t, () => setLibQuery('ampalaya'));
  check(await ev(t, () => document.querySelectorAll('[data-lib-title]').length === 1 && /Library corner 4\/4/.test(document.getElementById('libList').textContent)), 'search: 1 match, “Library corner 4/4” (free/total)');
  check(await refused(t, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'books')), sid), 'rules: a teacher can’t read the books themselves (only the catalogue)');

  out('4 the custodian issues textbooks to Ana (Book Issuance List)');
  await until(a, uid => teacherRoster().some(r => r.uid === uid && r.joined), 'Ana on the roster', 8000, anaUid);
  const ap = col(sid, 'books').find(b => b.kind === 'TX');
  await ev(a, (id, uid) => { openBkIssue(id); bkIssueSet('teacher', uid); }, ap.id, anaUid);
  await ev(a, () => { document.querySelector('[data-bk-issue]').value = '28'; bkIssueOk(); });
  await waitNode(() => col(sid, 'bookMoves').some(m => m.kind === 'issue'));
  const mv = col(sid, 'bookMoves').find(m => m.kind === 'issue');
  check(mv.no === `BIL-${year}-0001` && mv.toUid === anaUid && mv.status === 'sent' && mv.lines[0].n === 28 && mv.to === `room-${anaUid}`, 'BIL-YYYY-0001: 28 copies to Ana’s room, waiting for Received');
  await waitNode(() => { const b = col(sid, 'books').find(x => x.kind === 'TX'); return b && b.hold.find(h => h.p === `room-${anaUid}`)?.n === 28 && b.hold.find(h => h.p === 'storage')?.n === 2; });
  check(true, 'the copies moved: 28 in Ana’s room, 2 left in the Supply room');
  await ev(a, id => bkPrintMove(id), mv.id);
  await sleep(300);
  check(await ev(a, () => window.__printed >= 1 && /BOOK ISSUANCE LIST/.test(printPrSection.textContent) && /ANA REYES/.test(printPrSection.textContent)), 'Book Issuance List prints');
  await until(t, () => !!document.querySelector('[data-bk-ack]'), 'Ana sees Received');
  check(await ev(t, () => loadNotifs().items.some(n => /Books issued to you/.test(n.title))), 'Ana is notified');
  await ev(t, () => document.querySelector('[data-bk-ack]').click());
  await waitNode(() => col(sid, 'bookMoves').find(m => m.kind === 'issue').status === 'done');
  const done = col(sid, 'bookMoves').find(m => m.kind === 'issue');
  check(done.receivedBy === 'Ana Reyes' && done.receivedMs > 0, 'Received: signed with Ana’s name and the time');
  check(await refused(t, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'bookMoves', id), { lines: [] }), sid, done.id), 'rules: the adviser can’t change the list');
  check(await refused(u, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'bookMoves')), sid), 'rules: Ben can’t list other teachers’ issuance lists');

  out('5 Ben borrows from the Library corner (no keeper: the custodian lends)');
  await ev(u, () => setTeacherTab('library'));
  await until(u, id => !!document.querySelector(`[data-lib-title="${id}"]`), 'Ben sees the book', 8000, lf.id);
  await ev(u, id => openLibTitle(id), lf.id);
  check(await ev(u, () => !!document.querySelector('[data-lib-borrow]')), 'Borrow form');
  await ev(u, () => { libQty.value = '1'; libNote.value = 'For reading time'; });
  await ev(u, id => libAsk(id), lf.id);
  await waitNode(() => col(sid, 'loans').length === 1);
  const ln = col(sid, 'loans')[0];
  check(ln.status === 'requested' && ln.borrowerUid === benUid && ln.keeperUid === '' && ln.placeId === libPlace, 'loan requested (no keeper: the custodian or the librarian answers)');
  await until(a, () => bk.loans.some(l => l.status === 'requested'), 'custodian sees the request');
  check(await ev(a, () => loadNotifs().items.some(n => /Ben Cruz asks to borrow/.test(n.title))), 'custodian notified');
  check(await refused(t, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'loans')), sid), 'rules: Ana can’t list all loans');
  await ev(a, () => { setBkTab('lending'); });
  await ev(a, id => document.querySelector(`[data-loan-lend="${id}"]`).click(), ln.id);
  await waitNode(() => col(sid, 'loans')[0].status === 'out');
  await until(u, () => loadNotifs().items.some(n => /You can get/.test(n.title)), 'Ben notified');
  check(true, 'lent: Ben notified');
  await waitNode(() => ((backend.store.get(`schools/${sid}/bookIndex/0`)?.items || []).find(e => e.t === 'Ang Alamat ng Ampalaya') || {}).av === 3, 10000);
  check(true, 'catalogue: 3 free now, and who borrowed it');
  await ev(u, () => closeBkModal());

  out('6 Ben borrows from Ana’s room (Ana is the keeper)');
  const big = col(sid, 'books').find(b => b.kind === 'BIG');
  await ev(a, (id, uid) => bkMoveCopies([{ b: id, n: 2 }], 'storage', `room-${uid}`, { kind: 'move' }), big.id, anaUid);
  await waitNode(() => ((backend.store.get(`schools/${sid}/bookIndex/0`)?.items || []).find(e => e.i === big.id) || {}).w?.[0]?.[0] === `room-${anaUid}`, 10000);
  await until(u, id => (libEntries().find(e => e.i === id) || {}).w?.[0]?.[0]?.startsWith('room-'), 'Ben’s catalogue updated', 8000, big.id);
  await ev(u, id => openLibTitle(id), big.id);
  check(await ev(u, () => /Ask Ana Reyes/.test(document.getElementById('bkModalBody').textContent)), '“Ask Ana Reyes” (the keeper of that room)');
  await ev(u, id => libAsk(id), big.id);
  await waitNode(() => col(sid, 'loans').length === 2);
  const l2 = col(sid, 'loans').find(l => l.bookId === big.id);
  check(l2.keeperUid === anaUid && l2.status === 'requested', 'request goes to Ana (keeperUid)');
  await until(t, () => !!document.querySelector('[data-loan-lend]'), 'Ana sees the request in her Library');
  check(await ev(t, () => loadNotifs().items.some(n => /Ben Cruz asks to borrow/.test(n.title)) && !rqLibDot.classList.contains('hidden')), 'Ana notified, dot on the Library tab');
  await ev(t, () => document.querySelector('[data-loan-lend]').click());
  await waitNode(() => col(sid, 'loans').find(l => l.bookId === big.id).status === 'out');
  check(true, 'Ana lends it');
  await until(u, id => bk.loans.some(l => l.bookId === id && l.status === 'out'), 'Ben sees it lent', 8000, big.id);
  await ev(u, () => closeBkModal());
  await ev(u, id => { renderTeacherLibrary(); document.querySelector(`[data-loan-said="${id}"]`).click(); }, l2.id);
  await waitNode(() => col(sid, 'loans').find(l => l.bookId === big.id).retSaidMs > 0);
  await until(t, () => !!document.querySelector('[data-loan-return]') && /says it is returned/.test(document.getElementById('rqLibraryPane').textContent), 'Ana sees “says it is returned”');
  await ev(t, () => document.querySelector('[data-loan-return]').click());
  await waitNode(() => col(sid, 'loans').find(l => l.bookId === big.id).status === 'returned');
  check(true, 'Ben says he returned it, Ana confirms: returned');
  check(await refused(t, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'loans', id), { status: 'returned' }), sid, ln.id), 'rules: Ana can’t answer a loan she doesn’t keep');
  check(await refused(u, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'loans', id), { status: 'returned' }), sid, ln.id), 'rules: the borrower can’t mark his own loan returned');

  out('7 a loan lost, prints');
  await ev(a, () => { setBkTab('lending'); });
  await until(a, id => !!document.querySelector(`[data-loan-lost="${id}"]`), 'Lost button', 8000, ln.id);
  await ev(a, id => document.querySelector(`[data-loan-lost="${id}"]`).click(), ln.id);
  await waitNode(() => col(sid, 'loans').find(l => l.id === ln.id).status === 'lost' && (col(sid, 'books').find(b => b.kind === 'LF') || {}).lost === 1, 10000);
  const lfNow = col(sid, 'books').find(b => b.kind === 'LF');
  check(lfNow.lost === 1 && lfNow.hold.find(h => h.p === libPlace).n === 3 && col(sid, 'loans').find(l => l.id === ln.id).appliedMs > 0, 'lost while borrowed: 1 off the count, on the Summary of Losses');
  for (const [fn, re] of [['bkPrintInventory("all")', /INVENTORY OF BOOKS/], ['bkPrintLoans("all")', /LOAN LEDGER/], ['bkPrintLosses()', /SUMMARY OF LOSSES/], ['bkPrintAccession()', /LIB-\d{4}-0004/]]) {
    await ev(a, f => { eval(f); }, fn);
    check(await ev(a, r => new RegExp(r).test(printPrSection.textContent), re.source), `prints: ${fn}`);
  }
  await ev(a, () => bkPrintSpine());
  await until(a, () => document.querySelectorAll('#printLabelsSection .qr-label').length === 4, 'spine labels');
  check(await ev(a, () => document.querySelectorAll('#printLabelsSection .qr-label').length === 4), 'QR spine labels for the 4 numbered copies');

  out('8 the Librarian');
  check(await refused(u, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'members', uid), { librarian: true }), sid, benUid), 'rules: a teacher can’t make themself the librarian');
  await ev(a, () => openBkLibrarian());
  await until(a, uid => !!document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-on]`), 'librarian list', 8000, benUid);
  await ev(a, uid => document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-on]`).click(), benUid);
  await waitNode(() => (backend.store.get(`schools/${sid}`).librarians || []).includes(benUid) && backend.store.get(`schools/${sid}/members/${benUid}`).librarian === true);
  check(true, 'Ben is the librarian (school.librarians + his member card)');
  await until(u, () => isLibrarianDevice() && bk.loaded && bk.books.length === 3, 'Ben’s phone: librarian, reads the books', 10000);
  check(await ev(u, () => !!document.getElementById('libDeskBtn')), 'Library desk on Ben’s Library tab');
  await ev(u, () => openBooksView());
  check(await ev(u, () => activeMainView === 'BOOKS' && !document.getElementById('bkIssueBtn') && !!document.getElementById('bkAddBtn') && !document.getElementById('bkTab-classes')), 'Library desk: add and lend; no issuing to classes, no Classes tab');
  await ev(u, () => openBkTitleForm(null, { kind: 'LN' }));
  await ev(u, () => { document.getElementById('bkf-title').value = 'Mga Halaman sa Paligid'; document.getElementById('bkf-qty').value = '2'; });
  await ev(u, () => bkFormOk());
  await waitNode(() => col(sid, 'books').some(b => b.title === 'Mga Halaman sa Paligid' && (b.accNos || []).length === 2));
  check(col(sid, 'books').find(b => b.title === 'Mga Halaman sa Paligid').accNos[0] === `LIB-${year}-0005`, 'the librarian adds a library book (next accession number, LIB-YYYY-0005)');
  check(await refused(u, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'inventory')), sid), 'rules: the librarian still can’t read the inventory');
  check(await refused(u, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'classBooks')), sid), 'rules: the librarian can’t read the class sheets (learner names)');
  await ev(u, () => switchMainView('REQUESTER'));
  await ev(a, () => closeBkModal());
  await ev(a, () => openBkLibrarian());
  await ev(a, uid => document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-off]`).click(), benUid);
  await until(u, () => !isLibrarianDevice(), 'Ben no longer the librarian', 8000);
  check(await refused(u, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'books')), sid), 'removed: Ben can’t read the books any more');
  await ev(a, () => closeBkModal());

  out('9 the School Head’s summary and the Home card');
  await ev(a, () => switchMainView('HOME'));
  check(await ev(a, () => !!document.querySelector('[data-home-books]') && /Books &amp; Library|Books & Library/.test(homeBooksCard.innerHTML)), 'Home: Books & Library card');
  check(await ev(a, () => { const d = dashSummary(); return d.books && d.books.t === 4 && d.books.o === 0; }), 'dashboard summary: books totals for the School Head');

  out('10 explored first: the books added on the phone go to the new account');
  await ev(x, () => { openRequestsView(); gateGo('custodian'); });
  await until(x, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(x, () => { rcSchool.value = 'Oquendo Annex'; rcSchoolNo.value = /\d{6}/.test(rcSchool.value) ? '' : String(300000 + [...rcSchool.value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 600000, 7)); rcEmail.value = 'annex@deped.gov.ph'; rcPass.value = 'secret12'; });
  await x.click('#rcCreate');
  await until(x, () => reqRole && reqRole.role === 'custodian', 'custodian connected', 10000);
  await ev(x, () => { try { closeInvite(); } catch (e) {} });
  const sid2 = await ev(x, () => reqRole.schoolId);
  await waitNode(() => col(sid2, 'books').length === 1, 12000);
  const up = col(sid2, 'books')[0];
  check(up && up.title === 'Science 4 Learner’s Material' && up.hold[0].n === 35 && x.dialogs.some(d => /Books on this phone/.test(d)), 'asked, then the title (35 copies) is saved to the new school');
  check(await ev(x, () => JSON.parse(localStorage.getItem('custodian_books_local_v1')).uploadedTo === reqRole.schoolId), 'asked only once for this school');

  out('denied:', backend.denied.filter(d => !/refused|permission/.test(d)).length);
  const unexpected = backend.denied.filter(d => !/books write|read books|list loans|loan update|bookMoves update|list bookMoves|member|read inventory|list classBooks|read classBooks/.test(d));
  check(unexpected.length === 0, `no unexpected refusals ${JSON.stringify(unexpected).slice(0, 400)}`);
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('books');
}
