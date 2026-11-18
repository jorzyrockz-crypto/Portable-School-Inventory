// School Head: every Purchase Request needs the head's approval. Before a head joins, the
// custodian records the date the head signed the printed PR ("signed on paper"); the print
// says FOR APPROVAL until then. The head joins from their own link with their own Google
// account, the custodian confirms them, and from then on only the head approves or returns
// PRs (with a note) on their phone. The rules stand-in refuses everything else: the custodian
// approving in the head's place, changing an approved PR without sending it back, the head
// changing a PR, and a custodian being the head.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const backend = createBackend();
const prDocs = () => backend.docs('schools/').filter(d => /\/purchaseRequests\//.test(d.path));
const prDoc = no => prDocs().find(d => d.prNo === no);
async function waitNode(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(100); }
  out(`   (timed out waiting for ${what})`);
  return false;
}
let today = '';
async function newPr(page, prNo, desc, qty, unitCost) {
  await ev(page, (no, d, q, c) => {
    openPrDraft({ requestIds: [], requesters: [], purpose: 'Office supplies for the 2nd quarter',
      lines: [{ id: 'x' + no, code: null, stockNo: '', unit: 'ream', desc: d, qty: q, unitCost: c }] });
    document.getElementById('prNo').value = no;
    savePr();
  }, prNo, desc, qty, unitCost);
  await until(page, no => prList.some(p => p.prNo === no), `PR ${prNo} saved`, 8000, prNo);
  return ev(page, no => prList.find(p => p.prNo === no).id, prNo);
}
// A write the app would never make, straight to the stand-in: true if it was refused.
const refused = (page, fn, ...args) => ev(page, async (src, a) => {
  try { await (new Function('F', 'args', `return (${src})(F, ...args);`))(cloud.sdk, a); return false; }
  catch (e) { return /permission-denied/.test(String(e && (e.code || e.message))); }
}, fn.toString(), args);

