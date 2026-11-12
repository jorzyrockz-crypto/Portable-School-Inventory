// Moving the app to another Firebase project: the phone forgets its old school link and
// upload markers (they belong to the old project) but keeps its inventory and history.
// Run: node project-switch.mjs   (app served on BASE_URL, default http://localhost:8080/)
import { createBackend } from './lib/fake-backend.mjs';
import { BASE_URL, out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';

const ROLE = 'custodian_requests_role_v1';
const SYNC = 'custodian_inventory_sync_v1';
const PROJ = 'custodian_cloud_project_v1';

const a = await openPhone('Custodian', createBackend());
await a.goto(BASE_URL, { waitUntil: 'networkidle0' });

out('1 a phone set up before this version (old project, no project tag)');
const before = await ev(a, ({ ROLE, SYNC, PROJ }) => {
  loadSampleInventory();
  localStorage.setItem(ROLE, JSON.stringify({ role: 'custodian', schoolId: 'old-school', schoolName: 'San Jose NHS' }));
  localStorage.setItem(SYNC, JSON.stringify({ schoolId: 'old-school', synced: { X: 'abc' }, lastAt: 1 }));
  localStorage.removeItem(PROJ);
  return items.length;
}, { ROLE, SYNC, PROJ });
check(before > 0, `sample inventory loaded (${before} items)`);

await a.reload({ waitUntil: 'networkidle0' });
await sleep(400);
const after = await ev(a, ({ ROLE, SYNC, PROJ }) => ({
  role: localStorage.getItem(ROLE), sync: localStorage.getItem(SYNC), proj: localStorage.getItem(PROJ),
  items: items.length, custodian: isCustodianDevice(), changed: cloudProjectChanged
}), { ROLE, SYNC, PROJ });
check(after.changed === true, 'project change detected');
check(after.role === null && !after.custodian, 'old school link cleared');
check(!after.sync || !JSON.parse(after.sync).synced.X, 'old upload markers cleared');
check(after.proj === 'demo-school', `new project remembered (${after.proj})`);
check(after.items === before, `inventory kept (${after.items} items)`);
await until(a, () => /new cloud account/i.test(document.body.innerText), 'toast', 5000);
check(true, 'toast tells the custodian to sign in again');

out('2 the next open on the same project changes nothing');
await ev(a, ({ ROLE }) => localStorage.setItem(ROLE, JSON.stringify({ role: 'custodian', schoolId: 'new-school', schoolName: 'San Jose NHS' })), { ROLE });
await a.reload({ waitUntil: 'networkidle0' });
await sleep(400);
const again = await ev(a, ({ ROLE }) => ({ changed: cloudProjectChanged, school: JSON.parse(localStorage.getItem(ROLE) || 'null')?.schoolId, custodian: isCustodianDevice() }), { ROLE });
check(again.changed === false && again.school === 'new-school' && again.custodian, 'school link on the current project is kept');

out('3 a brand-new phone');
await ev(a, () => localStorage.clear());
await a.reload({ waitUntil: 'networkidle0' });
await sleep(300);
check(await ev(a, () => cloudProjectChanged === false), 'no change reported on a fresh phone');

await closeAll();
summary('project-switch');
