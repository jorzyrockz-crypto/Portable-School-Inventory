// The School Head's screen (Nov 2026): Needs your attention, waiting chips and a reminder after
// 3 days, Approve all (PRs and supply requests), search of past decisions, spending, condition,
// trends, supply usage, who holds what (tap a name, print their list), the monthly summary print,
// and two columns on a laptop (phones unchanged).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { waitNode, custodian, teacher, schoolHead } from './lib/school-setup.mjs';

const backend = createBackend();
const LAPTOP = '43211503-LAP001';
const dashOf = sid => backend.store.get(`schools/${sid}/dashboard/summary`);
const ym = new Date().toISOString().slice(0, 7);

async function newPr(page, prNo, desc, qty, unitCost) {
  await ev(page, (no, d, q, c) => {
    openPrDraft({ requestIds: [], requesters: [], purpose: 'Learning materials for Grade 4',
      lines: [{ id: 'x' + no, code: null, stockNo: '', unit: 'ream', desc: d, qty: q, unitCost: c }] });
    document.getElementById('prNo').value = no;
    savePr();
  }, prNo, desc, qty, unitCost);
  await until(page, no => prList.some(p => p.prNo === no), `PR ${prNo} saved`, 8000, prNo);
}

try {
  out('1 a school: teacher, School Head, equipment and supplies released, a lost unit');
  const { page: a, sid } = await custodian(backend);
  const { uid: ana } = await teacher(backend, sid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana in the roster', 8000, ana);
  const { page: h } = await schoolHead(backend, a, sid);
  const supply = await ev(a, () => { const i = items.find(x => !relIsEquip(x) && x.qty >= 10 && x.price > 0); return { code: i.code, name: i.name }; });
  await ev(a, (uid, l, s) => { openRelease({ teacherUid: uid, lines: [{ code: l, qty: 2 }, { code: s, qty: 4 }], purpose: 'Grade 4' }); __fillSerials(); confirmRelease(); closeRelease(); }, ana, LAPTOP, supply.code);
  await ev(a, l => {
    const held = getUnits(l).filter(u => u.toUid);
    held[0].lostMs = Date.now() - 25 * 864e5; held[0].lostNote = 'Missing from Room 4';
    held[1].cond = 'U';
    saveState();
  }, LAPTOP);
  await newPr(a, `${ym}-101`, 'Bond paper, A4', 20, 250);
  await newPr(a, `${ym}-102`, 'Crayons, 16 colors', 40, 85);
  await ev(a, () => publishDash());
  await waitNode(() => { const d = dashOf(sid); return !!(d && d.v === 2 && (d.lost || []).length && d.use && d.use.mo.slips); }, 20000);
  const d = dashOf(sid);
  check(d.v === 2 && d.uv > 0 && d.holders[0].e && d.holders[0].e.length === 2, `summary: unserviceable value ₱${d.uv}, Ana’s ${d.holders[0].e.length} units listed`);
  check(d.holders[0].e.some(u => /^SN-/.test(u.s)) && d.holders[0].e.some(u => u.l), 'her units carry serial numbers and the lost flag');
  check(d.trend.ris[ym] > 0 && d.use.mo.items.some(x => x.n === supply.name) && d.use.mo.people[0].n === 'Ana Reyes', `supplies issued this month ₱${d.trend.ris[ym]}, top item and person`);
  check(d.vt && d.vt[ym] === d.value, 'property value recorded for this month');
  check(d.unconf.s >= 2 && d.unconf.p === 1, `${d.unconf.s} slips not yet marked Received by 1 teacher`);
  check(d.cnt && d.cnt.of >= 1 && typeof d.cnt.open === 'boolean', `count progress: ${d.cnt.done} of ${d.cnt.of} (${d.cnt.label})`);

  out('2 the head: Needs your attention, waiting chips, reminder');
  await until(h, () => dashDoc && dashDoc.v === 2 && prList.length >= 2 && !!document.querySelector('[data-head-attention]'), 'head screen', 12000);
  await ev(h, () => { const p = prList.find(x => /-101$/.test(x.prNo)); p.approval.submittedMs = Date.now() - 4 * 864e5; renderHeadView(); });
  const att = await ev(h, () => [...document.querySelectorAll('[data-att]')].map(x => `${x.dataset.att}: ${x.textContent.replace(/\s+/g, ' ').trim()}`));
  check(att.some(x => /^late: 1 item waiting for you more than 3 days/.test(x)), `late item listed (${att.find(x => x.startsWith('late')) || 'none'})`);
  check(att.some(x => /^lost: Lost: .*with Ana Reyes.*5 days left to apply for relief/.test(x)), 'lost unit with days left to apply for relief');
  check(att.some(x => /^unconf: \d+ slips not yet marked Received/.test(x)), 'slips not yet marked Received');
  check(await ev(h, () => Number((document.querySelector('[data-head-age]') || {}).dataset?.headAge) >= 4), 'the waiting PR shows “Waiting 4 days”');
  await ev(h, () => notifHeadWaiting());
  check(await ev(h, () => loadNotifs().items.some(n => /has waited 4 days/.test(n.title) && n.go === 'head')), 'reminder notification after 3 days');
  await ev(h, () => notifHeadWaiting());
  check(await ev(h, () => loadNotifs().items.filter(n => /has waited/.test(n.title)).length === 1), 'reminded once only');

  out('3 the head: property, spending, trends, usage, who holds what');
  const view = await ev(h, () => ({
    health: (document.querySelector('[data-head-health]') || {}).textContent || '',
    spend: (document.querySelector('[data-head-spend]') || {}).textContent || '',
    trend: !!document.querySelector('[data-head-trend]'),
    usage: (document.querySelector('[data-head-usage]') || {}).textContent || ''
  }));
  check(/1 unserviceable/.test(view.health.replace(/\s+/g, ' ')) && /waiting for disposal/.test(view.health), 'condition bar with unserviceable value waiting for disposal');
  check(/Waiting for your approval\s*₱8,400\.00 · 2/.test(view.spend), 'spending: ₱8,400.00 in 2 PRs waiting');
  check(view.trend && view.usage.includes(supply.name) && /Ana Reyes/.test(view.usage), 'trend bars and who uses the most supplies');
  await h.click('[data-head-use="yr"]');
  check(await ev(h, () => headUseYr && /This year/.test(document.querySelector('[data-head-usage]').textContent)), 'This year toggle');
  await ev(h, () => { document.querySelector('[data-dash-holders]').open = true; document.querySelector('[data-dash-holder="0"]').open = true; });
  const holder = await ev(h, () => document.querySelector('[data-dash-holder="0"]').textContent.replace(/\s+/g, ' '));
  check(/Ana Reyes/.test(holder) && /S\/N SN-/.test(holder) && /Lost/.test(holder) && /Unserviceable/.test(holder), 'tap Ana: her units with serial numbers, Lost and condition');
  await h.click('[data-head-print-holder="0"]');
  await sleep(200);
  const p1 = await ev(h, () => ({ n: window.__printed || 0, t: document.getElementById('printPrSection').textContent }));
  check(p1.n === 1 && /PROPERTY ACCOUNTABILITY/.test(p1.t) && /ANA REYES/.test(p1.t) && /TOTAL · 2 units/.test(p1.t), 'Print their list (for clearances)');

  out('4 Approve all, then search the decisions');
  check(await ev(h, () => document.querySelector('[data-head-approve-all]')?.dataset.headApproveAll === '2'), 'Approve all 2 shown');
  h.dialogs.length = 0;
  await h.click('[data-head-approve-all]');
  await waitNode(() => backend.docs(`schools/${sid}/purchaseRequests/`).filter(p => p.approval && p.approval.status === 'approved').length === 2, 8000);
  check(backend.docs(`schools/${sid}/purchaseRequests/`).filter(p => p.approval && p.approval.status === 'approved' && p.approval.via === 'app').length === 2, 'both PRs approved in the cloud, by the head');
  check(h.dialogs.some(x => /2 Purchase Requests · ₱8,400\.00 in all/.test(x)), `asked first (${h.dialogs[0] || ''})`);
  await until(h, () => !document.querySelector('[data-head-approve-all]') && !!document.querySelector('[data-head-decided]'), 'decided list');
  const sp = await ev(h, () => document.querySelector('[data-head-spend]').textContent.replace(/\s+/g, ' '));
  check(/₱8,400\.00/.test(sp) || /₱8\.4K/.test(sp), `spending now counts them as approved (${sp.slice(0, 90)})`);
  check(await ev(h, () => !!document.querySelector('[data-spend-avg]')), 'average time to decide shown');
  await h.type('#hdSearch', '102');
  check(await ev(h, () => document.querySelectorAll('#hdDecided [data-head-pr]').length === 1 && /-102/.test(document.querySelector('#hdDecided [data-head-pr]').textContent)), 'search finds PR …-102 only');
  check(await ev(h, () => document.activeElement && document.activeElement.id === 'hdSearch'), 'typing keeps the search box focused');
  await ev(h, () => setHeadSearch('zzzz'));
  check(await ev(h, () => !!document.querySelector('[data-head-nomatch]')), 'Nothing matches');
  await ev(h, () => setHeadSearch(''));

  out('5 the monthly summary print');
  await h.click('[data-head-print-month]');
  await sleep(200);
  const p2 = await ev(h, () => ({ n: window.__printed || 0, t: document.getElementById('printPrSection').textContent.replace(/\s+/g, ' ') }));
  check(p2.n === 2 && /MONTHLY PROPERTY SUMMARY/.test(p2.t) && /-101/.test(p2.t) && /-102/.test(p2.t) && p2.t.includes(supply.name) && /Lost/.test(p2.t), 'monthly summary: property, PRs approved, supplies issued, needs attention');

  out('6 laptop: two columns; phone: one');
  check(await ev(h, () => getComputedStyle(document.getElementById('hdBody')).display !== 'grid'), 'phone: one column');
  await h.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(300);
  const cols = await ev(h, () => getComputedStyle(document.getElementById('hdBody')).gridTemplateColumns.split(' ').length);
  check(cols === 2, `laptop: two columns (${cols})`);
  await h.screenshot({ path: '/tmp/head_laptop.png' });
  await h.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(300);
  await h.screenshot({ path: '/tmp/head_phone.png', fullPage: true });
  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('head-dashboard');
}
