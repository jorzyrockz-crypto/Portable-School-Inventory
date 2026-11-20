// Teachers page, Needs your attention (Nov 2026). On a computer, with nobody picked, the right
// side lists everyone with something due (lost units and relief days, slips not marked Received,
// asked back, old ICS / PAR, the count, repairs, overdue books, removed but still holding), most
// urgent first; tap a name to open them. A list row brings it back. Each person's page shows
// their own Needs attention card, on phones too.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const LAPTOP = '43211503-LAP001';

try {
  out('1 a school: Ana and Ben joined; laptops released to Ana, one lost, one on an old ICS, asked back');
  const { page: a, sid } = await custodian(backend);
  const { uid: ana } = await teacher(backend, sid, 'Ana Reyes');
  const { uid: ben } = await teacher(backend, sid, 'Ben Santos', 'Teacher I', 'Grade 2');
  await until(a, (x, y) => teacherRoster().filter(t => t.joined).length === 2, 'roster', 8000, ana, ben);
  await ev(a, (uid, l) => { openRelease({ teacherUid: uid, lines: [{ code: l, qty: 3 }], purpose: 'Grade 4' }); __fillSerials(); confirmRelease(); closeRelease(); }, ana, LAPTOP);
  await until(a, () => releaseList.length >= 1, 'release saved', 8000);
  await ev(a, l => {
    const held = getUnits(l).filter(u => u.toUid);
    held[0].lostMs = Date.now() - 25 * 864e5;
    held[1].icsDate = '2021-06-01';
    held[2].cond = 'U';
    saveState();
  }, LAPTOP);
  const asked = await ev(a, l => getUnits(l).filter(u => u.toUid)[1].id, LAPTOP);
  await ev(a, id => askUnitBack(id), asked);
  await until(a, id => !!unitAskBack(findUnitWithItem(id).unit), 'asked back', 8000, asked);

  out('2 the Teachers page on a computer: Needs your attention on the right');
  await ev(a, () => openTeachersView(null));
  await until(a, () => !!document.querySelector('[data-tvboard]'), 'board', 8000);
  const board = await ev(a, () => ({ n: document.querySelector('[data-tvboard]').dataset.tvboard, people: [...document.querySelectorAll('[data-tvboard-person]')].map(e => e.textContent.replace(/\s+/g, ' ').trim()) }));
  check(board.n === '1' && board.people.length === 1 && /Ana Reyes/.test(board.people[0]), `only Ana has something due (${board.n})`);
  check(/Lost: .+ 5 days left to apply for relief/.test(board.people[0]), 'lost first, with the days left to apply for relief');
  check(/\+ \d+ more/.test(board.people[0]), 'the top 3, then “+ N more”');
  const all = await ev(a, () => personAttention(accountabilityPeople().find(p => p.name === 'Ana Reyes'), true).map(x => x.key));
  check(['lost', 'unconf', 'askback', 'renew', 'unserv'].every(k => all.includes(k)), `Ana: ${all.join(', ')}`);
  check(await ev(a, () => !document.getElementById('tvBody').textContent.includes('Ben Santos')), 'Ben (nothing due) is not listed');
  check(await ev(a, () => /Or pick someone on the left/.test(document.getElementById('tvBody').textContent)), '“Or pick someone on the left” under it');
  check(await ev(a, () => getComputedStyle(document.querySelector('.tv-board')).gridTemplateColumns.split(' ').length >= 1), 'cards in a grid');

  await a.setViewport({ width: 1366, height: 820 });
  await sleep(300);
  await a.screenshot({ path: '/tmp/tv_board.png' });
  out('3 tap Ana: her page with her own Needs attention');
  await ev(a, () => document.querySelector('[data-tvboard-person]').click());
  await until(a, () => !!document.getElementById('tvPersonAtt'), 'person card', 8000);
  const card = await ev(a, () => [...document.querySelectorAll('#tvPersonAtt [data-tvatt-item]')].map(e => e.dataset.tvattItem));
  check(card.includes('lost') && card.includes('askback') && card.includes('renew') && card.includes('unserv'), `Ana’s card: ${card.join(', ')}`);
  check(!card.includes('unconf'), 'slips not marked Received stay in their own box (not repeated)');
  check(await ev(a, () => /IIRUP/.test(document.getElementById('tvPersonAtt').textContent)), 'unserviceable: take back for the IIRUP');

  await a.screenshot({ path: '/tmp/tv_person.png' });
  out('4 the list row brings the overview back');
  check(await ev(a, () => !!document.querySelector('[data-tvatt-row="1"]')), 'list: “Needs your attention · 1”');
  await ev(a, () => document.querySelector('[data-tvatt-row]').click());
  check(await ev(a, () => teachersSel === null && !!document.querySelector('[data-tvboard]')), 'back to the overview');

  out('5 everything resolved → All clear; Ben has nothing either');
  await ev(a, l => {
    getUnits(l).filter(u => u.toUid).forEach(u => { delete u.lostMs; delete u.icsDate; u.cond = 'S'; });
    releaseList = releaseList.map(r => ({ ...r, askBack: {} }));
    tReports = [...tReports, ...releaseList.map(r => ({ id: 'ack-' + r.id, kind: 'received', releaseId: r.id, uid: r.teacherUid, status: 'open' }))];
    saveState(); renderTeachersView();
  }, LAPTOP);
  await until(a, () => document.querySelector('[data-tvboard]')?.dataset.tvboard === '0', 'all clear', 8000);
  check(/All clear/.test(await ev(a, () => document.getElementById('tvBody').textContent)), 'All clear · nothing due for any teacher');
  check(await ev(a, () => document.getElementById('tvReviewRow').classList.contains('hidden')), 'no list row when nothing is due');

  out('6 a phone-width window: the person card shows, no overview');
  await ev(a, l => { getUnits(l).filter(u => u.toUid)[0].lostMs = Date.now() - 3 * 864e5; saveState(); }, LAPTOP);
  await a.setViewport({ width: 390, height: 844 });
  await sleep(300);
  await ev(a, () => { openTeachersView(null); });
  check(await ev(a, () => !sidebarLayout() && !document.querySelector('#tvBody [data-tvboard]')), 'phone: no overview on the list screen');
  await ev(a, () => openTeachersView(accountabilityPeople().find(p => p.name === 'Ana Reyes').key));
  check(await ev(a, () => /27 days left to apply for relief/.test((document.getElementById('tvPersonAtt') || {}).textContent || '')), 'phone: Ana’s Needs attention card');

  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('teachers-attention');
}
