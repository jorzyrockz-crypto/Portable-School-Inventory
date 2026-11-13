// Teachers who join wait for the custodian's Approve; the custodian can edit or remove them and
// make a new invite link. Approved teachers see the supplies left (School stock) and can record
// "I took this", which lowers the stock for everyone until the custodian confirms it with an RIS.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { screen } from './lib/layout.mjs';
const SHOTS = process.env.SHOTS || '/tmp';

const backend = createBackend({ autoApprove: false });
const docs = re => backend.docs('schools/').filter(d => re.test(d.path));
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
async function openJoinLink(page, code) {
  await page.goto(BASE_URL + '#join=' + code, { waitUntil: 'networkidle0' });
  await until(page, () => !document.getElementById('joinModal').classList.contains('hidden') && (!document.getElementById('joinBtn').disabled || !document.getElementById('joinError').classList.contains('hidden')), 'join sheet');
}
async function joinAsTeacher(page, code, name, position, office) {
  await openJoinLink(page, code);
  await ev(page, (n, p, o) => { joinName.value = n; joinPosition.value = p; joinOffice.value = o; }, name, position, office);
  await page.click('#joinBtn');
  await until(page, () => reqRole && reqRole.role === 'teacher' && cloud.user && myMemberLoaded, 'joined');
  return ev(page, () => cloud.user.uid);
}
const PAPER = '14111507-PP-M02', ALCOHOL = '12191601-AL-E04';
const stockDoc = code => docs(new RegExp(`/stock/${code}$`))[0];
const leftOn = (page, code) => ev(page, c => { const el = document.querySelector(`[data-stock="${c}"] [data-left]`); return el ? +el.textContent : null; }, code);

