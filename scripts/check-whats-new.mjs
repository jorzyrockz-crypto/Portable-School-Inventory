// Every release gets a What's new note.
//
// A new service-worker cache version (sw.js, written by `npm run build`) is what shows people
// the "Update ready · Restart" prompt, so a change that moves it must also add a new entry at
// the top of WHATS_NEW in index.html. It has to be a NEW id: the "Updated · …" message after
// the restart only appears when the newest id is one the phone has not seen yet.
//
//   node scripts/check-whats-new.mjs [base]   (base: git ref to compare with, default origin/main)
//
// Exit code 1 when the note is missing. `npm run build` prints the same result as a warning.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cacheOf = sw => (String(sw).match(/const CACHE = '([^']+)'/) || [])[1] || '';
const entriesOf = html => {
  const start = String(html).indexOf('const WHATS_NEW = [');
  if (start < 0) return [];
  const block = html.slice(start, html.indexOf('\n    ];', start));
  return [...block.matchAll(/\{ id: '([^']+)', date: '([^']*)', title: '([^']*)'/g)].map(m => ({ id: m[1], date: m[2], title: m[3] }));
};
const gitShow = (ref, file) => {
  try { return execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { return null; }
};

export function checkWhatsNew(base = 'origin/main') {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const entries = entriesOf(html);
  const problems = [];
  if (!entries.length) problems.push('WHATS_NEW has no entries.');
  const ids = entries.map(e => e.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`Duplicate What's new id: ${[...new Set(dup)].join(', ')}.`);
  entries.forEach(e => { if (!e.title.trim()) problems.push(`What's new entry ${e.id} has no title.`); });

  const baseHtml = gitShow(base, 'index.html');
  const baseSw = gitShow(base, 'sw.js');
  if (baseHtml === null || baseSw === null) return { ok: !problems.length, skipped: `no ${base} to compare with`, problems, latest: entries[0] };
  const changed = cacheOf(sw) !== cacheOf(baseSw);
  const baseLatest = (entriesOf(baseHtml)[0] || {}).id;
  if (changed && entries[0] && entries[0].id === baseLatest) {
    problems.push(`This is an update (cache ${cacheOf(baseSw)} → ${cacheOf(sw)}) but the newest What's new entry is still "${baseLatest}". `
      + 'Add a new entry at the top of WHATS_NEW in index.html (new id, plain words: what people will notice, or "Fixes: …"), then run npm run build.');
  }
  if (entries[0] && entries[0].id !== baseLatest && ids.slice(1).includes(entries[0].id)) problems.push(`The new id "${entries[0].id}" is already used.`);
  return { ok: !problems.length, changed, problems, latest: entries[0], baseLatest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = checkWhatsNew(process.argv[2] || 'origin/main');
  if (r.skipped) console.log(`What's new: skipped the release check (${r.skipped}).`);
  if (r.ok) console.log(`✓ What's new: ${r.changed ? 'update with a new note' : 'no update'} · latest "${r.latest && r.latest.title}"`);
  else { r.problems.forEach(p => console.error(`✗ What's new: ${p}`)); process.exit(1); }
}
