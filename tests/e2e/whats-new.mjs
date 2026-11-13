// Every release gets a What's new note: when the app changed (new sw.js cache version, so
// people get "Update ready · Restart"), the newest WHATS_NEW entry must be new compared with
// main. No browser needed; see scripts/check-whats-new.mjs.
import { checkWhatsNew } from '../../scripts/check-whats-new.mjs';
import { check, out, summary } from './lib/harness.mjs';

out('1 What’s new note for this release');
const r = checkWhatsNew(process.env.NOTES_BASE || 'origin/main');
if (r.skipped) out(`   (${r.skipped})`);
else out(`   ${r.changed ? 'update' : 'no update'} · newest "${r.latest && r.latest.id}" (main: "${r.baseLatest}")`);
check(r.ok, r.ok ? 'every update has its own What’s new entry' : r.problems.join(' | '));
summary('whats-new');
