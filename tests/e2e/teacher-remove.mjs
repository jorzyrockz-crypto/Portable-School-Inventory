// Remove from the school / Add back on the custodian's own screen, with the teacher's page
// open: the page, the list and the Removed list change at once (no refresh), and the
// teacher's phone says so too. Laptop (two panes) and phone.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, ev, sleep, until, closeAll, summary } from './lib/harness.mjs';
import { custodian, teacher } from './lib/school-setup.mjs';

const backend = createBackend();
const head = p => ev(p, () => document.getElementById('tvHead').textContent.replace(/\s+/g, ' '));
try {
  for (const [w, h] of [[1100, 900], [390, 844]]) {
    out(`${w === 390 ? 'phone' : 'laptop'}: remove the only teacher with their page open`);
    const { page: a, sid } = await custodian(backend, { name: 'cust' + w, email: `c${w}@deped.gov.ph`, school: 'School ' + w, width: w, height: h });
    const { page: t, uid } = await teacher(backend, sid, 'Ana Reyes');
    await until(a, () => memberList.some(m => m.name === 'Ana Reyes' && memberStatus(m) === 'active'), 'Ana on the list', 8000);
    await ev(a, u => openTeachersView(u), uid);
    await until(a, () => !!document.getElementById('tvRemoveMember'), 'her page');
    check(/has the app/.test(await head(a)), 'her page: has the app, with Remove');
    await a.click('#tvRemoveMember');
    await until(a, () => !!document.getElementById('tvAddBack'), 'removed state', 4000);
    check(/removed from the school/.test(await head(a)) && !/has the app/.test(await head(a)), 'her page says “removed from the school” at once (no refresh)');
    check(await ev(a, () => !document.getElementById('tvRemoveMember') && !!document.getElementById('tvAddBack')), 'Remove is replaced by Add back');
    check(await ev(a, u => !!document.querySelector(`#tvRemoved [data-tvgone="${u}"]`), uid), 'the Removed from the school list shows her, even with nobody else on the list');
    check((backend.store.get(`schools/${sid}/members/${uid}`) || {}).status === 'removed', 'her card is removed in the cloud');
    await until(t, () => !!document.getElementById('rqRemoved'), 'teacher told', 8000);
    check(await ev(t, () => myMemberStatus() === 'removed' && !!document.getElementById('rqRemoved')), 'her phone says Removed straight away');

    out(`${w === 390 ? 'phone' : 'laptop'}: Add back`);
    await a.click('#tvAddBack');
    await until(a, () => !!document.getElementById('tvRemoveMember'), 'back', 4000);
    check(/has the app/.test(await head(a)) && await ev(a, () => !document.getElementById('tvRemoved')), 'Add back: her page and the list change at once');
    await until(t, () => !document.getElementById('rqRemoved') && myMemberStatus() === 'active', 'teacher back', 8000);
    check(await ev(t, () => myMemberStatus() === 'active'), 'her phone is active again');
    await sleep(200);
  }
} catch (e) {
  check(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('teacher-remove');
}