try {
  out('1 custodian saves a PR: it waits for the School Head');
  const a = await openPhone('custodian', backend, { width: 1100, height: 900 });
  await a.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await ev(a, () => { loadSampleInventory(); schoolInfo.custodian = 'Rhealyn B. Nadado'; schoolInfo.position = 'AO II'; schoolInfo.head = 'John Russell L. Guadalupe'; });
  await ev(a, () => { openRequestsView(); gateGo('custodian'); });
  await until(a, () => !!document.getElementById('rcEmail'), 'sign-in card');
  await ev(a, () => { rcSchool.value = 'Oquendo Elementary School'; rcEmail.value = 'rhea@deped.gov.ph'; rcPass.value = 'secret12'; });
  await a.click('#rcCreate');
  await until(a, () => reqRole && reqRole.role === 'custodian', 'custodian connected');
  await ev(a, () => closeInvite());
  const sid = await ev(a, () => reqRole.schoolId);
  const custUid = await ev(a, () => cloud.user.uid);
  today = await ev(a, () => localISODate());

  const pr1 = await newPr(a, '2026-11-001', 'Bond paper, A4', 10, 230);
  await waitNode(() => prDoc('2026-11-001'), 'PR in the cloud');
  check(prDoc('2026-11-001') && prDoc('2026-11-001').approval && prDoc('2026-11-001').approval.status === 'pending', 'saved PR: approval pending');
  const draft = await ev(a, () => ({ printed: window.__printed || 0, html: document.getElementById('printPrSection').innerHTML }));
  check(draft.printed >= 1 && /FOR APPROVAL/.test(draft.html), 'Save & print: the form says FOR APPROVAL');
  await ev(a, () => setReqTab('prs'));
  let card = await ev(a, id => {
    const box = document.querySelector('[data-pr-approval]');
    return { st: box && box.dataset.prApproval, paper: !!document.querySelector(`[data-paper-sign="${id}"]`), inspect: !!document.querySelector(`[data-inspect-pr="${id}"]`),
      delivered: !!document.querySelector(`button[onclick="markPrDelivered('${id}')"]`), banner: /Until they join the app/.test(document.getElementById('reqViewBody').textContent) };
  }, pr1);
  check(card.st === 'pending' && card.paper && card.banner, 'PR card: Needs the School Head’s signature, with Signed on paper; tab says every PR needs approval');
  check(!card.inspect && !card.delivered, 'no Inspect delivery / Items delivered before approval');
  const xl = await ev(a, id => prSheet(prList.find(p => p.id === id)).rows.slice(0, 3).map(r => (r.cells || []).map(c => c && c.v).join('|')).join(' / '), pr1);
  check(/FOR APPROVAL/.test(xl), 'Excel: FOR APPROVAL at the top');
  check(await ev(a, () => { openInspectPr(prList[0].id); return document.getElementById('iarModal').classList.contains('hidden'); }), 'Inspect delivery refuses an unapproved PR');

  out('2 signed on paper (no head in the app yet)');
  a.dialogs.prompt = '2999-01-01';
  await ev(a, id => recordPaperSign(id), pr1);
  await sleep(300);
  check(prDoc('2026-11-001').approval.status === 'pending' && a.dialogs.some(d => /not a future date/.test(d)), 'a future date is refused');
  a.dialogs.prompt = today;
  await ev(a, id => recordPaperSign(id), pr1);
  await waitNode(() => prDoc('2026-11-001').approval.status === 'approved', 'paper signature saved');
  const paper = prDoc('2026-11-001').approval;
  check(paper.via === 'paper' && paper.paperDate === today && paper.byName === 'John Russell L. Guadalupe', 'paper signature: date and the head’s printed name');
  card = await ev(a, id => ({ st: document.querySelector('[data-pr-approval]').dataset.prApproval, text: document.querySelector('[data-pr-approval]').textContent,
    inspect: !!document.querySelector(`[data-inspect-pr="${id}"]`), hist: changeHistory.slice(-1)[0].x }), pr1);
  check(card.st === 'approved' && /Signed on paper/.test(card.text) && card.inspect, 'card: Signed on paper; Inspect delivery opens');
  check(/signature on paper/.test(card.hist), 'Change History: paper signature');
  await ev(a, id => printPrById(id), pr1);
  check(await ev(a, () => !/FOR APPROVAL/.test(document.getElementById('printPrSection').innerHTML)), 'final print: no FOR APPROVAL');

  out('3 changing a signed PR sends it back for approval');
  check(await refused(a, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'purchaseRequests', id), { total: 1 }), sid, pr1), 'rules: an approved PR can’t be changed without sending it back');
  await ev(a, id => { editPr(id); prDraft.lines[0].qty = 12; savePr(); }, pr1);
  await waitNode(() => prDoc('2026-11-001').approval.status === 'pending' && prDoc('2026-11-001').lines[0].qty === 12, 'edited PR back to pending');
  check(prDoc('2026-11-001').approval.resubmitted === true && a.dialogs.some(d => /Change an approved PR/.test(d)), 'edit asked first, then sent the PR back (pending again)');

  out('4 the School Head joins with their own link and Google account');
  await ev(a, () => openHeadPanel());
  await until(a, () => !!schoolInfo.headInvite && !!document.getElementById('headLinkText'), 'head link made');
  const link = await ev(a, () => document.getElementById('headLinkText').textContent);
  const code = await ev(a, () => schoolInfo.headInvite);
  check(/#head=/.test(link) && backend.store.get(`schools/${sid}/headInvites/${code}`)?.active === true, 'School Head link + QR (invite code active in the cloud)');
  check(await ev(a, () => !!document.querySelector('#headQr svg')), 'QR code drawn');
  await ev(a, () => closeHeadPanel());

  const h = await openPhone('head', backend);
  await h.evaluateOnNewDocument(() => { window.__googleAccount = { email: 'john.guadalupe@deped.gov.ph', name: 'John Russell L. Guadalupe' }; });
  await h.goto(BASE_URL + '#head=' + link.split('#head=')[1], { waitUntil: 'networkidle0' });
  await until(h, () => !document.getElementById('headJoinModal').classList.contains('hidden'), 'head join sheet');
  check(await ev(h, () => document.documentElement.classList.contains('gated') && document.getElementById('loginGate').dataset.step === 'head'), 'head link opens the School Head sign-in');
  await ev(h, () => { hjDesig.value = 'School Principal I'; });
  await h.click('#hjBtn');
  await until(h, () => reqRole && reqRole.role === 'head' && headMeLoaded, 'head joined', 8000);
  const headUid = await ev(h, () => cloud.user.uid);
  const hv = await ev(h, () => ({ view: activeMainView, tabs: document.getElementById('tabBar').classList.contains('hidden'), text: document.getElementById('hdBody').textContent, gated: document.documentElement.classList.contains('gated') }));
  check(hv.view === 'HEAD' && hv.tabs && !hv.gated && /Waiting for the property custodian to confirm you/.test(hv.text), 'head phone: For your approval screen, waiting to be confirmed');
  const card0 = backend.store.get(`schools/${sid}/heads/${headUid}`);
  check(card0 && card0.status === 'pending' && card0.name === 'John Russell L. Guadalupe' && card0.designation === 'School Principal I' && card0.email === 'john.guadalupe@deped.gov.ph', 'head card in the cloud: pending, name from Google, designation');
  check(await refused(h, (F, sid) => F.getDocs(F.collection(cloud.db, 'schools', sid, 'purchaseRequests')), sid), 'rules: an unconfirmed head can’t read the PRs');

  out('5 the custodian confirms the head');
  await until(a, () => headList.some(x => x.status === 'pending'), 'custodian sees the request');
  const cn = await ev(a, () => ({ n: loadNotifs().items.some(n => /wants to join as School Head/.test(n.title)), banner: /asked to join as School Head/.test(document.getElementById('reqViewBody').textContent) }));
  check(cn.n && cn.banner, 'custodian: notification + Review banner on the Purchase requests tab');
  check(await refused(a, (F, sid, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid), { headUid: uid }), sid, custUid), 'rules: a custodian can’t be the School Head (no self-approval)');
  await ev(a, uid => { openHeadPanel(); confirmHead(uid); }, headUid);
  await waitNode(() => backend.store.get(`schools/${sid}`).headUid === headUid && backend.store.get(`schools/${sid}/heads/${headUid}`).status === 'active', 'head confirmed');
  check(backend.store.get(`schools/${sid}`).headName === 'John Russell L. Guadalupe', 'school: headUid + headName');
  check(await ev(a, () => !!document.querySelector('[data-head-card]') && /Approves PRs in the app/.test(document.getElementById('headPanelBody').textContent)), 'panel: the head approves PRs in the app');
  await ev(a, () => closeHeadPanel());
  await until(h, () => prList.some(p => p.prNo === '2026-11-001') && !!document.querySelector('[data-head-approve]'), 'head sees the waiting PR', 8000);
  check(await ev(h, () => /Sent again by the property custodian/.test(document.getElementById('hdBody').textContent)), 'head: the PR waits for them (marked as sent again)');

  out('6 only the head approves now');
  await until(a, () => /Waiting for approval/.test(document.querySelector('[data-pr-approval]')?.textContent || ''), 'custodian card: waiting for the head');
  check(await ev(a, () => !document.querySelector('[data-paper-sign]')), 'custodian: Signed on paper is gone once a head is confirmed');
  check(await refused(a, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'purchaseRequests', id), { approval: { status: 'approved', via: 'paper', paperDate: '2026-11-01', byName: 'x' } }), sid, pr1),
    'rules: the custodian can’t record a paper signature once the head is confirmed');
  check(await refused(a, (F, sid, id, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'purchaseRequests', id), { approval: { status: 'approved', via: 'app', byUid: uid, byName: 'x' } }), sid, pr1, custUid),
    'rules: the custodian can’t approve in the app');
  check(await refused(h, (F, sid, id) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'purchaseRequests', id), { total: 5 }), sid, pr1), 'rules: the head can’t change a PR');

  out('7 the head returns it with a note; the custodian sends it again');
  h.dialogs.prompt = 'Use 70 gsm paper; check the unit cost';
  await ev(h, id => headDecide(id, false), pr1);
  await waitNode(() => prDoc('2026-11-001').approval.status === 'returned', 'returned');
  const ret = prDoc('2026-11-001').approval;
  check(ret.via === 'app' && ret.byUid === headUid && ret.note === 'Use 70 gsm paper; check the unit cost' && ret.byName === 'John Russell L. Guadalupe', 'returned: the head’s name, uid and note');
  await until(a, () => document.querySelector('[data-pr-approval]')?.dataset.prApproval === 'returned', 'custodian sees Returned');
  const rc = await ev(a, () => ({ text: document.querySelector('[data-pr-approval]').textContent, n: loadNotifs().items.some(n => /returned PR No. 2026-11-001/.test(n.title)), hist: changeHistory.some(e => /returned Purchase Request 2026-11-001/.test(e.x)) }));
  check(/Use 70 gsm paper/.test(rc.text) && rc.n && rc.hist, 'custodian: Returned card with the note, notification, Change History');
  await ev(a, id => submitPrAgain(id), pr1);
  await waitNode(() => prDoc('2026-11-001').approval.status === 'pending', 'sent again');
  check(prDoc('2026-11-001').approval.resubmitted === true, 'Send again as is: pending again');

  out('8 the head approves');
  await until(h, () => !!document.querySelector('[data-head-approve]'), 'head sees it again');
  await ev(h, id => headDecide(id, true), pr1);
  await waitNode(() => prDoc('2026-11-001').approval.status === 'approved', 'approved');
  const ok = prDoc('2026-11-001').approval;
  check(ok.via === 'app' && ok.byUid === headUid && ok.atMs > 0 && ok.byDesig === 'School Principal I', 'approved in the app: the head’s name, designation, date and time');
  check(await refused(h, (F, sid, id, uid) => F.updateDoc(F.doc(cloud.db, 'schools', sid, 'purchaseRequests', id), { approval: { status: 'returned', via: 'app', byUid: uid, note: 'no' } }), sid, pr1, headUid),
    'rules: a decided PR can’t be decided again');
  await until(a, () => document.querySelector('[data-pr-approval]')?.dataset.prApproval === 'approved', 'custodian sees Approved');
  const ac = await ev(a, id => ({ text: document.querySelector('[data-pr-approval]').textContent, inspect: !!document.querySelector(`[data-inspect-pr="${id}"]`),
    n: loadNotifs().items.some(n => /approved PR No. 2026-11-001/.test(n.title)), hist: changeHistory.some(e => /approved Purchase Request 2026-11-001/.test(e.x)) }), pr1);
  check(/Approved/.test(ac.text) && /John Russell/.test(ac.text) && ac.inspect && ac.n && ac.hist, 'custodian: Approved by the head, Inspect delivery opens, notification, Change History');
  await ev(a, id => printPrById(id), pr1);
  const fin = await ev(a, () => document.getElementById('printPrSection').innerHTML);
  check(!/FOR APPROVAL/.test(fin) && /Approved in CustodianPro by John Russell L\. Guadalupe/.test(fin), 'print: no FOR APPROVAL; approval line under the head’s signature');
  check(await ev(h, () => /You approved it/.test(document.getElementById('hdBody').textContent)), 'head: Recently decided shows it');

  out('9 a new PR reaches the head’s phone');
  await newPr(a, '2026-11-002', 'Whiteboard marker', 24, 35);
  await until(h, () => loadNotifs().items.some(n => /PR No. 2026-11-002 waits for your approval/.test(n.title)), 'head notified', 8000);
  check(await ev(h, () => loadNotifs().items.some(n => /2026-11-002 waits for your approval/.test(n.title))), 'head: notification for the new PR');

  const deniedBefore = backend.denied.length;
  out('10 removing the head');
  await ev(a, uid => removeHead(uid), headUid);
  await waitNode(() => backend.store.get(`schools/${sid}`).headUid === '' && backend.store.get(`schools/${sid}/heads/${headUid}`).status === 'removed', 'head removed');
  await until(h, () => /access was removed/.test(document.getElementById('hdBody').textContent), 'head phone shows removed', 8000);
  check(await ev(h, () => prList.length === 0 && /access was removed/.test(document.getElementById('hdBody').textContent)), 'head phone: access removed, no PRs');
  await ev(a, () => setReqTab('prs'));
  check(await ev(a, () => !!document.querySelector('[data-paper-sign]')), 'custodian: Signed on paper is back for waiting PRs');

  out('11 the custodian’s own link on the custodian’s device');
  await ev(a, l => { openHeadJoin(l); }, link);
  await sleep(200);
  check(a.dialogs.some(d => /This is your school’s School Head link/.test(d)), 'custodian opening the head link: told to send it to the head');

  out(`denied ${JSON.stringify(backend.denied.map(d => d.split(' · ')[0]))}`);
  check(deniedBefore === 7, 'the stand-in refused only the 7 forbidden writes and reads tried above');
  // Removing the head ends their access: their phone's PR listener may be refused once before it stops.
  check(backend.denied.slice(deniedBefore).every(d => /^read (purchaseRequests|turnovers|approvals|dashboard)/.test(d)), 'after removal: only the removed head’s reads are refused');
} catch (e) {
  out('FAIL: exception', e && e.stack || e);
  process.exitCode = 1;
} finally {
  summary('school-head');
  await closeAll();
}
