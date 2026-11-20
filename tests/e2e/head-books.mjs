// Books on the School Head's Items tab (Nov 2026): the library catalogue, view only, so the head
// can tell during technical assistance (TA) whether there are enough references for a plan.
// A Books chip with the number of titles, kind chips, copies and free copies per title, a
// By subject summary, book matches when searching All, and the title sheet without Borrow.
import fs from 'fs';
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { waitNode, custodian, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const csv = '/tmp/head-books.csv';
fs.writeFileSync(csv, [
  'Title,Grade,Subject,Kind,ISBN,Copies,Unit cost',
  'English 5 Learner’s Material,Grade 5,English,,9786214060001,40,150',
  'English 5 Teacher’s Manual,5,English,TM,,2,180',
  'Science Encyclopedia for Kids,4,Science,Reference,,3,950',
].join('\n'));

try {
  out('1 the custodian lists the books');
  const { page: a, sid } = await custodian(backend);
  await ev(a, () => openBooksView());
  await ev(a, () => openBkImport());
  await (await a.$('#bkImportInput')).uploadFile(csv);
  await until(a, () => !!document.getElementById('bkImportOk'), 'preview');
  await ev(a, () => bkImportOk());
  await waitNode(() => (backend.store.get(`schools/${sid}/bookIndex/0`)?.items || []).length === 3, 12000);
  check(true, 'the teachers’ catalogue is published (3 titles)');

  out('2 the head opens Items · Books');
  const { page: h } = await schoolHead(backend, a, sid);
  await ev(h, () => setHeadTab('items'));
  await until(h, () => headInvLoaded, 'head inventory loaded', 10000);
  await until(h, () => bk.index.length === 3, 'head books loaded', 10000);
  await sleep(300);
  check(await ev(h, () => document.querySelector('[data-head-books-n]').textContent === '3'), 'the Books chip shows 3 titles');
  await ev(h, () => headItemsSetFilter('BOOKS'));
  check(await ev(h, () => document.querySelectorAll('[data-head-book]').length === 3), 'three titles in the list');
  check(await ev(h, () => /3 titles · 45 copies · 45 free/.test(document.querySelector('[data-head-books-count]').textContent)), 'summary: 3 titles · 45 copies · 45 free');
  check(await ev(h, () => document.querySelectorAll('[data-head-book-kind]').length === 4), 'kind chips: All kinds, Textbook, TM, Reference');
  check(await ev(h, () => !!document.querySelector('[data-head-book-areas]') && document.querySelectorAll('[data-head-book-area]').length === 2), 'By subject: English and Science');
  check(await ev(h, () => document.getElementById('hdItemsSearch').placeholder.includes('titles')), 'the search box asks for titles');

  out('3 filters and search');
  await ev(h, () => headBookSetKind('REF'));
  check(await ev(h, () => document.querySelectorAll('[data-head-book]').length === 1 && /Encyclopedia/.test(document.querySelector('[data-head-book]').textContent)), 'Reference only: the encyclopedia');
  await ev(h, () => headBookSetKind('ALL'));
  await ev(h, () => document.querySelector('[data-head-book-area="English"]').click());
  check(await ev(h, () => headItemsQ === 'English' && document.querySelectorAll('[data-head-book]').length === 2), 'tapping a subject shows its titles');
  await ev(h, () => { headItemsSearch(''); headItemsSetFilter('ALL'); });
  await ev(h, () => { const box = document.getElementById('hdItemsSearch'); box.value = 'encyclopedia'; headItemsSearch('encyclopedia'); });
  check(await ev(h, () => !!document.querySelector('[data-head-book-hits]') && document.querySelectorAll('[data-head-book]').length === 1), 'searching All also finds the book');
  await ev(h, () => { const box = document.getElementById('hdItemsSearch'); box.value = ''; headItemsSearch(''); });
  check(await ev(h, () => !document.querySelector('[data-head-book]')), 'All without a search: no books mixed into the items');

  out('4 a title opens view only');
  await ev(h, () => headItemsSetFilter('BOOKS'));
  await ev(h, () => document.querySelector('[data-head-book]').click());
  await until(h, () => bkSheet && bkSheet.view === 'lib', 'title sheet');
  check(await ev(h, () => !document.getElementById('libAskBtn') && /Where the copies are/.test(document.getElementById('bkModalBody').textContent)), 'the title sheet shows where the copies are, no Borrow');
  await ev(h, () => closeBkModal());

  out('5 a new title shows up on the head’s phone');
  await ev(a, () => openBkImport());
  fs.writeFileSync(csv, 'Title,Grade,Subject,Kind,ISBN,Copies,Unit cost\nMathematics 6 Learner’s Material,6,Mathematics,,,35,160\n');
  await (await a.$('#bkImportInput')).uploadFile(csv);
  await until(a, () => !!document.getElementById('bkImportOk'), 'preview 2');
  await ev(a, () => bkImportOk());
  await until(h, () => document.querySelectorAll('[data-head-book]').length === 4, 'the head sees 4 titles', 15000);
  check(await ev(h, () => document.querySelector('[data-head-books-n]').textContent === '4'), 'the Books chip now says 4');
  const writes = backend.denied.filter(d => /bookIndex|bookMeta/.test(d));
  check(!writes.length, `no refused book reads (${writes.length})`);
} catch (e) {
  out('crash', e.stack);
  check(false, 'suite crashed');
} finally {
  summary('head-books');
  await closeAll();
}
