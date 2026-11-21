// Shared in-memory Firestore + Auth for the test phones. Enforces the same access rules as
// firestore.rules; every refusal is recorded in `denied` (an app flow should cause none).
// autoApprove (default): a teacher who joins is approved at once, as if the custodian tapped
// Approve, so suites about other things need no approval step. Pass { autoApprove: false } to
// test approvals.
// leavePilot: the schools where Leave (CS Form 6) is on, as in firestore.rules leavePilot();
// pass 'any' to allow it for every school (the test school's id is made up at sign-up).
// planPilot: the same for School Planning (the school calendar).
// Both are test shortcuts on top of the real switches (firestore.rules featureOn): the admin
// school (adminSchool, changeable with setAdminSchool) always has every feature at the Testing
// stage; appConfig/features moves a feature to 'pro' (Pro schools and trials) or 'all'.
export function createBackend({ autoApprove = true, leavePilot = ['97JbEODfGJhWcejYDWhO'], planPilot = ['97JbEODfGJhWcejYDWhO'], adminSchool = '97JbEODfGJhWcejYDWhO' } = {}) {
  let adminSid = adminSchool;
  const store = new Map();
  const users = new Map();
  const googleUsers = new Map();
  const denied = [];
  const writes = [];
  let uidSeq = 0;
  const clock = { offset: 0, last: 0 };   // server time = now + offset (a suite can make writes look older)
  const serverNow = () => (clock.last = Math.max(Date.now() + clock.offset, clock.last + 1));   // always later than the last write
  const resolveTS = v => {
    if (v && typeof v === 'object' && v.__ts) { const ms = serverNow(); return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 }; }
    if (Array.isArray(v)) return v.map(resolveTS);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveTS(x)]));
    return v;
  };
  const deny = (why, op) => { denied.push(`${why} · ${JSON.stringify(op).slice(0, 240)}`); throw new Error('permission-denied'); };
  const parts = p => p.split('/');
  const school = id => store.get(`schools/${id}`);
  // Rules read the school as it was before the batch (get()), so checks inside a batch use that.
  let batchBefore = null, batchOps = null;
  const schoolPre = id => (batchBefore ? batchBefore.get(`schools/${id}`) : store.get(`schools/${id}`));
  const isCust = (ctx, sid) => !!(ctx.uid && schoolPre(sid) && (schoolPre(sid).custodians || []).includes(ctx.uid));
  // A custodian who turned the school over: read only until viewOnly[uid].untilMs.
  const isViewer = (ctx, sid) => !!(ctx.uid && school(sid) && (((school(sid).viewOnly || {})[ctx.uid] || {}).untilMs || 0) > Date.now());
  const isAssistant = (ctx, sid) => !!(ctx.uid && schoolPre(sid) && (schoolPre(sid).assistants || []).includes(ctx.uid) && !schoolPre(sid).erasing);
  const isStaff = (ctx, sid) => isCust(ctx, sid) || isAssistant(ctx, sid);
  const canView = (ctx, sid) => isStaff(ctx, sid) || isViewer(ctx, sid);
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const CUSTODIAN_ONLY = ['inventory', 'catalog', 'settings'];
  // The confirmed School Head (school.headUid), never one of the custodians.
  const isHeadOf = (ctx, sid) => !!(ctx.uid && schoolPre(sid) && schoolPre(sid).headUid === ctx.uid && !isCust(ctx, sid) && !(schoolPre(sid).assistants || []).includes(ctx.uid));
  // firestore.rules turnoverOk: one custodian (the new owner) whose card was pending before the
  // batch and is 'done' after it; only the outgoing custodians may become viewers.
  const turnoverOk = (sid, before, after) => {
    if (typeof after.turnoverId !== 'string') return false;
    const path = `schools/${sid}/turnovers/${after.turnoverId}`;
    const pre = (batchBefore || store).get(path), post = store.get(path);
    const allowed = [...(before.custodians || []), ...(before.viewerUids || [])];
    return JSON.stringify(after.custodians) === JSON.stringify([after.ownerUid]) && after.ownerUid !== (after.headUid || '') &&
      !!pre && pre.status === 'pending' && !!post && post.status === 'done' && post.uid === after.ownerUid &&
      (after.viewerUids || []).every(u => allowed.includes(u)) && Object.keys(after.viewOnly || {}).every(u => allowed.includes(u));
  };
  const apprStatus = d => ((d && d.approval) || {}).status || '';
  const PR_CONTENT = ['prNo', 'date', 'entity', 'fund', 'office', 'rcc', 'purpose', 'lines', 'total', 'requestIds', 'requesters', 'requestedBy', 'approvedBy'];
  const headCardOk = (data, uid) => data.uid === uid && typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 80 &&
    str(data.designation, 80) && str(data.email ?? '', 120);
  const member = (ctx, sid) => store.get(`schools/${sid}/members/${ctx.uid}`);
  const erasing = sid => !!(school(sid) && school(sid).erasing);
  const isMember = (ctx, sid) => { const m = member(ctx, sid); return !!(ctx.uid && m && (m.status || 'active') === 'active' && !erasing(sid)); };
  const inviteOk = (sid, data) => {
    if (!(school(sid) && school(sid).inviteOnly)) return true;
    const inv = typeof data.invite === 'string' && data.invite && store.get(`schools/${sid}/invites/${data.invite}`);
    return !!(inv && inv.active === true);
  };
  const leavePilotOn = sid => leavePilot === 'any' || (Array.isArray(leavePilot) && leavePilot.includes(sid));
  const planPilotOn = sid => planPilot === 'any' || (Array.isArray(planPilot) && planPilot.includes(sid));
  // firestore.rules featureOn / featureRead / isPro
  const STAGES = ['off', 'testing', 'pro', 'all'];
  const cfgStage = name => { const st = ((store.get('appConfig/features') || {})[name] || {}).stage; return STAGES.includes(st) ? st : 'testing'; };
  const proNow = sid => { const d = schoolPre(sid) || {}; const p = d.pro, t = d.trial; return !!((p && (!(p.untilMs > 0) || p.untilMs > Date.now())) || (t && t.untilMs > Date.now())); };
  const featOn = (name, sid, pilot) => pilot(sid) || (cfgStage(name) !== 'off' && (sid === adminSid || cfgStage(name) === 'all' || (cfgStage(name) === 'pro' && proNow(sid))));
  const featRead = (name, sid, pilot) => featOn(name, sid, pilot) || (cfgStage(name) === 'pro' && !!(schoolPre(sid) && (schoolPre(sid).pro || schoolPre(sid).trial)));
  const leaveOn = sid => featOn('leave', sid, leavePilotOn), leaveRead = sid => featRead('leave', sid, leavePilotOn);
  const planOn = sid => featOn('plan', sid, planPilotOn), planRead = sid => featRead('plan', sid, planPilotOn);
  const isAdmin = ctx => isCust(ctx, adminSid);
  const TRIAL_MS = 7 * 86400000;
  const SY_RE = /^[0-9]{4}-[0-9]{4}$/;
  const changedKeys = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  // The Librarian: an active teacher listed in school.librarians (firestore.rules isLibrarian).
  const isLibrarian = (ctx, sid) => !!(ctx.uid && schoolPre(sid) && (schoolPre(sid).librarians || []).includes(ctx.uid) && isMember(ctx, sid));
  const bookStaff = (ctx, sid) => isStaff(ctx, sid) || isLibrarian(ctx, sid);
  const loanOk = d => typeof d.bookId === 'string' && d.bookId.length > 0 && d.bookId.length <= 80 && Number.isInteger(d.qty) && d.qty > 0 && d.qty <= 500 &&
    str(d.title ?? '', 200) && str(d.borrowerName ?? '', 80) && str(d.borrowerNote ?? '', 80) && str(d.note ?? '', 200) && Array.isArray(d.acc ?? []) && (d.acc ?? []).length <= 100;
  const cardOk = (data, uid) => data.uid === uid && typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 80 &&
    str(data.position, 80) && str(data.office, 80) && str(data.email ?? '', 120);

  function checkWrite(kind, path, data, before, ctx) {
    const p = parts(path);
    if (!ctx.uid) deny('not signed in', { kind, path });
    if (p[0] === 'schoolIds' && p.length === 2) {
      const ok = Object.keys(data).every(k => ['schoolId', 'name', 'updatedMs', 'hint'].includes(k)) && str(data.name, 120) && (data.hint === undefined || str(data.hint, 80));
      if (kind === 'create' || !before) {
        if (!/^[0-9]{6}$/.test(p[1]) || !ok || typeof data.schoolId !== 'string' || !isCust(ctx, data.schoolId)) deny('school id create', { path, data });
      } else if (!ok || !((isCust(ctx, before.schoolId) && (data.schoolId ?? before.schoolId) === before.schoolId) ||
                          (!school(before.schoolId) && typeof data.schoolId === 'string' && isCust(ctx, data.schoolId)))) deny('school id update', { path, data });
      return;
    }
    if (p[0] === 'teacherSchools' && p.length === 2) {
      const ok = ctx.uid === p[1] && ctx.provider === 'google.com' && Object.keys(data).every(k => ['schools', 'updatedMs'].includes(k)) &&
        Array.isArray(data.schools) && data.schools.length <= 10 && Number.isInteger(data.updatedMs);
      if (!ok) deny('teacher schools write', { path, data, provider: ctx.provider });
      return;
    }
    if (p[0] === 'appConfig' && p.length === 2 && p[1] === 'features') {
      const after = kind === 'create' || !before ? data : { ...before, ...data };
      const ok = isAdmin(ctx) && Object.keys(after).every(k => ['leave', 'plan', 'log', 'contact', 'updatedAt'].includes(k)) &&
        ['leave', 'plan'].every(k => STAGES.includes((after[k] || {}).stage || 'testing')) && Array.isArray(after.log ?? []) && (after.log ?? []).length <= 100 && str(after.contact ?? '', 200);
      if (!ok) deny('features write', { path, data });
      return;
    }
    if (p[0] !== 'schools') deny('unknown collection', { path });
    if (p.length === 2) {
      if (kind === 'create') {
        if (!['password', 'google.com'].includes(ctx.provider) || data.ownerUid !== ctx.uid ||
            JSON.stringify(data.custodians) !== JSON.stringify([ctx.uid]) || !str(data.name, 120) || 'pro' in data || 'trial' in data) deny('school create', { path, data });
      } else {
        const after = { ...before, ...data };
        const ownerSame = !data.ownerUid || data.ownerUid === before.ownerUid;
        const same = k => JSON.stringify(after[k] ?? null) === JSON.stringify(before[k] ?? null);
        // The admin (custodian of the admin school) changes only Pro and the trial of any school
        if (isAdmin(ctx) && changedKeys(before, after).every(k => ['pro', 'trial'].includes(k))) return;
        // A school's own custodian: never Pro; the 7-day trial once (none before), starting now
        const t = after.trial;
        const trialOk = same('trial') || (isCust(ctx, p[1]) && !before.trial && t && typeof t.startMs === 'number' && Math.abs(t.startMs - Date.now()) < 600000 && t.untilMs === t.startMs + TRIAL_MS && str(t.by ?? '', 80));
        if (!same('pro') || !trialOk) deny('school update: Pro and the trial', { path, data });
        if (isCust(ctx, p[1])) {
          if (!ownerSame && !turnoverOk(p[1], before, after)) deny('school update: owner changes only with a confirmed turnover', { path, data });
          if ((after.assistants || []).includes(after.headUid || '-') || (after.assistants || []).includes(after.ownerUid)) deny('school update: head or owner is an assistant', { path, data });
        } else if (isHeadOf(ctx, p[1])) {
          const keys = ['custodians', 'ownerUid', 'turnoverId', 'turnoverMs', 'custodianName', 'custodianDesig', 'viewOnly', 'viewerUids', 'assistants'];
          if (!turnoverOk(p[1], before, after) || !changedKeys(before, after).every(k => keys.includes(k)) ||
              !(after.assistants || []).every(u => (before.assistants || []).includes(u)) || (after.assistants || []).includes(after.ownerUid)) deny('school update (head)', { path, data });
        } else deny('school update', { path });
        if (after.headUid && (after.custodians || []).includes(after.headUid)) deny('school update: head is a custodian', { path, data });
      }
      return;
    }
    const sid = p[1], sub = p[2];
    if (p.length === 4 && sub === 'requests') {
      if (kind === 'create') {
        const keys = ['uid', 'name', 'position', 'office', 'purpose', 'neededBy', 'lines', 'status', 'createdAt', 'clientAt', 'via', 'kind'];
        if (!(isStaff(ctx, sid) || isMember(ctx, sid))) deny('request create: not an approved member', { path });
        const ok = school(sid) && Object.keys(data).every(k => keys.includes(k)) && data.uid === ctx.uid && data.status === 'pending' &&
          ['request', 'took'].includes(data.kind ?? 'request') &&
          typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 80 && str(data.position, 80) && str(data.office, 80) &&
          str(data.purpose, 300) && Array.isArray(data.lines) && data.lines.length > 0 && data.lines.length <= 50;
        if (!ok) deny('request create', { path, data });
        return;
      }
      const after = { ...before, ...data };
      if (isStaff(ctx, sid) && after.uid === before.uid) return;
      if (isCust(ctx, sid) && after.mergedFrom === before.uid) return;   // same teacher, two accounts
      const changed = Object.keys(data);
      if (before.uid === ctx.uid && before.status === 'pending' && after.status === 'cancelled' && changed.every(k => ['status', 'updatedAt'].includes(k))) return;
      deny('request update', { path, data });
    }
    if (p.length === 4 && sub === 'members') {
      if (kind === 'create') {
        const keys = ['uid', 'name', 'position', 'office', 'email', 'joinedMs', 'updatedAt', 'status', 'invite'];
        const ok = ctx.uid === p[3] && school(sid) && !erasing(sid) && Object.keys(data).every(k => keys.includes(k)) && data.status === 'pending' &&
          inviteOk(sid, data) && cardOk(data, p[3]);
        if (!ok) deny('member create', { path, data });
        return;
      }
      const ch = changedKeys(before, data);
      const photoOk = d => (d.photo ?? '') === '' || (typeof d.photo === 'string' && d.photo.length <= 300 && /^https:\/\/lh[0-9]\.googleusercontent\.com\/[^ ]+$/.test(d.photo));
      const own = ctx.uid === p[3] && ch.every(k => ['name', 'position', 'office', 'email', 'joinedMs', 'updatedAt', 'photo'].includes(k)) && cardOk(data, p[3]) && photoOk({ ...before, ...data });
      const cust = isCust(ctx, sid) && ch.every(k => ['name', 'position', 'office', 'status', 'approvedMs', 'removedMs', 'editedMs', 'by', 'updatedAt', 'librarian', 'librarianMs', 'mergedInto', 'mergedIntoName', 'mergedMs'].includes(k)) &&
        ['pending', 'active', 'removed'].includes(data.status ?? 'active') && cardOk(data, p[3]);
      if (!own && !cust) deny('member update', { path, data, ch });
      return;
    }
    if (p.length === 4 && sub === 'purchaseRequests') {
      if (kind === 'create') {
        if (!isStaff(ctx, sid) || apprStatus(data) !== 'pending') deny('pr create', { path, approval: data.approval });
        return;
      }
      const ch = changedKeys(before, data);
      if (isStaff(ctx, sid)) {
        const same = JSON.stringify(before.approval ?? null) === JSON.stringify(data.approval ?? null);
        const ok = same ? !(apprStatus(before) === 'approved' && ch.some(k => PR_CONTENT.includes(k)))
          : apprStatus(data) === 'pending' || (apprStatus(data) === 'approved' && data.approval.via === 'paper' && !school(sid).headUid);
        if (!ok) deny('pr update (custodian)', { path, ch, approval: data.approval });
        return;
      }
      const a = data.approval || {};
      if (isHeadOf(ctx, sid) && ch.every(k => ['approval', 'updatedAt'].includes(k)) && apprStatus(before) === 'pending' &&
          ['approved', 'returned'].includes(a.status) && a.via === 'app' && a.byUid === ctx.uid && str(a.note ?? '', 300)) return;
      deny('pr update', { path, ch, approval: data.approval });
    }
    if (p.length === 4 && sub === 'heads') {
      if (kind === 'create') {
        const keys = ['uid', 'name', 'designation', 'email', 'joinedMs', 'status', 'invite', 'updatedAt'];
        const inv = typeof data.invite === 'string' && data.invite && store.get(`schools/${sid}/headInvites/${data.invite}`);
        const ok = ctx.uid === p[3] && ctx.provider === 'google.com' && school(sid) && !erasing(sid) && !isStaff(ctx, sid) &&
          Object.keys(data).every(k => keys.includes(k)) && data.status === 'pending' && !!(inv && inv.active === true) && headCardOk(data, p[3]);
        if (!ok) deny('head create', { path, data, provider: ctx.provider });
        return;
      }
      const ch = changedKeys(before, data);
      const gPhotoOk = d => (d.photo ?? '') === '' || (typeof d.photo === 'string' && d.photo.length <= 300 && /^https:\/\/lh[0-9]\.googleusercontent\.com\/[^ ]+$/.test(d.photo));
      const own = ctx.uid === p[3] && ch.every(k => ['name', 'designation', 'email', 'updatedAt', 'photo'].includes(k)) && headCardOk(data, p[3]) && gPhotoOk({ ...before, ...data });
      const cust = isCust(ctx, sid) && ch.every(k => ['name', 'designation', 'status', 'approvedMs', 'removedMs', 'by', 'updatedAt'].includes(k)) &&
        ['pending', 'active', 'removed'].includes(data.status) && headCardOk(data, p[3]);
      if (!own && !cust) deny('head update', { path, data, ch });
      return;
    }
    if (p.length === 4 && sub === 'headInvites') {
      if (!isCust(ctx, sid)) deny('head invite write', { path });
      return;
    }
    if (p.length === 4 && sub === 'staffInvites') {
      if (!isCust(ctx, sid)) deny('staff invite write', { path });
      return;
    }
    if (p.length === 4 && sub === 'staff') {
      const okCard = d => d.uid === p[3] && typeof d.name === 'string' && d.name.length > 0 && d.name.length <= 80 && str(d.designation, 80) && str(d.email ?? '', 120);
      const invOk = d => { const inv = typeof d.invite === 'string' && d.invite && store.get(`schools/${sid}/staffInvites/${d.invite}`); return !!(inv && inv.active === true); };
      if (kind === 'create') {
        const keys = ['uid', 'name', 'designation', 'email', 'joinedMs', 'status', 'invite', 'createdAt'];
        const ok = ctx.uid === p[3] && ctx.provider === 'google.com' && school(sid) && !erasing(sid) && !isStaff(ctx, sid) && (school(sid).headUid || '') !== ctx.uid &&
          Object.keys(data).every(k => keys.includes(k)) && data.status === 'pending' && invOk(data) && okCard(data);
        if (!ok) deny('staff card create', { path, data });
        return;
      }
      const ch = changedKeys(before, data);
      const gPhotoOk = d => (d.photo ?? '') === '' || (typeof d.photo === 'string' && d.photo.length <= 300 && /^https:\/\/lh[0-9]\.googleusercontent\.com\/[^ ]+$/.test(d.photo));
      const own = ctx.uid === p[3] && ch.every(k => ['name', 'designation', 'email', 'updatedAt', 'photo'].includes(k)) && okCard(data) && gPhotoOk({ ...before, ...data });
      const again = ctx.uid === p[3] && before.status === 'removed' && data.status === 'pending' && !isStaff(ctx, sid) &&
        ch.every(k => ['name', 'designation', 'email', 'status', 'invite', 'joinedMs', 'updatedAt'].includes(k)) && invOk(data) && okCard(data);
      const cust = isCust(ctx, sid) && ch.every(k => ['status', 'approvedMs', 'removedMs', 'by', 'updatedAt'].includes(k)) && ['pending', 'active', 'removed'].includes(data.status);
      if (!own && !again && !cust) deny('staff card update', { path, ch });
      return;
    }
    if (p.length === 4 && sub === 'approvals') {
      const bodyOk = d => ['ris', 'writeoff', 'count', 'books', 'leave'].includes(d.kind) && typeof d.refId === 'string' && d.refId.length > 0 && d.refId.length <= 120 &&
        str(d.title ?? '', 160) && str(d.summary ?? '', 600) && Array.isArray(d.lines ?? []) && (d.lines ?? []).length <= 200;
      if (kind === 'create') {
        if (!(isStaff(ctx, sid) && school(sid).headUid && data.status === 'pending' && !('decision' in data) && data.byUid === ctx.uid && bodyOk(data))) deny('approval create', { path, status: data.status });
        return;
      }
      const ch = changedKeys(before, data);
      if (isStaff(ctx, sid)) {
        const ok = JSON.stringify(before.decision ?? null) === JSON.stringify(data.decision ?? null) && data.kind === before.kind && data.refId === before.refId &&
          (before.status === 'approved' ? ch.every(k => ['appliedMs', 'updatedAt'].includes(k)) : ['pending', 'cancelled'].includes(data.status) && bodyOk(data));
        if (!ok) deny('approval update (staff)', { path, ch, status: data.status });
        return;
      }
      const dec = data.decision || {};
      if (isHeadOf(ctx, sid) && before.status === 'pending' && ch.every(k => ['status', 'decision', 'updatedAt'].includes(k)) &&
          ['approved', 'returned'].includes(data.status) && dec.byUid === ctx.uid && str(dec.byName ?? '', 80) && str(dec.note ?? '', 300)) return;
      deny('approval update', { path, ch });
    }
    if (p.length === 4 && sub === 'suggestions') {
      const bodyOk = d => Array.isArray(d.ops) && d.ops.length > 0 && d.ops.length <= 150 && Array.isArray(d.lines ?? []) && (d.lines ?? []).length <= 150 &&
        str(d.title ?? '', 160) && str(d.byName ?? '', 80);
      if (kind === 'create') {
        if (!(isHeadOf(ctx, sid) && data.byUid === ctx.uid && data.status === 'pending' && !('decision' in data) && bodyOk(data))) deny('suggestion create', { path });
        return;
      }
      const ch = changedKeys(before, data);
      if (isHeadOf(ctx, sid) && before.byUid === ctx.uid && before.status === 'pending' && ch.every(k => ['status', 'updatedAt'].includes(k)) && data.status === 'cancelled') return;
      const dec = data.decision || {};
      if (isStaff(ctx, sid) && before.status === 'pending' && ch.every(k => ['status', 'decision', 'updatedAt'].includes(k)) &&
          ['accepted', 'declined'].includes(data.status) && dec.byUid === ctx.uid && str(dec.note ?? '', 300)) return;
      deny('suggestion update', { path, ch });
    }
    if (p.length === 4 && sub === 'dashboard') {
      if (!(isStaff(ctx, sid) && p[3] === 'summary')) deny('dashboard write', { path });
      return;
    }
    if (p.length === 4 && sub === 'auditLog') {
      const head = isHeadOf(ctx, sid);
      const asst = isAssistant(ctx, sid);
      const ok = kind === 'create' && (isStaff(ctx, sid) || head) && (data.role === 'assistant') === asst && Object.keys(data).every(k => ['uid', 'name', 'role', 'device', 'entries', 'createdAt'].includes(k)) &&
        data.uid === ctx.uid && !!(data.createdAt && Math.abs(data.createdAt.seconds * 1000 - (Date.now() + clock.offset)) < 5000) /* request.time */ && (data.role === 'head') === head && ['custodian', 'head', 'assistant'].includes(data.role) &&
        str(data.name, 80) && str(data.device, 40) && Array.isArray(data.entries) && data.entries.length > 0 && data.entries.length <= 100;
      if (!ok) deny('audit log write', { path, kind, role: data.role });
      return;
    }
    if (p.length === 4 && sub === 'turnoverInvites') {
      if (!isCust(ctx, sid) && !isHeadOf(ctx, sid)) deny('turnover invite write', { path });
      return;
    }
    if (p.length === 4 && sub === 'turnovers') {
      const cardOk2 = d => typeof d.name === 'string' && d.name.length > 0 && d.name.length <= 80 && str(d.designation, 80) && str(d.email ?? '', 120);
      if (kind === 'create') {
        const keys = ['uid', 'name', 'designation', 'email', 'joinedMs', 'status', 'invite', 'createdAt'];
        const inv = typeof data.invite === 'string' && data.invite && store.get(`schools/${sid}/turnoverInvites/${data.invite}`);
        const ok = data.uid === ctx.uid && p[3] === `${ctx.uid}-${data.invite}` && ctx.provider === 'google.com' && school(sid) && !erasing(sid) &&
          !isCust(ctx, sid) && (school(sid).headUid || '') !== ctx.uid && Object.keys(data).every(k => keys.includes(k)) &&
          data.status === 'pending' && !!(inv && inv.active === true) && cardOk2(data);
        if (!ok) deny('turnover card create', { path, data, provider: ctx.provider });
        return;
      }
      const ch = changedKeys(before, data);
      if (!(isCust(ctx, sid) || isHeadOf(ctx, sid)) || before.status !== 'pending' || data.uid !== before.uid) deny('turnover card update', { path, data });
      if (data.status === 'declined' && ch.every(k => ['status', 'by', 'doneMs', 'updatedAt'].includes(k))) return;
      if (data.status === 'done' && ch.every(k => ['status', 'fromUids', 'fromName', 'fromDesig', 'assumedOn', 'confirmedBy', 'doneMs', 'updatedAt'].includes(k)) &&
          (data.confirmedBy || {}).uid === ctx.uid) {
        // getAfter(school): the same batch makes this card's owner the one custodian
        const op = (batchOps || []).find(([k, pth]) => pth === `schools/${sid}` && k !== 'delete');
        const schoolAfter = op ? { ...(store.get(`schools/${sid}`) || {}), ...op[2] } : store.get(`schools/${sid}`);
        if (JSON.stringify(schoolAfter.custodians) === JSON.stringify([before.uid]) && schoolAfter.turnoverId === p[3]) return;
      }
      deny('turnover card update', { path, data, ch });
    }
    if (p.length === 4 && sub === 'invites') {
      if (!isCust(ctx, sid)) deny('invite write', { path });
      return;
    }
    if (p.length === 4 && sub === 'stock') {
      if (!isStaff(ctx, sid)) deny('stock write', { path });
      return;
    }
    if (p.length === 4 && sub === 'stockHolds') {
      if (kind === 'create') {
        const keys = ['uid', 'name', 'reqId', 'lines', 'status', 'createdMs'];
        const ok = isMember(ctx, sid) && Object.keys(data).every(k => keys.includes(k)) && data.uid === ctx.uid && data.reqId === p[3] &&
          data.status === 'open' && Array.isArray(data.lines) && data.lines.length > 0 && data.lines.length <= 50;
        if (!ok) deny('stock hold create', { path, data });
        return;
      }
      if (isStaff(ctx, sid) && data.uid === before.uid) return;
      const ch = changedKeys(before, data);
      if (before.uid === ctx.uid && before.status === 'open' && data.status === 'cancelled' && ch.every(k => k === 'status')) return;
      deny('stock hold update', { path, data });
    }
    if (p.length === 4 && sub === 'teacherReports') {
      if (kind === 'create') {
        if (!isMember(ctx, sid)) deny('teacher report create: not an approved member', { path });
        const keys = ['uid', 'name', 'kind', 'releaseId', 'releaseNo', 'code', 'desc', 'units', 'reason', 'note', 'status', 'createdMs', 'createdAt'];
        const ok = school(sid) && Object.keys(data).every(k => keys.includes(k)) && data.uid === ctx.uid && ['received', 'problem', 'return', 'count', 'life'].includes(data.kind) &&
          data.status === 'open' && str(data.name, 80) && str(data.desc, 160) && str(data.note, 300) && Array.isArray(data.units) && data.units.length <= 50;
        if (!ok) deny('teacher report create', { path, data });
        return;
      }
      const aft = { ...before, ...data };
      if (isCust(ctx, sid) && aft.mergedFrom === before.uid) return;
      if (!isStaff(ctx, sid) || aft.uid !== before.uid) deny('teacher report update', { path, data });
      return;
    }
    if (p.length === 4 && sub === 'releases') {
      if (!isStaff(ctx, sid)) deny('release write', { path });
      return;
    }
    // ---- Books & Library (firestore.rules) ----
    if (p.length === 4 && sub === 'books') {
      if (!bookStaff(ctx, sid)) deny('books write', { path });
      return;
    }
    if (p.length === 4 && sub === 'bookMeta') {
      if (!(bookStaff(ctx, sid) && p[3] === 'places')) deny('bookMeta write', { path });
      return;
    }
    if (p.length === 4 && sub === 'bookIndex') {
      if (!(bookStaff(ctx, sid) && /^[0-9]{1,3}$/.test(p[3]))) deny('bookIndex write', { path });
      return;
    }
    if (p.length === 4 && sub === 'bookMoves') {
      if (isStaff(ctx, sid)) return;
      if (kind === 'create') {
        if (isLibrarian(ctx, sid) && ['move', 'return'].includes(data.kind) && (data.toUid ?? '') === '') return;
        deny('bookMoves create', { path, kind: data.kind });
      }
      const ch = changedKeys(before, data);
      if (isMember(ctx, sid) && before.toUid === ctx.uid && before.status === 'sent' && data.status === 'done' &&
          ch.every(k => ['status', 'receivedMs', 'receivedBy', 'updatedAt'].includes(k)) && str(data.receivedBy ?? '', 80)) return;
      deny('bookMoves update', { path, ch });
    }
    if (p.length === 4 && sub === 'loans') {
      if (bookStaff(ctx, sid) && loanOk(data)) return;
      if (kind === 'create') {
        if (isMember(ctx, sid) && loanOk(data) && data.borrowerUid === ctx.uid && data.status === 'requested' && data.keeperUid !== ctx.uid) return;
        deny('loan create', { path, data });
      }
      const ch = changedKeys(before, data);
      const keeperKeys = ['status', 'outMs', 'lentBy', 'dueISO', 'decidedNote', 'decidedMs', 'returnedMs', 'retBy', 'lostMs', 'lostBy', 'updatedAt'];
      if (isMember(ctx, sid) && before.keeperUid === ctx.uid && before.borrowerUid !== ctx.uid && ch.every(k => keeperKeys.includes(k)) &&
          (before.status === 'requested' ? ['out', 'declined', 'requested'].includes(data.status) : before.status === 'out' && ['out', 'returned', 'lost'].includes(data.status)) &&
          str(data.decidedNote ?? '', 200)) return;
      if (before.borrowerUid === ctx.uid && ((before.status === 'requested' && data.status === 'cancelled' && ch.every(k => ['status', 'updatedAt'].includes(k))) ||
          (before.status === 'out' && data.status === 'out' && ch.every(k => ['retSaidMs', 'updatedAt'].includes(k))))) return;
      deny('loan update', { path, ch, status: data.status });
    }
    if (p.length === 4 && sub === 'leaves') {
      if (!leaveOn(sid)) deny('leave: not a pilot school', { path });
      const okBody = ['applied', 'sh', 'approved', 'hold', 'returned', 'review', 'handed', 'signed', 'done', 'declined', 'cancelled'].includes(data.status) &&
        typeof (data.uid ?? '') === 'string' && str(data.name ?? '', 120) && (data.name ?? '').length > 0 && str(data.reason ?? '', 600) && str(data.type ?? '', 12) &&
        Array.isArray(data.log ?? []) && (data.log ?? []).length <= 80;
      if (!okBody) deny('leave body', { path, status: data.status });
      if (kind === 'create') {
        if (isStaff(ctx, sid) || (isMember(ctx, sid) && data.uid === ctx.uid && data.status === 'applied' && data.by === 'teacher')) return;
        if (isHeadOf(ctx, sid) && data.uid === ctx.uid && data.status === 'applied' && data.by === 'head') return;
        deny('leave create', { path });
      }
      const ch = changedKeys(before, data);
      if (isStaff(ctx, sid) && (data.uid ?? '') === (before.uid ?? '')) return;
      if ((isMember(ctx, sid) || isHeadOf(ctx, sid)) && before.uid === ctx.uid && before.status === 'applied' && data.status === 'cancelled' &&
          ch.every(k => ['status', 'cancelledMs', 'log', 'updatedAt'].includes(k))) return;
      deny('leave update', { path, ch, status: data.status });
    }
    if (p.length === 4 && sub === 'planYears') {
      if (!planOn(sid)) deny('plan year: not a pilot school', { path });
      if ((isStaff(ctx, sid) || isHeadOf(ctx, sid)) && data.sy === p[3] && SY_RE.test(p[3]) && Array.isArray(data.terms ?? []) && (data.terms ?? []).length <= 4 &&
          Array.isArray(data.days ?? []) && (data.days ?? []).length <= 400 && str(data.memo ?? '', 300)) return;
      deny('plan year write', { path });
    }
    if (p.length === 4 && sub === 'ppas') {
      if (!planOn(sid)) deny('ppa: not a pilot school', { path });
      const ok = data.kind === 'event' && str(data.title ?? '', 160) && (data.title ?? '').length > 0 && SY_RE.test(data.sy ?? '') &&
        typeof data.from === 'string' && data.from.length === 10 && typeof (data.to ?? '') === 'string' && ['planned', 'cancelled'].includes(data.status) &&
        str(data.venue ?? '', 120) && str(data.note ?? '', 400) && Array.isArray(data.log ?? []) && (data.log ?? []).length <= 80;
      if ((isStaff(ctx, sid) || isHeadOf(ctx, sid)) && ok) return;
      deny('ppa write', { path, data });
    }
    if (p.length === 4 && sub === 'leaveCards') {
      if (!leaveOn(sid)) deny('leave card: not a pilot school', { path });
      const uidOk = typeof (data.uid ?? '') === 'string' && ((data.uid ?? '') === '' || data.uid === p[3]) && (kind === 'create' || !store.has(path) || (data.uid ?? '') === (before.uid ?? ''));
      if (isStaff(ctx, sid) && uidOk && str(data.name ?? '', 120) && (data.name ?? '').length > 0 && Array.isArray(data.entries ?? []) && (data.entries ?? []).length <= 800) return;
      deny('leave card write', { path });
    }
    if (p.length === 4 && sub === 'classBooks') {
      if (isStaff(ctx, sid)) return;
      if (isMember(ctx, sid) && data.uid === ctx.uid && p[3] === `${data.sy ?? ''}_${ctx.uid}` && (!before.uid || before.uid === ctx.uid) &&
          Array.isArray(data.learners ?? []) && (data.learners ?? []).length <= 80 && Array.isArray(data.titles ?? []) && (data.titles ?? []).length <= 60) return;
      deny('classBooks write', { path });
    }
    if (p.length === 4 && sub === 'inspections') {
      if (isStaff(ctx, sid)) return;
      const ch = changedKeys(before, data);
      if (kind !== 'create' && isMember(ctx, sid) && before.inspectorUid === ctx.uid && before.status === 'assigned' && data.status === 'inspected' &&
          ch.every(k => ['lines', 'status', 'inspectedMs', 'dateInspected', 'inspectedVia', 'updatedAt'].includes(k)) &&
          Array.isArray(data.lines) && data.lines.length === (before.lines || []).length) return;
      deny('inspection write', { path, ch });
    }
    if (p.length === 4 && CUSTODIAN_ONLY.includes(sub)) {
      if (isCust(ctx, sid)) return;
      // the assistant can't remove inventory or catalog items
      if (isAssistant(ctx, sid) && !(sub !== 'settings' && ({ ...before, ...data }).deleted === true && data.deleted !== undefined)) return;
      deny(`${sub} write`, { path });
    }
    deny('no rule', { path });
  }

  function checkRead(path, filters, ctx, single = false) {
    const p = parts(path);
    if (!ctx.uid) deny('read signed out', { path });
    if (p[0] === 'schoolIds') { if (single && p.length === 2) return; deny('list school ids', { path }); }
    if (p[0] === 'teacherSchools') { if (single && p.length === 2 && ctx.uid === p[1]) return; deny('read teacher schools', { path }); }
    if (p.length <= 2) {
      if (single) return;
      if (p[0] === 'appConfig') deny('list appConfig', { path });
      if (p[0] === 'schools' && p.length === 1 && isAdmin(ctx)) return;   // the Admin panel's schools list
      if (!filters.some(f => (['custodians', 'viewerUids', 'assistants'].includes(f.field) && f.op === 'array-contains' && f.value === ctx.uid) ||
          (f.field === 'headUid' && f.op === '==' && f.value === ctx.uid && ctx.provider === 'google.com'))) deny('list schools', { path, filters });
      return;
    }
    const sid = p[1], sub = p[2];
    if (sub === 'requests') {
      if (canView(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get request', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list requests', { path, filters });
      return;
    }
    if (CUSTODIAN_ONLY.includes(sub)) { if (!canView(ctx, sid) && !isHeadOf(ctx, sid)) deny(`read ${sub}`, { path }); return; }
    if (sub === 'suggestions') { if (!canView(ctx, sid) && !isHeadOf(ctx, sid)) deny('read suggestions', { path }); return; }
    if (sub === 'turnovers') {
      if (canView(ctx, sid) || isHeadOf(ctx, sid) || (single && p[3].split('-')[0] === ctx.uid)) return;
      deny('read turnovers', { path, uid: ctx.uid });
    }
    if (sub === 'staff') {
      if (canView(ctx, sid) || (single && p[3] === ctx.uid)) return;
      deny('read staff', { path });
    }
    if (sub === 'staffInvites') {
      if (single || isCust(ctx, sid)) return;
      deny('list staff invites', { path });
    }
    if (sub === 'approvals' || sub === 'dashboard') {
      if (canView(ctx, sid) || isHeadOf(ctx, sid)) return;
      deny(`read ${sub}`, { path });
    }
    if (sub === 'auditLog') {
      if (canView(ctx, sid) || isHeadOf(ctx, sid)) return;
      deny('read auditLog', { path });
    }
    if (sub === 'turnoverInvites') {
      if (single || canView(ctx, sid) || isHeadOf(ctx, sid)) return;
      deny('list turnover invites', { path });
    }
    if (sub === 'purchaseRequests') { if (!canView(ctx, sid) && !isHeadOf(ctx, sid)) deny('read purchaseRequests', { path, uid: ctx.uid }); return; }
    if (sub === 'heads') {
      if (canView(ctx, sid) || (single && p[3] === ctx.uid)) return;
      deny('read heads', { path });
    }
    if (sub === 'headInvites') {
      if (single || isCust(ctx, sid)) return;
      deny('list head invites', { path });
    }
    if (sub === 'members') {
      if (canView(ctx, sid) || (single && p[3] === ctx.uid)) return;
      deny('read members', { path });
    }
    if (sub === 'invites') {
      if (single || isCust(ctx, sid)) return;
      deny('list invites', { path });
    }
    if (sub === 'stock' || sub === 'stockHolds') {
      if (canView(ctx, sid) || isMember(ctx, sid)) return;
      deny(`read ${sub}`, { path, uid: ctx.uid });
    }
    if (sub === 'books') { if (canView(ctx, sid) || isLibrarian(ctx, sid)) return; deny('read books', { path }); }
    if (sub === 'bookMeta' || sub === 'bookIndex') { if (canView(ctx, sid) || isMember(ctx, sid) || isHeadOf(ctx, sid)) return; deny(`read ${sub}`, { path, uid: ctx.uid }); }
    if (sub === 'bookMoves') {
      if (canView(ctx, sid) || isLibrarian(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.toUid === ctx.uid) return; deny('get bookMove', { path }); }
      if (!filters.some(f => f.field === 'toUid' && f.op === '==' && f.value === ctx.uid)) deny('list bookMoves', { path, filters });
      return;
    }
    if (sub === 'loans') {
      if (canView(ctx, sid) || isLibrarian(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && (d.borrowerUid === ctx.uid || d.keeperUid === ctx.uid)) return; deny('get loan', { path }); }
      if (!filters.some(f => ['borrowerUid', 'keeperUid'].includes(f.field) && f.op === '==' && f.value === ctx.uid)) deny('list loans', { path, filters });
      return;
    }
    if (sub === 'leaves') {
      if (!leaveRead(sid)) deny('read leaves: not a pilot school', { path });
      if (canView(ctx, sid) || isHeadOf(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get leave', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list leaves', { path, filters });
      return;
    }
    if (sub === 'planYears' || sub === 'ppas') {
      if (!planRead(sid)) deny(`read ${sub}: not a pilot school`, { path });
      if (canView(ctx, sid) || isHeadOf(ctx, sid) || isMember(ctx, sid)) return;
      deny(`read ${sub}`, { path, uid: ctx.uid });
    }
    if (sub === 'leaveCards') {
      if (!leaveRead(sid)) deny('read leave cards: not a pilot school', { path });
      if (canView(ctx, sid) || isHeadOf(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get leave card', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list leave cards', { path, filters });
      return;
    }
    if (sub === 'classBooks') {
      if (canView(ctx, sid)) return;
      if (single) { const d = store.get(path); if (!d || d.uid === ctx.uid) return; deny('get classBooks', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list classBooks', { path, filters });
      return;
    }
    if (sub === 'teacherReports') {
      if (canView(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get teacher report', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list teacher reports', { path, filters });
      return;
    }
    if (sub === 'inspections') {
      if (canView(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.inspectorUid === ctx.uid) return; deny('get inspection', { path }); }
      if (!filters.some(f => f.field === 'inspectorUid' && f.op === '==' && f.value === ctx.uid)) deny('list inspections', { path, filters });
      return;
    }
    if (sub === 'releases') {
      if (canView(ctx, sid) || isHeadOf(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.teacherUid === ctx.uid) return; deny('get release', { path }); }
      if (!filters.some(f => f.field === 'teacherUid' && f.op === '==' && f.value === ctx.uid)) deny('list releases', { path, filters });
      return;
    }
    deny('read: no rule', { path });
  }

  // kind: 'set' (replace), 'merge' (set with { merge: true }) or 'update'. Rules see the
  // document as it would be after the write (request.resource.data), like Firestore.
  // Deletes (Reset app → erase the school): the custodian of that school only, like firestore.rules.
  function remove(path, ctx) {
    const p = parts(path);
    const before = store.get(path);
    if (!ctx.uid) deny('delete signed out', { path });
    if (p[0] === 'schoolIds' && p.length === 2) {
      if (before && !isCust(ctx, before.schoolId)) deny('school id delete', { path });
    } else if (p[0] === 'teacherSchools' && p.length === 2) {
      if (ctx.uid !== p[1]) deny('teacher schools delete', { path });
    } else if (p[0] === 'schools' && (p.length === 2 || p.length === 4)) {
      if (p[2] === 'auditLog') deny('audit log delete', { path });
      if (!isCust(ctx, p[1])) deny('delete', { path });
    } else deny('delete: no rule', { path });
    store.delete(path);
    writes.push(path);
  }
  function write(kind, path, data, ctx) {
    if (kind === 'delete') return remove(path, ctx);
    const before = store.get(path);
    if (kind === 'update' && !before) throw new Error('not-found');
    let after = kind === 'set' || !before ? resolveTS(data) : { ...before, ...resolveTS(data) };
    const p = parts(path);
    // members/requests/reports/holds rules look at the whole document; others at what was sent
    const whole = p.length === 4 && ['members', 'stockHolds', 'inspections', 'purchaseRequests', 'heads', 'turnovers', 'auditLog', 'staff', 'approvals', 'suggestions', 'loans', 'bookMoves', 'classBooks', 'leaves', 'leaveCards', 'planYears', 'ppas'].includes(p[2]);
    checkWrite(before ? 'update' : 'create', path, whole ? after : data, before || {}, ctx);
    if (autoApprove && !before && p.length === 4 && p[2] === 'members' && after.status === 'pending') after = { ...after, status: 'active', approvedMs: Date.now() };
    store.set(path, after);
    writes.push(path);
  }

  const gUser = (uid, acct) => ({ uid, email: acct.email, displayName: acct.name, photoURL: acct.photo || null, provider: 'google.com', isAnonymous: false, providerData: [{ providerId: 'google.com' }] });
  const ops = {
    anon: () => ({ uid: 'anon' + (++uidSeq), provider: 'anonymous', isAnonymous: true, providerData: [] }),
    createUser: ({ email, pass }) => {
      if (users.has(email)) throw new Error('auth/email-already-in-use');
      if (pass.length < 6) throw new Error('auth/weak-password');
      const u = { uid: 'user' + (++uidSeq), email, provider: 'password', isAnonymous: false, providerData: [{ providerId: 'password' }] };
      users.set(email, { ...u, pass });
      return u;
    },
    signIn: ({ email, pass }) => {
      const u = users.get(email);
      if (!u || u.pass !== pass) throw new Error('auth/invalid-credential');
      const { pass: _, ...pub } = u;
      return pub;
    },
    google: ({ acct }) => {
      if (!acct) throw new Error('auth/popup-closed-by-user');
      let uid = googleUsers.get(acct.email);
      if (!uid) { uid = 'g' + (++uidSeq); googleUsers.set(acct.email, uid); }
      return gUser(uid, acct);
    },
    linkGoogle: ({ uid, acct }) => {
      if (!acct) throw new Error('auth/popup-closed-by-user');
      if (googleUsers.has(acct.email)) throw new Error('auth/credential-already-in-use');
      googleUsers.set(acct.email, uid);
      return gUser(uid, acct);
    },
    get: ({ path, ctx }) => { checkRead(path, [], ctx, true); return { id: path.split('/').pop(), data: store.get(path) ?? null }; },
    list: ({ path, filters, ctx }) => {
      checkRead(path, filters, ctx);
      const depth = parts(path).length + 1;
      return [...store.entries()]
        .filter(([p]) => p.startsWith(path + '/') && parts(p).length === depth)
        .filter(([, d]) => filters.every(f => matches(d, f)))
        .map(([p, d]) => ({ id: p.split('/').pop(), data: d }));
    },
    batch: ({ ops: list, ctx }) => {
      const snapshot = new Map(store);
      batchBefore = snapshot; batchOps = list;
      try { list.forEach(([kind, path, data]) => write(kind, path, data, ctx)); }
      catch (e) { store.clear(); snapshot.forEach((v, k) => store.set(k, v)); throw e; }
      finally { batchBefore = null; batchOps = null; }
      return true;
    }
  };

  // where() as Firestore compares: == / array-contains, and < <= > >= on numbers or times
  // (a Date in a query arrives as { __date: ms }; stored times are { seconds, nanoseconds }).
  function matches(d, f) {
    const x = d[f.field];
    if (f.op === '==') return x === f.value;
    if (f.op === 'array-contains') return (x || []).includes(f.value);
    if (['>', '>=', '<', '<='].includes(f.op)) {
      const ms = v => (v && typeof v === 'object' ? (typeof v.seconds === 'number' ? v.seconds * 1000 + (v.nanoseconds || 0) / 1e6 : typeof v.__date === 'number' ? v.__date : NaN) : v);
      const isTime = v => v && typeof v === 'object' && (typeof v.seconds === 'number' || typeof v.__date === 'number');
      if (x === undefined || x === null || isTime(x) !== isTime(f.value)) return false;   // types must match
      const a = ms(x), b = ms(f.value);
      if (typeof a !== 'number' || typeof b !== 'number' || isNaN(a) || isNaN(b)) return false;
      return f.op === '>' ? a > b : f.op === '>=' ? a >= b : f.op === '<' ? a < b : a <= b;
    }
    return true;
  }

  const handler = async (op, json) => {
    try { return JSON.stringify({ result: ops[op](JSON.parse(json)) }); }
    catch (e) { return JSON.stringify({ error: e.message }); }
  };
  const docs = prefix => [...store.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, d]) => ({ path: p, ...d }));
  return { store, denied, writes, handler, docs, clock, setAdminSchool: id => { adminSid = id; } };
}
