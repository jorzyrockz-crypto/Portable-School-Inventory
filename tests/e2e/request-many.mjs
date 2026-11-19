// Several items in one supply request:
//  · Stock tab: "Request" adds the supply to one request (tap again = one more); a bar
//    "Review & send · N items" opens it. Kept on the phone until sent (also after a reload).
//  · The form: tapped search results stay open (tap several in a row, picked ones marked),
//    "Pick from the school's supplies" lists the stock to tap, closing keeps the items,
//    up to 50 items; sending clears it.
//  · The custodian's walk-in form starts empty (nothing kept), with their supplies to pick.
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, closeAll, summary } from './lib/harness.mjs';
import { waitNode, custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const reqs = () => backend.docs('schools/').filter(d => /\/requests\//.test(d.path));
const formLines = page => ev(page, () => (reqDraft ? reqDraft.lines.map(l => ({ code: l.code, desc: l.desc, qty: l.qty })) : null));

try {
  out('1 Stock tab: Request adds to one request');
  const { page: a, sid } = await custodian(backend);
  const { page: t } = await teacher(backend, sid, 'Ricky Q. Vicente', 'Teacher IV', 'Grade 5');
  await ev(t, () => setTeacherTab('stock'));
  await until(t, () => stockLoaded && document.querySelectorAll('[data-stock]').length >= 4, 'stock on the teacher', 10000);
  const codes = await ev(t, () => [...document.querySelectorAll('[data-stock]')].slice(0, 3).map(x => x.dataset.stock));
  for (const c of codes) await ev(t, c => document.querySelector(`[data-stock="${c}"] button[onclick^="requestFromStock"]`).click(), c);
  await ev(t, c => document.querySelector(`[data-stock="${c}"] button[onclick^="requestFromStock"]`).click(), codes[0]);
  check(await ev(t, () => document.getElementById('reqFormModal').classList.contains('hidden')), 'the form does not open on each tap');
  const tag = await ev(t, c => (document.querySelector(`[data-stock="${c}"] [data-in-cart]`) || {}).textContent || '', codes[0]);
  check(/2 in request/.test(tag), `tapped twice: “${tag.trim()}”`);
  const bar = await ev(t, () => (document.querySelector('[data-req-cart]') || {}).textContent || '');
  check(/Review & send · 3 items/.test(bar), `bar: “${bar.trim()}”`);
  await t.screenshot({ path: '/tmp/e2e_req_stock.png' });
  await t.reload({ waitUntil: 'networkidle0' });
  await until(t, () => reqRole && reqRole.role === 'teacher' && myMemberLoaded, 'teacher back', 8000);
  await ev(t, () => setTeacherTab('stock'));
  await until(t, () => stockLoaded && !!document.querySelector('[data-req-cart]'), 'bar after reload', 8000);
  check(true, 'kept on the phone after a reload');
  await ev(t, () => document.querySelector('[data-req-cart] button').click());
  let lines = await formLines(t);
  check(lines && lines.length === 3 && lines[0].qty === 2, `Review & send opens the form with the 3 items (${lines && lines.map(l => l.qty).join(', ')})`);

  out('2 the form: tap several search results in a row');
  await ev(t, () => { rfSearch.value = 'ballpen'; renderReqSearch(); });
  const res = await ev(t, () => [...document.querySelectorAll('#rfResults [data-result]')].slice(0, 2).map(b => b.dataset.result));
  check(res.length === 2, `search “ballpen”: ${res.length} results to tap`);
  for (const c of res) await ev(t, c => document.querySelector(`#rfResults [data-result="${c}"]`).click(), c);
  const st = await ev(t, () => ({ open: !document.getElementById('rfResults').classList.contains('hidden'), q: rfSearch.value, picked: document.querySelectorAll('#rfResults [data-picked]').length, label: document.getElementById('rfAddLabel').textContent }));
  check(st.open && st.q === 'ballpen' && st.picked === 2, 'results stay open after each tap, both marked as picked');
  check(/Add more items · 5 in this request/.test(st.label), `label: “${st.label}”`);
  check(await ev(t, () => /up to 50 items/.test(document.getElementById('rfLines').textContent)), 'hint: add more, up to 50 items');

  out('3 Pick from the school’s supplies');
  await ev(t, () => document.getElementById('rfBrowseBtn').click());
  const browse = await ev(t, () => ({ open: !document.getElementById('rfBrowse').classList.contains('hidden'), n: document.querySelectorAll('#rfBrowse [data-browse]').length, label: document.getElementById('rfBrowseLabel').textContent }));
  check(browse.open && browse.n >= 4, `the school’s supplies listed (${browse.n})`);
  const pick = await ev(t, have => [...document.querySelectorAll('#rfBrowse [data-browse]')].map(b => b.dataset.browse).filter(c => !have.includes(c)).slice(0, 2), lines.map(l => l.code).concat(res));
  for (const c of pick) await ev(t, c => document.querySelector(`#rfBrowse [data-browse="${c}"]`).click(), c);
  await ev(t, c => document.querySelector(`#rfBrowse [data-browse="${c}"]`).click(), pick[0]);
  lines = await formLines(t);
  check(lines.length === 7 && lines.find(l => l.code === pick[0]).qty === 2, `7 items; tapping again adds one more (${lines.length})`);
  check(await ev(t, c => /2/.test(document.querySelector(`#rfBrowse [data-browse="${c}"] [data-picked]`).textContent), pick[0]), 'the list shows how many are in the request');
  await t.screenshot({ path: '/tmp/e2e_req_form.png' });

  out('4 closing keeps the items; sending clears them');
  await ev(t, () => closeRequestForm());
  await ev(t, () => openRequestForm());
  lines = await formLines(t);
  check(lines.length === 7, 'closed and opened again: the 7 items are still there');
  await ev(t, () => { rfPurpose.value = 'Graduation'; sendRequest(); });
  await waitNode(() => reqs().some(r => r.name === 'Ricky Q. Vicente' && (r.lines || []).length === 7));
  const sent = reqs().find(r => r.name === 'Ricky Q. Vicente');
  check(sent && sent.lines.length === 7 && sent.lines.some(l => l.qty === 2) && sent.purpose === 'Graduation', 'one request with all 7 items reached the custodian');
  check(await ev(t, () => !localStorage.getItem('cp_req_cart_v1')), 'sent: nothing kept on the phone');
  await ev(t, () => setTeacherTab('stock'));
  await sleep(200);
  check(await ev(t, () => !document.querySelector('[data-req-cart]') && !document.querySelector('[data-in-cart]')), 'Stock tab: the bar and “in request” marks are gone');
  await ev(t, () => openRequestForm());
  check((await formLines(t)).length === 0, 'the next request starts empty');

  out('5 up to 50 items');
  await ev(t, () => { reqDraft.lines = Array.from({ length: 50 }, (_, i) => ({ id: 'x' + i, code: null, desc: 'Item ' + i, unit: 'piece', qty: 1 })); rfSearch.value = 'chalk'; addReqLine(null); });
  check((await formLines(t)).length === 50, 'a 51st item is refused (send this one first)');
  await ev(t, () => { closeRequestForm(); saveReqCart([]); });

  out('6 the custodian’s walk-in form');
  await ev(a, () => openRequestForm());
  await sleep(200);
  const w = await ev(a, () => ({ lines: reqDraft.lines.length, browse: !document.getElementById('rfBrowseBtn').classList.contains('hidden') }));
  check(w.lines === 0 && w.browse, 'starts empty, with the custodian’s supplies on hand to pick');
  await ev(a, () => closeRequestForm());
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('request-many');
}
