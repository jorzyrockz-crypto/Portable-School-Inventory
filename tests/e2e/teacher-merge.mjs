// Teachers page clean-up:
//  · one teacher, two accounts (e.g. a personal and a DepEd Google account): "Same person as…"
//    on the account moves everything (units, slips, requests, reports) to the account kept;
//    the other card is marked removed, "merged into …";
//  · "Delete entirely": a teacher with no records at all is deleted, not just hidden; anyone
//    with records can't be (Remove keeps them, Same person as… moves them).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, ev, sleep, until, closeAll, summary } from './lib/harness.mjs';
import { waitNode, custodian, teacher, refused } from './lib/school-setup.mjs';

const backend = createBackend();
const col = (sid, c) => backend.docs(`schools/${sid}/${c}/`).filter(d => d.path.split('/').length === 4).map(d => ({ ...d, id: d.path.split('/').pop() }));
const member = (sid, uid) => backend.store.get(`schools/${sid}/members/${uid}`);
async function release(a, uid, lines) {
  await ev(a, (uid, lines) => openRelease({ teacherUid: uid, lines }), uid, lines);
  await sleep(200);
  await a.evaluate(() => __fillSerials());
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
}

try {
  out('1 a school: Ana joined twice (two Google accounts), Ben joined and has nothing');
  const { page: a, sid } = await custodian(backend);
  const P = '45111609-MM-P01';
  await ev(a, c => { openUnitsModal(c); generateUnitTags(); closeUnitsModal(); }, P);
  const { page: t1, uid: ana } = await teacher(backend, sid, 'Ana Reyes', 'Teacher III', 'Grade 4');
  const { page: t2, uid: dup } = await teacher(backend, sid, 'Reyes, Ana B.', 'Teacher III', 'Grade 4');
  const { page: tb, uid: ben } = await teacher(backend, sid, 'Ben Cruz', 'Teacher I', 'Grade 2');
  await until(a, (x, y, z) => [x, y, z].every(u => teacherRoster().some(r => r.uid === u && r.joined)), 'all three in the roster', 8000, ana, dup, ben);
  await release(a, ana, [{ code: P, qty: 1 }]);

  out('2 the second account has a request, a slip it confirmed, and a unit');
  const supply = await ev(a, () => items.find(x => x.type === 'CONSUMABLE' && x.qty >= 8 && !relIsEquip(x)).name);
  await ev(t2, w => { openRequestForm(); document.getElementById('rfSearch').value = w; addReqLine(); reqDraft.lines[0].qty = 2; sendRequest(); }, supply);
  await until(a, u => reqList.some(r => r.uid === u && !r.sending), 'custodian gets the request', 10000, dup);
  await release(a, dup, [{ code: P, qty: 1 }]);
  await until(t2, () => myReleases.length === 1, 'second account sees the ICS', 8000);
  await ev(t2, () => ackRelease(myReleases[0].id));
  await until(a, u => tReports.some(x => x.kind === 'received' && x.uid === u), 'the receipt arrives', 8000, dup);
  const dupRel = await ev(a, u => releaseList.find(r => r.teacherUid === u).id, dup);
  const dupUnit = await ev(a, (c, u) => getUnits(c).find(x => x.toUid === u).id, P, dup);
  // …and books: a loan, a room they keep, a class sheet
  await ev(a, u => {
    bkPut('loans', { id: 'ln-merge', bookId: 'bk-x', title: 'Science 4', qty: 1, status: 'out', borrowerUid: u, borrowerName: 'Reyes, Ana B.', keeperUid: '', keeperName: '' }, true);
    bkPutMeta({ places: [...bkPlaces(), { id: `room-${u}`, name: 'Grade 4 – Sampaguita', kind: 'room', keeperUid: u, keeperName: 'Reyes, Ana B.' }] });
    bkPut('classBooks', { id: `2026-2027_${u}`, sy: '2026-2027', uid: u, name: 'Reyes, Ana B.', section: 'Sampaguita', size: 30, titles: [], learners: [] }, true);
  }, dup);
  await waitNode(() => !!backend.store.get(`schools/${sid}/classBooks/2026-2027_${dup}`) && !!backend.store.get(`schools/${sid}/loans/ln-merge`));

  out('3 Delete entirely: only for a teacher with no records');
  await ev(a, u => openTeachersView(u), ana);
  await sleep(200);
  check(await ev(a, () => !document.getElementById('tvDeleteMember')), 'Ana (has items): no Delete entirely');
  await ev(a, u => openTeachersView(u), dup);
  await sleep(200);
  check(await ev(a, () => !document.getElementById('tvDeleteMember')), 'the second account (has a slip, a request): no Delete entirely');
  await ev(a, u => openTeachersView(u), ben);
  await sleep(200);
  check(await ev(a, () => !!document.getElementById('tvDeleteMember')), 'Ben (nothing at all): Delete entirely');
  await a.click('#tvDeleteMember');
  await waitNode(() => !member(sid, ben));
  check(!member(sid, ben), 'Ben’s card is deleted from the cloud');
  check(a.dialogs.some(d => /Delete Ben entirely/.test(d) || /no slips, items, requests, reports or books/.test(d)), 'asked first: nothing is lost');
  check(await ev(a, u => !teacherRoster().some(r => r.uid === u) && !accountabilityPeople().some(p => p.uid === u) && teachersSel !== u, ben), 'Ben is gone from Teachers');
  check(await ev(a, u => !removedMembers().some(m => m.uid === u), ben), '…and not under “Removed from the school”');
  // His phone was open: it does not make the card again by itself, it says so.
  await until(tb, () => myMemberStatus() === 'deleted', 'Ben’s phone: deleted', 8000);
  await sleep(1200);
  check(!member(sid, ben), 'Ben’s phone does not put his card back by itself');
  check(await ev(tb, () => /rqDeleted/.test(teacherStatusBanner()) && /Ask to join again/.test(teacherStatusBanner())), 'Ben’s phone: “Your name was deleted from …” with Ask to join again');
  check(await ev(tb, () => loadNotifs().items.some(n => /Your name was deleted/.test(n.title))), 'Ben’s phone: a notification');
  await tb.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  check(!member(sid, ben) && await ev(tb, () => myMemberStatus() === 'deleted'), 'still deleted after he opens the app again');
  check(await ev(tb, () => !teacherMayAct()), 'he can’t send requests');
  await ev(tb, () => askToJoinAgain());
  await waitNode(() => !!member(sid, ben), 8000);
  check(!!member(sid, ben) && member(sid, ben).name === 'Ben Cruz', 'Ask to join again: a new join request (the custodian approves it)');

  out('4 Same person as… on an account: pick the account to keep');
  await ev(a, u => openTeachersView(u), dup);
  await sleep(200);
  check(await ev(a, () => !!document.getElementById('tvMergeBtn')), 'Same person as… on an account');
  await a.click('#tvMergeBtn');
  await sleep(250);
  const picks = await ev(a, () => [...document.querySelectorAll('#pickList [data-pick]')].map(b => b.dataset.pick));
  check(picks.includes(ana) && picks.every(k => !k.startsWith('n:')) && !picks.includes(dup), `only other accounts to pick (${picks.length})`);
  check(await ev(a, () => /Pick the account to KEEP/.test(document.getElementById('pickModal').textContent)), 'the picker says: pick the account to keep');
  await a.click(`#pickList [data-pick="${ana}"]`);
  await until(a, u => teachersSel === u, 'Ana’s page after the merge', 5000, ana);
  check(a.dialogs.some(d => /Merge “Reyes, Ana B\.” into Ana Reyes/.test(d) || /under “Reyes, Ana B\.” move to Ana Reyes/.test(d)), 'asked first: what moves');

  out('5 everything moved to Ana');
  await waitNode(() => (member(sid, dup) || {}).mergedInto === ana);
  const r = col(sid, 'releases').find(x => x.id === dupRel);
  check(r.teacherUid === ana && r.teacherName === 'Ana Reyes' && r.mergedFromUid === dup && r.mergedFrom === 'Reyes, Ana B.', 'the ICS: now Ana’s (mergedFrom kept)');
  check(col(sid, 'requests').filter(x => x.uid === dup).length === 0 && col(sid, 'requests').some(x => x.uid === ana && x.mergedFrom === dup && x.name === 'Ana Reyes'), 'the request: now Ana’s');
  check(col(sid, 'teacherReports').every(x => x.uid !== dup) && col(sid, 'teacherReports').some(x => x.uid === ana && x.kind === 'received' && x.releaseId === dupRel), 'the receipt: now Ana’s (still confirmed)');
  check(await ev(a, (c, id, u) => { const x = getUnits(c).find(y => y.id === id); return x.toUid === u && x.to === 'Ana Reyes'; }, P, dupUnit, ana), 'the unit: assigned to Ana’s account');
  const m = member(sid, dup);
  check(m.status === 'removed' && m.mergedIntoName === 'Ana Reyes' && m.mergedMs > 0, 'the second card: removed, “merged into Ana Reyes”');
  await waitNode(() => !backend.store.get(`schools/${sid}/classBooks/2026-2027_${dup}`) && (backend.store.get(`schools/${sid}/loans/ln-merge`) || {}).borrowerUid === ana);
  check((backend.store.get(`schools/${sid}/loans/ln-merge`) || {}).borrowerUid === ana, 'books: the loan is now Ana’s');
  check(((backend.store.get(`schools/${sid}/bookMeta/places`) || {}).places || []).some(x => x.id === `room-${dup}` && x.keeperUid === ana && x.keeperName === 'Ana Reyes'), 'books: Ana keeps the room');
  const cls = backend.store.get(`schools/${sid}/classBooks/2026-2027_${ana}`);
  check(cls && cls.uid === ana && cls.section === 'Sampaguita' && !backend.store.get(`schools/${sid}/classBooks/2026-2027_${dup}`), 'books: the class sheet is now Ana’s (the old one deleted)');
  check(await ev(a, u => !accountabilityPeople().some(p => p.uid === u), dup), 'only one Ana on Teachers');
  check(await ev(a, () => { const p = accountabilityPeople().find(x => x.name === 'Ana Reyes'); return p.equipment.length === 2 && p.toConfirm.length === 1; }), 'Ana: 2 units, only her own ICS still to confirm');
  const gone = await ev(a, () => { const d = document.getElementById('tvRemoved'); return d ? d.textContent : ''; });
  check(/merged into Ana Reyes/.test(gone) && !/Add back/.test(gone.split('merged into Ana Reyes')[1] || ''), 'Removed list: “merged into Ana Reyes”, no Add back');

  out('6 the phones');
  await until(t1, () => myReleases.length === 2 && teacherHoldings(myReleases).equipment.length === 2, 'Ana’s My Items: both units', 10000);
  check(await ev(t1, () => teacherHoldings(myReleases).equipment.length) === 2, 'Ana’s phone: both units under My Items');
  await until(t1, () => reqList.length === 1, 'Ana’s phone: the request', 8000);
  check(await ev(t1, () => reqList.length) === 1, 'Ana’s phone: the request from the other account');
  await sleep(500);
  check(await ev(t1, () => { const no = myReleases.find(r => r.mergedFromUid).no; return !loadNotifs().items.some(n => /New items released/.test(n.title) && n.body.includes(no)); }), 'Ana’s phone: no “New items released” for the slip from her other account');
  await until(t2, () => loadNotifs().items.some(n => /Removed from/.test(n.title)), 'the other phone is told', 10000);
  check(await ev(t2, () => loadNotifs().items.some(n => /Removed from/.test(n.title) && /other account \(Ana Reyes\)/.test(n.body))), 'the other phone: “Your records moved to your other account (Ana Reyes)”');

  out('7 the merged card has no records left: Delete entirely');
  check(await ev(a, u => canDeleteMember(u), dup), 'the merged card can be deleted');
  await ev(a, () => { const d = document.getElementById('tvRemoved'); if (d) d.open = true; });
  await ev(a, u => document.querySelector(`[data-tvdelete="${u}"]`).click(), dup);   // the toast can sit over it
  await waitNode(() => !member(sid, dup));
  check(!member(sid, dup), 'deleted');

  out('8 rules');
  check(await refused(t1, (F, s, u) => F.updateDoc(F.doc(F.collection(cloud.db, 'schools', s, 'requests'), u), { uid: 'x', mergedFrom: cloud.user.uid }), sid,
    col(sid, 'requests').find(x => x.uid === ana).id), 'a teacher can’t move a request (mergedFrom is custodian only)');
  check(await refused(t1, (F, s, u) => F.deleteDoc(F.doc(F.collection(cloud.db, 'schools', s, 'members'), u)), sid, ana), 'a teacher can’t delete a card');
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('teacher-merge');
}
