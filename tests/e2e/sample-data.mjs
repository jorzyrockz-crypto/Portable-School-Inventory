// More → Load sample data: sample items plus sample teachers (slips, counts, reports) to try the
// Teachers page; nothing about the sample teachers reaches the school's account; Clear sample
// data removes them and puts the sample items back as they were.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const cloudDocs = re => backend.docs('schools/').filter(d => re.test(d.path));
const names = page => ev(page, () => [...document.querySelectorAll('#tvList [data-tvrow]')].map(r => r.querySelector('.block.text-sm').textContent));

try {
  out('1 custodian signs in, one real teacher joins');
  const a = await openPhone('custodian', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'San Jose National High School'; rcSchoolNo.value = /\d{6}/.test(rcSchool.value) ? '' : String(300000 + [...rcSchool.value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 600000, 7)); rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await ev(a, () => closeInvite());
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  // a real item counted before the sample (must survive Clear)
  await ev(a, () => { const it = items.find(i => i.code === '44121708-MW-B01'); it.qty = 7; userState[it.code] = { ...(userState[it.code] || {}), qty: 7 }; const o = items.find(i => i.code === '14111507-PP-M02'); o.qty = 3; userState[o.code] = { ...(userState[o.code] || {}), qty: 3 }; saveStateWith({}); });

  out('2 More → Load sample data');
  await ev(a, () => openMoreMenu());
  await sleep(150);
  check(await ev(a, () => document.getElementById('moreSampleClear').classList.contains('hidden')), 'no Clear button before loading');
  await a.click('#moreSampleLoad');
  await until(a, () => !!sampleStore(), 'sample loaded', 5000);
  await sleep(300);
  await ev(a, () => openTeachersView());
  await sleep(300);
  const list = await names(a);
  check(['Ana Reyes', 'Ben Cruz', 'Carla Mendoza', 'Liza Ramos', 'Pedro Santos', 'A. Reyes'].every(n => list.includes(n)), `sample teachers listed (${list.join(', ')})`);
  const txt = await ev(a, () => document.getElementById('tvList').innerText);
  check((txt.match(/to confirm/g) || []).length === 1 && /1 to confirm/.test(txt) && /1 open/.test(txt) && /Counted \d{4}: 2 of 3/.test(txt) && /No account/.test(txt), 'to confirm, open reports, counted, no account');
  check(await ev(a, () => [...document.querySelectorAll('[data-tvcond]')].map(b => b.innerText).join(' ')).then(t => /for repair/.test(t) && /unserviceable/.test(t)), 'condition summaries link to the IIRUP');
  check(await ev(a, () => !!document.getElementById('tvUsageBtn') && !document.getElementById('tvUsageBtn').disabled), 'Supply usage has data');
  const inbox = await ev(a, () => { openTeachersView(null); return document.getElementById('tvReview').innerText; });
  check(/Ben Cruz.*counted their items/s.test(inbox) && /1 broken/.test(inbox) && /Carla Mendoza/.test(inbox) && /Marco Villanueva/.test(inbox), 'To review: Ben’s count (1 broken), Carla’s report, Marco wants to join');
  const ph = await ev(a, () => {
    const h1 = document.querySelector('#tvListTitle h1').getBoundingClientRect(), box = document.getElementById('tvReview').getBoundingClientRect(), search = document.getElementById('tvSearch').getBoundingClientRect();
    return { order: h1.bottom <= box.top && box.bottom <= search.top, row: document.getElementById('tvReviewRow').classList.contains('hidden'), oneLine: [...document.querySelectorAll('#tvListTitle .tv-acts > button')].every(b => b.getBoundingClientRect().height <= 44) };
  });
  check(ph.order && ph.row, 'phone: page title, then To review, then search and the list');
  check(ph.oneLine, 'phone: Print all · Supply usage · Release on one line each');
  // To review as cards in one row that swipes; the next card peeks in
  const row = await ev(a, () => {
    const track = document.getElementById('rvTrack'), cards = [...track.querySelectorAll('.rv-card')].map(c => c.getBoundingClientRect());
    return { n: cards.length, oneRow: cards.every(c => Math.abs(c.top - cards[0].top) < 2), sameH: cards.every(c => Math.abs(c.height - cards[0].height) < 2),
      peek: cards[1].left < innerWidth && cards[1].right > innerWidth, page: document.documentElement.scrollWidth <= innerWidth,
      kinds: [...track.querySelectorAll('.rv-card')].map(c => c.dataset.rv).join(','), pos: document.getElementById('rvPos').textContent, arrows: getComputedStyle(document.querySelector('.rv-arrows')).display };
  });
  check(row.n === 3 && row.oneRow && row.sameH, `phone: ${row.n} To review cards in one row, same height`);
  check(row.peek && row.page, 'phone: the next card peeks in; the page itself does not scroll sideways');
  check(row.kinds === 'join,count,problem' && row.pos === '1 of 3', `phone: join, count, report · “${row.pos}”`);
  check(row.arrows === 'none', 'phone: no arrow buttons (swipe)');
  await ev(a, () => { const t = document.getElementById('rvTrack'); t.scrollLeft = t.querySelectorAll('.rv-card')[1].offsetLeft - 16; });
  await sleep(300);
  check(await ev(a, () => document.getElementById('rvPos').textContent === '2 of 3' && document.querySelectorAll('#rvDots > span')[1].classList.contains('w-4')), 'phone: swiped → “2 of 3”, second dot');
  await ev(a, () => renderTeachersView());
  check(await ev(a, () => document.getElementById('rvTrack').scrollLeft > 100), 'phone: a refresh keeps the swipe position');
  await ev(a, () => openMoreMenu());
  check(await ev(a, () => !document.getElementById('moreSampleClear').classList.contains('hidden') && /loaded/.test(document.getElementById('moreSampleLoad').innerText)), 'More: “Sample data loaded” and Clear sample data');
  await ev(a, () => closeMoreMenu());

  out('2b the rest of the sample: requests, PRs, deliveries, suggestions, count, books, units');
  const s2 = await ev(a, () => {
    const units = allTaggedUnits(), life = lifeStats();
    return {
      req: reqList.filter(r => r.sample).map(r => r.status).sort().join(','),
      pr: prList.filter(p => p.sample).map(p => prApprStatus(p) + (p.deliveredMs ? '+delivered' : '')).sort().join(','),
      dlv: deliveries.filter(d => isSampleId(d.id)).map(d => `${d.kind}:${d.status}`).join(','),
      sug: sugList.filter(x => x.sample).map(x => x.status).join(','),
      banner: !document.getElementById('sugBanner').classList.contains('hidden'),
      count: !!(countSession && countSession.sample && Object.keys(countSession.counted).length),
      books: bk.books.filter(b => b.sample).length, loans: bk.loans.filter(l => l.sample).map(l => l.status).join(','), overdue: bk.loans.filter(l => l.sample && bkOverdue(l)).length,
      lost: units.filter(x => x.unit.lostMs).length, wo: getWrittenOff('43211507-DSK001').length, itr: releaseList.some(r => r.sample && r.kind === 'ITR'),
      past: life.past.length, soon: life.soon.length, renew: icsRenewDue().length, ink: items.find(i => i.code === '44103105-EP-C17').qty,
      reorder: reorderRows().map(x => x.item.code).includes('44103105-EP-C17')
    };
  });
  check(s2.req === 'approved,closed,declined,pending,pending,pr', `supply requests at each step (${s2.req})`);
  check(s2.pr === 'approved,approved+delivered,pending', `Purchase Requests: waiting for the head, approved, delivered (${s2.pr})`);
  check(s2.dlv === 'stockin:received,po:expected,stockin:received', `deliveries: from a PR, a PO expected, a donation (${s2.dlv})`);
  check(s2.sug === 'pending,accepted,declined' && s2.banner, `School Head suggestions + the banner on Inventory (${s2.sug})`);
  check(s2.count, 'a physical count half done');
  check(s2.books === 6 && s2.loans === 'out,out,requested,returned' && s2.overdue === 1, `books ${s2.books}, loans ${s2.loans}, ${s2.overdue} overdue`);
  check(s2.lost === 1 && s2.wo === 1 && s2.itr, 'a lost laptop, a written-off desktop, a transfer (ITR)');
  check(s2.past > 0 && s2.soon > 0 && s2.renew > 0, `useful life: ${s2.past} past, ${s2.soon} ending soon · ${s2.renew} ICS to renew`);
  check(s2.ink === 0 && s2.reorder, 'cyan ink out of stock, on the reorder list');
  await ev(a, () => openRequestsView());
  await sleep(300);
  const reqTxt = await ev(a, () => document.getElementById('reqViewBody').innerText);
  check(/Ana Reyes/.test(reqTxt) && /Carla Mendoza/.test(reqTxt), 'Supply requests page lists the sample requests');

  out('2c Item preview: Release becomes Transfer or return / Stock in');
  const mode = code => ev(a, c => { openItemPreview(c); return { mode: document.getElementById('isRelease').dataset.relMode, label: document.getElementById('isReleaseLabel').textContent }; }, code);
  const doc = await mode('45121517-DO-C02');
  check(doc.mode === 'transfer' && doc.label === 'Transfer or return', `both document cameras with someone: “${doc.label}”`);
  const lap = await mode('43211503-LAP001');
  check(lap.mode === 'release' && lap.label === 'Release', 'laptops with free units: Release');
  const ink = await mode('44103105-EP-C17');
  check(ink.mode === 'stockin' && ink.label === 'Stock in', `no cyan ink: “${ink.label}”`);
  await ev(a, () => { openItemPreview('45121517-DO-C02'); document.getElementById('isRelease').click(); });
  await until(a, () => !document.getElementById('pickModal').classList.contains('hidden'), 'whose');
  const whose = await ev(a, () => ({ title: document.getElementById('pickTitle').textContent, opts: [...document.querySelectorAll('#pickList [data-pick] .block.text-sm')].map(b => b.textContent) }));
  check(/Whose/.test(whose.title) && whose.opts.includes('Carla Mendoza') && whose.opts.includes('Pedro Santos'), `asks whose: ${whose.opts.join(', ')}`);
  const carlaKey = await ev(a, () => personId('sample-carla', 'Carla Mendoza'));
  await ev(a, k => document.querySelector(`#pickList [data-pick="${k}"]`).click(), carlaKey);
  await sleep(250);
  const acts = await ev(a, () => ({ title: document.getElementById('pickTitle').textContent, v: [...document.querySelectorAll('#pickList [data-pick]')].map(b => b.dataset.pick).join(',') }));
  check(/Carla Mendoza/.test(acts.title) && acts.v === 'transfer,back,stockin', `then: ${acts.v}`);
  await ev(a, () => document.querySelector('#pickList [data-pick="transfer"]').click());
  await until(a, () => !document.getElementById('xferModal').classList.contains('hidden'), 'transfer window');
  const xf = await ev(a, () => ({ from: xfer.fromKey, n: xfer.unitIds.size }));
  check(xf.from === carlaKey && xf.n === 1, 'Transfer opens with Carla’s document camera ticked');
  await ev(a, () => closeTransfer());
  await ev(a, () => { openItemPreview('45121517-DO-C02'); document.getElementById('isRelease').click(); });
  await until(a, () => !document.getElementById('pickModal').classList.contains('hidden'), 'whose 2');
  await ev(a, k => document.querySelector(`#pickList [data-pick="${k}"]`).click(), carlaKey);
  await sleep(250);
  await ev(a, () => document.querySelector('#pickList [data-pick="back"]').click());
  await sleep(500);
  check(await ev(a, () => sampleStore().releases.some(r => r.source === 'taken-back' && r.teacherName === 'Carla Mendoza')), 'Take back to stock: RRSP for Carla (kept with the sample)');
  check((await mode('45121517-DO-C02')).mode === 'release', 'one camera back in stock: Release again');
  await ev(a, () => { openItemPreview('44103105-EP-C17'); document.getElementById('isRelease').click(); });
  await until(a, () => !document.getElementById('pickModal').classList.contains('hidden'), 'stock in pick');
  check(await ev(a, () => [...document.querySelectorAll('#pickList [data-pick]')].map(b => b.dataset.pick).join(',')) === 'dlv,pr', 'Stock in: a delivery or a Purchase Request');
  await ev(a, () => document.querySelector('#pickList [data-pick="dlv"]').click());
  await sleep(400);
  check(await ev(a, () => !!(dlvState && dlvState.draft && dlvState.draft.lines[0].target === '44103105-EP-C17')), 'Stock in opens Deliveries with the cyan ink filled in');
  await ev(a, () => closeDeliveries(true));
  await sleep(200);

  out('3 trying things on the sample teachers stays on this phone');
  const ana = 'sample-ana';
  await ev(a, uid => openTeachersView(uid), ana);
  await sleep(200);
  const remindTxt = await ev(a, () => document.getElementById('tvRemind').innerText);
  check(/ICS SAMPLE-ICS-\d+ not confirmed for 12 days$/m.test(remindTxt), `Ana: “${remindTxt.split('\n')[0]}”`);
  await a.click('#tvRemindBtn');
  await sleep(300);
  check(await ev(a, () => sampleStore().releases.some(r => r.remindMs)), 'Remind recorded on the sample slip');
  await ev(a, () => { const x = tReports.find(r => r.kind === 'count' && r.sample); resolveTeacherReport(x.id, 'repair'); });
  await sleep(300);
  check(await ev(a, () => sampleStore().reports.find(r => r.kind === 'count').status === 'done'), 'Ben’s count answered (Mark broken for repair)');
  const liza = 'sample-liza';
  await ev(a, uid => { openTeachersView(uid); toggleClearance(uid); }, liza);
  await sleep(200);
  check(await ev(a, () => document.getElementById('tvClearance').dataset.clear) === 'ok', 'Liza: nothing left · cleared');
  await a.click('#tvCertBtn');
  await sleep(200);
  check(/CERTIFICATE OF NO PROPERTY ACCOUNTABILITY/.test(await ev(a, () => document.getElementById('printPrSection').innerText)), 'her certificate prints');
  const pedro = await ev(a, () => accountabilityPeople().find(p => p.name === 'Pedro Santos').key);
  await ev(a, k => { openTeachersView(k); toggleClearance(k); }, pedro);
  await sleep(150);
  await a.click('#tvTakeAll');
  await sleep(400);
  check(await ev(a, () => sampleStore().releases.some(r => r.source === 'taken-back' && r.teacherName === 'Pedro Santos')), 'Take back all: the RRSP stays with the sample');
  const areyes = await ev(a, () => accountabilityPeople().find(p => p.name === 'A. Reyes').key);
  await ev(a, k => openTeachersView(k), areyes);
  await sleep(150);
  await a.click('#tvMergeBtn');
  await sleep(200);
  await a.click(`#pickList [data-pick="${ana}"]`);
  await sleep(400);
  check(await ev(a, () => !accountabilityPeople().some(p => p.name === 'A. Reyes') && accountabilityPeople().find(p => p.key === 'sample-ana').equipment.length === 3), 'merge: “A. Reyes” → Ana Reyes (3 units)');
  // a sample request approved, the suggestion accepted, a loan returned: all on this phone
  await ev(a, () => { openReview('sample-req-1'); approveRequest(); });
  await sleep(300);
  check(await ev(a, () => sampleStore().requests.find(r => r.id === 'sample-req-1').status === 'approved'), 'approving a sample request stays with the sample');
  await ev(a, () => { openSugSheet(); return acceptSuggestion('sample-sug-1'); });
  await sleep(500);
  const sg = await ev(a, () => ({ st: sampleStore().suggestions.find(x => x.id === 'sample-sug-1').status, mop: items.find(i => i.code === '47121804-MP-B01').qty }));
  check(sg.st === 'accepted' && sg.mop === 5, `accepting the School Head’s suggestion (${sg.st}, mop ${sg.mop})`);
  await ev(a, () => { const s = document.getElementById('sugModal'); if (s && !s.classList.contains('hidden') && typeof closeSugSheet === 'function') closeSugSheet(); });
  await ev(a, () => bkPatch('loans', 'sample-ln-2', { status: 'returned', returnedMs: Date.now() }));
  await sleep(300);
  check(await ev(a, () => sampleStore().loans.find(l => l.id === 'sample-ln-2').status === 'returned'), 'returning a sample loan stays with the sample');
  await sleep(1500);
  const leaked = cloudDocs(/\/(releases|teacherReports|members|requests|purchaseRequests|suggestions|books|loans|bookMoves|approvals|inspections)\//).map(d => d.path);
  check(leaked.length === 0, `no sample requests, PRs, suggestions or books in the account (${leaked.join(', ')})`);
  check(await ev(a, () => !JSON.stringify(bk.indexDocs || {}).includes('Ampalaya')), 'the teachers’ library catalogue has no sample titles');
  check(cloudDocs(/\/(releases|teacherReports|members)\//).length === 0, `nothing about sample teachers in the account (${cloudDocs(/\/(releases|teacherReports|members)\//).map(d => d.path).join(', ')})`);
  check(await ev(a, () => !loadNotifs().items.some(n => /Ana Reyes|Ben Cruz|Carla|Liza/.test(n.title + n.body))), 'no notifications about sample teachers');

  out('4 Clear sample data');
  await ev(a, () => openMoreMenu());
  await a.click('#moreSampleClear');
  await until(a, () => !sampleStore(), 'cleared', 5000);
  await sleep(300);
  await ev(a, () => openTeachersView());
  await sleep(200);
  check(await ev(a, () => accountabilityPeople().length) === 0, 'Teachers page is empty again');
  check(await ev(a, () => releaseList.length === 0 && tReports.length === 0 && memberList.every(m => !m.sample)), 'no sample slips, reports or members left');
  const gone = await ev(a, () => ({ req: reqList.length, pr: prList.length, sug: sugList.length, dlv: deliveries.filter(d => isSampleId(d.id)).length, count: !!countSession, books: bk.books.filter(b => b.sample).length + bk.loans.filter(l => l.sample).length }));
  check(!gone.req && !gone.pr && !gone.sug && !gone.dlv && !gone.count && !gone.books, `no sample requests, PRs, suggestions, deliveries, count or books left (${JSON.stringify(gone)})`);
  const left = await ev(a, () => ({ dsk: items.find(i => i.code === '43211507-DSK001').qty, units: allTaggedUnits().length, mw: items.find(i => i.code === '44121708-MW-B01').qty, pp: items.find(i => i.code === '14111507-PP-M02').qty }));
  check(left.dsk === 0 && left.units === 0, `sample items back to how they were (desktops ${left.dsk}, tags ${left.units})`);
  check(left.mw === 7 && left.pp === 3, `items counted before the sample are back (markers ${left.mw}, bond paper ${left.pp})`);
  check(await ev(a, () => document.getElementById('moreSampleClear').classList.contains('hidden')), 'Clear button hidden again');
  await until(a, () => invStatus.state === 'synced', 'account updated', 10000);
  check(await ev(a, () => invStatus.state) === 'synced', 'the account has the cleared inventory');
  check(backend.denied.length === 0, `no refused writes (${backend.denied.length}) ${backend.denied.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('sample-data');
  await closeAll();
}
