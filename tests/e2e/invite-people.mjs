// One place to invite everyone: More → Invite people (also the Invite buttons on Supply requests
// and Teachers). The sheet has the teachers' link and QR, and a switcher to the School Head,
// Assistant custodian and Librarian panels, each with a back button to the sheet. Waiting people
// show as a count on their role.
import { createBackend } from './lib/fake-backend.mjs';
import { out, check, sleep, ev, until, openPhone, closeAll, summary } from './lib/harness.mjs';
import { waitNode, custodian, teacher, openLink } from './lib/school-setup.mjs';

const backend = createBackend();
const shown = (page, id) => ev(page, i => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden'); }, id);
const roles = page => ev(page, () => [...document.querySelectorAll('#inviteRoles [data-invite-role]')].map(b => ({
  id: b.dataset.inviteRole, on: b.getAttribute('aria-selected') === 'true', text: b.textContent.replace(/\s+/g, ' ').trim(),
  wait: (b.querySelector('[data-invite-wait]') || {}).textContent || ''
})));
const backBtn = (page, modal) => ev(page, m => {
  const b = document.querySelector(`#${m} [data-invite-back]`), i = document.querySelector(`#${m} [data-invite-icon]`);
  return { back: !!b && !b.classList.contains('hidden'), icon: !!i && !i.classList.contains('hidden') };
}, modal);

try {
  out('1 More → Invite people (phone)');
  const { page: a, sid } = await custodian(backend, { width: 390, height: 844 });
  await ev(a, () => openMoreMenu());
  const more = await ev(a, () => {
    const first = document.querySelector('#moreMenu .space-y-3 > div');
    return { first: first && first.id, item: !!document.getElementById('moreInviteItem'), assistItem: !!document.getElementById('moreAssistItem'),
      label: document.getElementById('moreInviteItem').textContent.replace(/\s+/g, ' ').trim() };
  });
  check(more.first === 'morePeople' && more.item && /Invite people/.test(more.label), `More: “Invite people” is the first item (${more.label})`);
  check(!more.assistItem, 'More: no separate “Assistant custodians” item (it is in Invite people)');
  await a.click('#moreInviteItem');
  await until(a, () => !document.getElementById('inviteModal').classList.contains('hidden') && !!document.querySelector('#inviteQr svg'), 'invite sheet', 6000);
  check(await ev(a, () => document.getElementById('inviteTitle').textContent) === 'Invite people', 'sheet title: Invite people');
  let r = await roles(a);
  check(r.map(x => x.id).join() === 'teachers,head,assist,librarian', `switcher: ${r.map(x => x.id).join(' · ')}`);
  check(r[0].on && !r[1].on && /0 joined/.test(r[0].text), `Teachers selected, “${r[0].text}”`);
  check(/Not yet/.test(r[1].text) && /None/.test(r[2].text) && /None/.test(r[3].text), `nobody else yet: ${r.slice(1).map(x => x.text).join(' | ')}`);
  check(await shown(a, 'inviteTurnover'), 'Custodian turnover is linked at the bottom');
  await a.screenshot({ path: '/tmp/e2e_invite_people.png' });

  out('2 a teacher joins → Teachers “1 joined”');
  const { uid: anaUid } = await teacher(backend, sid);
  await until(a, uid => teacherRoster().some(x => x.uid === uid && x.joined), 'Ana joined', 8000, anaUid);
  await ev(a, () => openInvite());
  r = await roles(a);
  check(/1 joined/.test(r[0].text), `Teachers: “${r[0].text}”`);

  out('3 School Head: opens its panel, back returns to Invite people');
  await ev(a, () => inviteGo('head'));
  await until(a, () => !document.getElementById('headModal').classList.contains('hidden') && !!document.getElementById('headLinkText'), 'head panel', 8000);
  check(!await shown(a, 'inviteModal'), 'Invite people closes behind it');
  let bb = await backBtn(a, 'headModal');
  check(bb.back && !bb.icon, 'School Head panel: back button instead of the icon');
  const headLink = await ev(a, () => document.getElementById('headLinkText').textContent);
  await a.click('#headModal [data-invite-back]');
  check(await shown(a, 'inviteModal') && !await shown(a, 'headModal'), 'back → Invite people');
  await ev(a, () => { closeInvite(); openHeadPanel(); });
  bb = await backBtn(a, 'headModal');
  check(!bb.back && bb.icon, 'opened from a PR card instead: no back button');
  await ev(a, () => closeHeadPanel());

  out('4 the head asks to join → “To confirm” with a count');
  const h = await openPhone('head', backend);
  await openLink(h, { email: 'john.guadalupe@deped.gov.ph', name: 'John Russell L. Guadalupe' }, '#head=' + headLink.split('#head=')[1]);
  await ev(h, () => { hjDesig.value = 'School Principal I'; });
  await h.click('#hjBtn');
  await until(a, () => headList.some(x => x.status === 'pending'), 'custodian sees the head', 8000);
  await ev(a, () => openInvite());
  r = await roles(a);
  check(/To confirm/.test(r[1].text) && r[1].wait === '1', `School Head: “${r[1].text}”, badge ${r[1].wait}`);
  const hUid = await ev(h, () => cloud.user.uid);
  await ev(a, u => { closeInvite(); confirmHead(u); }, hUid);
  await waitNode(() => backend.store.get(`schools/${sid}`).headUid === hUid);
  await sleep(300);
  await ev(a, () => openInvite());
  r = await roles(a);
  check(/Confirmed/.test(r[1].text) && !r[1].wait, `after Confirm: “${r[1].text}”`);

  out('5 Assistant and Librarian');
  await ev(a, () => inviteGo('assist'));
  await until(a, () => !document.getElementById('assistModal').classList.contains('hidden') && !!document.getElementById('assistLinkText'), 'assistant panel', 8000);
  bb = await backBtn(a, 'assistModal');
  check(bb.back && !bb.icon && !await shown(a, 'inviteModal'), 'Assistant: its panel with a back button');
  await a.click('#assistModal [data-invite-back]');
  check(await shown(a, 'inviteModal') && !await shown(a, 'assistModal'), 'back → Invite people');
  await ev(a, () => inviteGo('librarian'));
  await until(a, () => !document.getElementById('bkModal').classList.contains('hidden') && !!document.querySelector('[data-bk-librarians]'), 'librarian sheet', 6000);
  check(await ev(a, uid => !!document.querySelector(`[data-bk-lib-row="${uid}"] [data-bk-lib-on]`), anaUid), 'Librarian: pick a teacher (Ana can be made librarian)');
  check(await ev(a, () => !!document.querySelector('#bkModal [aria-label="Back"]')), 'Librarian sheet: back button');
  await a.click('#bkModal [aria-label="Back"]');
  check(await shown(a, 'inviteModal') && !await shown(a, 'bkModal'), 'back → Invite people');
  await ev(a, () => closeInvite());

  out('6 the other ways in: Supply requests and Teachers');
  await ev(a, () => openRequestsView());
  await a.click('#reqViewActions [onclick="openInvite()"]');
  check(await shown(a, 'inviteModal') && (await roles(a)).length === 4, 'Supply requests → Invite opens Invite people');
  await ev(a, () => { closeInvite(); openTeachersView(); });
  await until(a, () => !!document.getElementById('tvInviteBtn'), 'Invite on the Teachers page', 6000);
  await a.click('#tvInviteBtn');
  check(await shown(a, 'inviteModal') && (await roles(a)).length === 4, 'Teachers → Invite opens Invite people');
  const fit = await ev(a, () => { const r = document.getElementById('inviteRoles').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; });
  check(fit, 'switcher fits a 390 px phone');
} catch (e) {
  check(false, 'crashed: ' + (e && e.stack || e));
} finally {
  await closeAll();
  summary('invite-people');
}
