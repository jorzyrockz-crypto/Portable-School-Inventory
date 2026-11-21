// The custodian's Home, reorganized (Nov 2026). Quick actions (set-up first while the inventory is
// new, then the daily ones), Needs your attention without repeating the cards (useful life, leave,
// this week, the count in progress), a This week card where the School calendar is on, a Leave card
// where Leave is on, and two columns on a laptop (phones and portrait tablets keep one column).
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, closeAll, summary, errors } from './lib/harness.mjs';
import { custodian } from './lib/school-setup.mjs';

const backend = createBackend({ planPilot: 'any', leavePilot: 'any' });
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const acts = page => ev(page, () => document.getElementById('homeTiles').dataset.homeActs);
const home = page => ev(page, () => { switchMainView('HOME'); renderHome(); });
const cols = page => ev(page, () => {
  const a = document.getElementById('homeSearchCard').getBoundingClientRect(), b = document.getElementById('homeIdle').getBoundingClientRect();
  return { side: b.left >= a.right - 1, stacked: b.top >= a.bottom - 1 };
});

try {
  out('1 a phone; with nothing encoded yet: set-up first');
  const { page: a } = await custodian(backend, { name: 'cphone', email: 'phone@deped.gov.ph', school: 'Home ES', width: 390, height: 844 });
  await home(a);
  let k = await ev(a, () => { const keep = items; items = []; try { return homeActions().map(x => x.id); } finally { items = keep; } });
  out(`   ${k.join(', ')}`);
  check(k[0] === 'ics' && k[1] === 'import', 'Scan ICS and Import first while the inventory is new');
  check(k.includes('release') && k.includes('pr') && k.includes('count') && k.length <= 8, 'Release, New PR and Count there too (8 at most)');
  check(await ev(a, () => document.querySelectorAll('#homeTiles > button').length === document.getElementById('homeTiles').dataset.homeActs.split(',').length), 'quick actions are buttons');
  check(await ev(a, () => document.getElementById('homeWeek').classList.contains('hidden') && document.getElementById('homeLeaveCard').classList.contains('hidden')), 'no This week / Leave cards where the pilots are off');
  check((await cols(a)).stacked, 'phone: one column');

  out('2 the sample inventory (tagged units): the daily ones first, set-up last');
  await ev(a, () => loadSampleData({ ask: false }));
  await until(a, () => !!sampleStore() && allTaggedUnits().length > 0 && !!countSession, 'the sample data', 15000);
  await home(a);
  k = (await acts(a)).split(',');
  out(`   ${k.join(', ')}`);
  check(k[0] === 'tag' && k.indexOf('ics') > k.indexOf('release'), 'Scan tag first; Scan ICS after Release');
  check(await ev(a, () => !!document.getElementById('homeQrTile') && !!document.getElementById('homeCountTile')), 'Scan tag and Count keep their ids');
  await ev(a, () => document.querySelector('[data-home-act="pr"]').click());
  check(await ev(a, () => !!prDraft && !document.getElementById('prModal').classList.contains('hidden')), 'New PR opens the Purchase Request form');
  await ev(a, () => { try { closePr(); } catch (e) {} });

  out('3 Needs your attention does not repeat the cards');
  check(await ev(a, () => !homeAttention().some(x => ['life', 'leave', 'cal-week'].includes(x.key))), 'no useful life / leave / this week rows');
  out(`   count: ${await ev(a, () => JSON.stringify([!!countSession, homeAttention().map(x => x.key), document.getElementById('homeCountTile') && document.getElementById('homeCountTile').textContent.replace(/\s+/g, ' ')]))}`);
  check(await ev(a, () => !!countSession && !homeAttention().some(x => x.key === 'count' && /counted/.test(x.text)) && /Continue count/.test(document.getElementById('homeCountTile').textContent) && /counted/.test(document.getElementById('homeCountTile').textContent)), 'counting now (sample): the Count tile shows it, not a row');

  out('4 the School calendar and Leave on: This week and Leave cards');
  await ev(a, () => { localStorage.setItem(PLAN_PILOT_KEY, reqRole.schoolId); localStorage.setItem(LEAVE_PILOT_KEY, reqRole.schoolId); leaveStop(); leaveSync(); calSync(); calNav(); lvNav(); });
  await ev(a, () => openCalendar());
  await until(a, () => !!document.getElementById('calLoadBtn'), 'set up', 8000);
  await ev(a, () => document.getElementById('calLoadBtn').click());
  await until(a, () => !!calYears['2026-2027'], 'year', 8000);
  await ev(a, async (d1, d2) => {
    const F = cloud.sdk, db = cloud.db, sid = reqRole.schoolId, by = { uid: cloud.user.uid, name: 'AO', role: 'ao' };
    await F.setDoc(F.doc(db, 'schools', sid, 'ppas', 'hw1'), { sy: '2026-2027', kind: 'activity', title: 'Reading camp', from: d1, to: d1, venue: 'Library', who: [], team: [], budget: 5000, source: 'mooe', status: 'planned', by, log: [], createdMs: Date.now() });
    const col = F.collection(db, 'schools', sid, 'leaves');
    await F.setDoc(F.doc(col, 'hl1'), { uid: 'x', name: 'Ana Reyes', type: 'sick', status: 'approved', from: d2, to: d2, reason: '', log: [], by: 'teacher', filedMs: Date.now() });
    await F.setDoc(F.doc(col, 'hl2'), { uid: 'y', name: 'Pedro Cruz', type: 'vacation', status: 'applied', from: d2, to: d2, reason: '', log: [], by: 'teacher', filedMs: Date.now() });
  }, iso(2), iso(1));
  await until(a, () => lvList.length >= 2 && calViewEntries(calCurSy()).some(e => e.title === 'Reading camp'), 'entries', 8000);
  await home(a);
  const wk = await ev(a, () => ({ hidden: document.getElementById('homeWeek').classList.contains('hidden'), sub: document.querySelector('[data-home-week-sub]').textContent, rows: [...document.querySelectorAll('[data-home-week]')].map(e => e.textContent.replace(/\s+/g, ' ').trim()) }));
  out(`   This week: ${wk.sub} | ${wk.rows.slice(0, 3).join(' | ')}`);
  check(!wk.hidden && /1 activity/.test(wk.sub) && /1 person on leave/.test(wk.sub), 'This week: the activity and who is on leave');
  check(wk.rows.some(r => /Reading camp/.test(r)) && wk.rows.some(r => /On leave: Ana Reyes/.test(r)), 'rows: Reading camp, On leave: Ana Reyes');
  check(await ev(a, () => !!document.getElementById('homeWeekAdd')), '+ Activity');
  await ev(a, () => document.querySelector('[data-home-week="activity"]').click());
  await sleep(300);
  check(await ev(a, () => activeMainView === 'CALENDAR' && !!calSheet), 'a row opens it on the calendar');
  await ev(a, () => { try { closeCalModal(); } catch (e) {} });
  await home(a);
  const lv = await ev(a, () => ({ hidden: document.getElementById('homeLeaveCard').classList.contains('hidden'), t: document.getElementById('homeLeaveCard').textContent.replace(/\s+/g, ' ') }));
  out(`   Leave: ${lv.t.trim()}`);
  check(!lv.hidden && new RegExp(`${await ev(a, () => lvTodo().length)} to act on`).test(lv.t) && (await ev(a, () => lvTodo().length)) >= 1 && !!(await ev(a, () => document.getElementById('homeLeaveEncode'))), 'Leave card: n to act on (lvTodo), Encode');
  await ev(a, () => document.getElementById('homeLeaveEncode').click());
  check(await ev(a, () => !!lvSheet && lvSheet.view === 'apply'), 'Encode opens a new leave');
  await ev(a, () => { try { closeLvModal(); } catch (e) {} });

  out('5 laptop: two columns; portrait tablet: one');
  const { page: l } = await custodian(backend, { name: 'clap', email: 'lap@deped.gov.ph', school: 'Lap ES', width: 1366, height: 900 });
  await home(l);
  let c = await cols(l);
  check(c.side && !c.stacked, 'laptop: the cards beside the search');
  check(await ev(l, () => document.getElementById('viewHome').getBoundingClientRect().width > 900), 'laptop: Home is wider');
  const { page: tb } = await custodian(backend, { name: 'ctab', email: 'tab@deped.gov.ph', school: 'Tab ES', width: 820, height: 1180 });
  await home(tb);
  c = await cols(tb);
  check(c.stacked, 'portrait tablet: one column');

  check(errors.length === 0, `no errors (${errors.join(' | ')})`);
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('home-layout');
}