try {
  out('1 custodian (School ID in the name), supplies published for teachers');
  const a = await openPhone('custodian', backend);
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = '114656 - San Jose National High School'; rcEmail.value = 'rosa@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian');
  await until(a, () => inventorySyncActive() && invStatus.state === 'synced', 'synced', 10000);
  await ev(a, async () => { closeInvite(); await loadSampleInventory({ quiet: true }); schoolInfo.school = '114656 - San Jose National High School'; schoolInfo.custodian = 'Rosa Villanueva'; localStorage.setItem(SCHOOL_KEY, JSON.stringify(schoolInfo)); });
  const sid = await ev(a, () => reqRole.schoolId);
  await waitNode(() => stockDoc(PAPER) && stockDoc(PAPER).qty === 85, 'stock published', 10000);
  const paper = stockDoc(PAPER);
  check(paper && paper.qty === 85 && paper.unit && !('price' in paper) && !docs(/\/stock\/43211507-DSK001$/).length, `supplies published: bond paper ${paper && paper.qty} ${paper && paper.unit}, no prices, no equipment`);
  await ev(a, () => openInvite());
  await sleep(300);
  check(await ev(a, () => document.getElementById('inviteSchoolNo').textContent) === 'School ID 114656', 'invite sheet: School ID 114656');
  await waitNode(() => backend.store.get(`schools/${sid}`).schoolNo === '114656', 'school no');
  await ev(a, () => closeInvite());

  out('2 a teacher joins → waits for approval');
  const t = await openPhone('teacher-ana', backend);
  await openJoinLink(t, sid);
  check(await ev(t, () => document.getElementById('joinSchoolNo').textContent) === 'School ID 114656', 'join sheet shows “School ID 114656”');
  await ev(t, () => { joinName.value = 'Ana Reyes'; joinPosition.value = 'Teacher III'; joinOffice.value = 'Grade 7 – Science'; });
  await t.click('#joinBtn');
  await until(t, () => reqRole && cloud.user && myMemberLoaded && myMember, 'joined');
  const ana = await ev(t, () => cloud.user.uid);
  await waitNode(() => (backend.store.get(`schools/${sid}/members/${ana}`) || {}).status === 'pending', 'pending card');
  check((backend.store.get(`schools/${sid}/members/${ana}`) || {}).status === 'pending', 'her card is “pending”');
  await until(t, () => !!document.getElementById('rqPending'), 'banner', 5000);
  check(await ev(t, () => /Waiting for approval/.test(document.getElementById('rqStatus').innerText)), 'teacher: “Waiting for approval”');
  await screen(t, 'phone · waiting for approval');
  await ev(t, () => openRequestForm());
  await sleep(200);
  check(await ev(t, () => document.getElementById('reqFormModal').classList.contains('hidden')) && t.dialogs.some(d => /not approved you yet/.test(d)), 'New supply request: “not approved yet”');
  await ev(t, () => setTeacherTab('stock'));
  check(await ev(t, () => /Waiting for approval/.test(document.getElementById('rqStockPane').innerText)), 'Stock tab: waiting too (nothing read before approval)');

  out('3 custodian approves on the Teachers page');
  await until(a, uid => memberList.some(m => m.uid === uid), 'member seen', 8000, ana);
  await ev(a, () => switchMainView('HOME'));
  await sleep(200);
  check(await ev(a, () => !document.getElementById('homeTeachCard').classList.contains('hidden') && /1 wants to join/.test(document.getElementById('homeTeachSub').textContent)), 'Home: “Teachers · 1 to review · 1 wants to join”');
  check(await ev(a, uid => !teacherRoster().some(x => x.uid === uid), ana), 'not on the roster (cannot be released to) yet');
  await ev(a, () => openTeachersView(null));
  await sleep(200);
  check(await ev(a, () => /Wants to join/i.test(document.getElementById('tvReview').innerText) && /Ana Reyes/.test(document.getElementById('tvReview').innerText)), 'To review: “Wants to join · Ana Reyes”');
  await screen(a, 'phone · Teachers · To review');
  await a.screenshot({ path: SHOTS + '/e2e_ms_review.png' });
  await a.click(`[data-tvjoin="${ana}"] button`);
  await waitNode(() => (backend.store.get(`schools/${sid}/members/${ana}`) || {}).status === 'active', 'approved');
  check((backend.store.get(`schools/${sid}/members/${ana}`) || {}).status === 'active', 'approved: “active”');
  await until(t, () => stockLoaded && !!document.querySelector('[data-stock]'), 'stock on the teacher', 8000);
  check(await ev(t, () => loadNotifs().items.some(n => /You’re in/.test(n.title))), 'teacher told: “You’re in!”');
  check(await leftOn(t, PAPER) === 85, 'teacher sees 85 reams of bond paper left');
  await screen(t, 'phone · School stock');
  await t.screenshot({ path: SHOTS + '/e2e_ms_stock.png' });
  await ev(t, () => setStockFilter('low'));
  check(await ev(t, () => [...document.querySelectorAll('[data-stock]')].every(x => /Low|Out/.test(x.innerText))), 'Low / out filter');
  await ev(t, () => setStockFilter('all'));
  await ev(t, c => requestFromStock(c), ALCOHOL);
  await sleep(300);
  check(await ev(t, c => !document.getElementById('reqFormModal').classList.contains('hidden') && reqDraft.lines.some(l => l.code === c), ALCOHOL), 'Request on a stock line opens the form with that item');
  await ev(t, () => { closeRequestForm(); setTeacherTab('stock'); });
  await ev(t, () => setStockQuery('alcohol'));
  check(await ev(t, c => [...document.querySelectorAll('[data-stock]')].every(x => /alcohol/i.test(x.innerText)) && !!document.querySelector(`[data-stock="${c}"]`), ALCOHOL), 'search “alcohol”');
  await ev(t, () => setStockQuery(''));

  out('4 a second teacher (approved) and “I took this”');
  const b = await openPhone('teacher-ben', backend);
  const ben = await joinAsTeacher(b, sid, 'Ben Cruz', 'Teacher I', 'Grade 10 – Mathematics');
  await until(a, uid => pendingMembers().some(m => m.uid === uid), 'Ben pending', 8000, ben);
  await ev(a, uid => approveMember(uid), ben);
  await until(b, c => !!document.querySelector(`[data-stock="${c}"]`) || (setTeacherTab('stock'), false), 'Ben stock', 10000, PAPER);
  await ev(t, c => openTook(c), PAPER);
  await sleep(150);
  await ev(t, () => { stepTook(1); document.getElementById('tkNote').value = 'Grade 7 quiz papers'; });
  check(await ev(t, () => /85 .* left · after this: 83/.test(document.getElementById('tkLeft').textContent)), 'sheet: “85 left · after this: 83”');
  await screen(t, 'phone · I took this');
  await t.screenshot({ path: SHOTS + '/e2e_ms_took.png' });
  await t.click('#tkSave');
  await sleep(300);
  check(await leftOn(t, PAPER) === 83, 'Ana’s phone: 83 left at once');
  await waitNode(() => docs(/\/stockHolds\//).some(d => d.status === 'open'), 'hold online');
  await until(b, c => { const el = document.querySelector(`[data-stock="${c}"] [data-left]`); return el && el.textContent === '83'; }, 'Ben sees 83', 8000, PAPER);
  check(await leftOn(b, PAPER) === 83, 'Ben’s phone: 83 left (2 taken · waiting)');
  check(/2 taken/.test(await ev(b, c => document.querySelector(`[data-stock="${c}"]`).innerText, PAPER)), 'Ben sees “2 taken · waiting for the custodian to confirm”');
  await ev(t, () => setTeacherTab('requests'));
  check(/You took this/.test(await ev(t, () => document.getElementById('rqList').innerText)), 'Ana’s requests: “You took this · waiting”');

  out('5 custodian confirms → RIS, stock follows');
  await until(a, () => reqList.some(r => r.kind === 'took'), 'took request', 8000);
  await ev(a, () => { openRequestsView(); setReqTab('pending'); });
  await sleep(200);
  check(/Took it/.test(await ev(a, () => document.getElementById('reqViewBody').innerText)), 'Supply requests: “Ana Reyes · Took it”');
  check(await ev(a, () => loadNotifs().items.some(n => /took supplies/.test(n.title))), 'custodian notified: “Ana Reyes took supplies · confirm”');
  await a.click('[data-took-confirm]');
  await until(a, () => !document.getElementById('releaseModal').classList.contains('hidden'), 'release sheet');
  await a.click('#relSaveBtn');
  await until(a, () => !!releaseDone, 'released');
  await ev(a, () => closeRelease());
  await waitNode(() => docs(/\/releases\//).some(d => d.kind === 'RIS' && d.teacherUid === ana), 'RIS');
  check(docs(/\/releases\//).some(d => d.kind === 'RIS' && d.teacherUid === ana && d.lines[0].qty === 2), 'RIS for Ana · 2 reams');
  await waitNode(() => stockDoc(PAPER).qty === 83 && docs(/\/stockHolds\//).every(d => d.status !== 'open'), 'stock 83, hold done');
  check(stockDoc(PAPER).qty === 83 && docs(/\/stockHolds\//)[0].status === 'done', 'stock now 83 · the hold is done');
  await until(b, c => { const el = document.querySelector(`[data-stock="${c}"]`); return el && /83/.test(el.querySelector('[data-left]').textContent) && !/taken/.test(el.innerText); }, 'Ben 83 settled', 8000, PAPER);
  check(await leftOn(b, PAPER) === 83, 'Ben still sees 83 (not 81)');

  out('6 “I didn’t take it after all” puts it back');
  await ev(t, () => setTeacherTab('stock'));
  await ev(t, c => { openTook(c); }, ALCOHOL);
  await t.click('#tkSave');
  await waitNode(() => docs(/\/stockHolds\//).some(d => d.status === 'open'), 'second hold');
  await until(t, () => reqList.some(r => r.kind === 'took' && r.status === 'pending' && !r.sending), 'second took', 8000);
  await ev(t, () => cancelMyRequest(reqList.find(r => r.kind === 'took' && r.status === 'pending').id));
  await waitNode(() => docs(/\/stockHolds\//).every(d => d.status !== 'open'), 'cancelled');
  check(docs(/\/stockHolds\//).some(d => d.status === 'cancelled'), 'hold cancelled');
  await until(t, c => { const el = document.querySelector(`[data-stock="${c}"] [data-left]`); return el && el.textContent === '45'; }, 'alcohol 45', 8000, ALCOHOL);
  check(await leftOn(t, ALCOHOL) === 45, 'alcohol back to 45');

  out('7 custodian edits and removes a teacher');
  await ev(a, uid => openTeachersView(uid), ben);
  await sleep(200);
  await a.click('#tvEditMember');
  await ev(a, () => { meName.value = 'Benjamin Cruz'; mePosition.value = 'Teacher II'; });
  await a.click('#meSave');
  await waitNode(() => backend.store.get(`schools/${sid}/members/${ben}`).name === 'Benjamin Cruz', 'renamed');
  check(backend.store.get(`schools/${sid}/members/${ben}`).position === 'Teacher II', 'card: Benjamin Cruz · Teacher II');
  await until(b, () => reqRole.me.name === 'Benjamin Cruz', 'Ben sees the new name', 8000);
  check(await ev(b, () => reqRole.me.name === 'Benjamin Cruz' && reqRole.me.position === 'Teacher II'), 'his phone takes the corrected name and position');
  await sleep(800);
  check(backend.store.get(`schools/${sid}/members/${ben}`).name === 'Benjamin Cruz', 'his phone does not write the old name back');
  await ev(a, uid => openTeachersView(uid), ben);
  await sleep(150);
  await a.click('#tvRemoveMember');
  await waitNode(() => backend.store.get(`schools/${sid}/members/${ben}`).status === 'removed', 'removed');
  check(backend.store.get(`schools/${sid}/members/${ben}`).status === 'removed', 'Ben removed');
  await until(b, () => !!document.getElementById('rqRemoved') || !!document.querySelector('#rqStockPane #rqRemoved'), 'Ben banner', 8000);
  check(await ev(b, () => /Removed from/.test(document.getElementById('viewRequester').innerText)), 'Ben: “Removed from San Jose…”');
  check(await ev(b, () => !document.querySelector('[data-stock]')), 'Ben no longer sees the stock');
  const deniedBefore = backend.denied.length;
  const direct = await ev(b, async uid => {
    const F = cloud.sdk;
    try { await F.setDoc(F.doc(reqCol()), { uid, name: 'Benjamin Cruz', position: '', office: '', purpose: '', neededBy: '', lines: [{ code: null, desc: 'x', unit: 'piece', qty: 1 }], status: 'pending', clientAt: Date.now(), via: 'teacher' }); return 'sent'; }
    catch (e) { return e.code || e.message; }
  }, ben);
  check(/permission-denied/.test(direct), `the rules refuse his request (${direct})`);
  backend.denied.splice(deniedBefore);
  await ev(a, () => openTeachersView(null));
  await sleep(200);
  check(await ev(a, () => /Removed from the school · 1/.test(document.getElementById('tvList').innerText)), 'Teachers list: “Removed from the school · 1”');
  await ev(a, uid => addBackMember(uid), ben);
  await waitNode(() => backend.store.get(`schools/${sid}/members/${ben}`).status === 'active', 'added back');
  check(backend.store.get(`schools/${sid}/members/${ben}`).status === 'active', 'Add back → active again');

  out('8 new invite link: the old one stops working');
  await ev(a, () => openInvite());
  await sleep(200);
  await a.click('#inviteNewLink');
  await until(a, () => !!schoolInfo.invite, 'new code', 5000);
  const code = await ev(a, () => inviteCodeText());
  check(new RegExp(`^${sid}-[A-Za-z0-9]{10}$`).test(code) && backend.store.get(`schools/${sid}`).inviteOnly === true, `new link code ${code}`);
  check(await ev(a, c => document.getElementById('inviteLinkText').textContent.endsWith('#join=' + c), code), 'the sheet shows the new link');
  const printed = await ev(a, () => window.__printed || 0);
  await a.click('#invitePoster');
  await until(a, n => (window.__printed || 0) > n, 'poster', 8000, printed);
  const poster = await ev(a, () => document.querySelector('#printPrSection .poster').innerText);
  check(poster.includes(code) && /School ID 114656/.test(poster), 'poster: the new code and “School ID 114656”');
  const c1 = await openPhone('teacher-carlo', backend);
  await openJoinLink(c1, sid);
  check(await ev(c1, () => /replaced by a newer one/.test(document.getElementById('joinError').textContent) && document.getElementById('joinBtn').disabled), 'old link: “replaced by a newer one”');
  const carlo = await joinAsTeacher(c1, code, 'Carlo Diaz', 'Teacher I', 'Grade 8');
  await waitNode(() => (backend.store.get(`schools/${sid}/members/${carlo}`) || {}).status === 'pending', 'Carlo pending');
  check((backend.store.get(`schools/${sid}/members/${carlo}`) || {}).invite === code.split('-')[1], 'new link works (Carlo waits for approval)');
  // Removing Ben can refuse one read of his open stock listener before his phone hears the news
  // (Firestore does the same when access is taken away); anything else refused is a bug.
  const refused = backend.denied.filter(d => !(new RegExp(`^read stock(Holds)? .*"uid":"${ben}"`).test(d)));
  check(refused.length === 0, `nothing else refused (${refused.length}) ${refused.slice(0, 2).join(' | ')}`);
} catch (e) {
  out('CRASH', e);
  check(false, `crashed: ${e.message}`);
} finally {
  summary('members-stock');
  await closeAll();
}
