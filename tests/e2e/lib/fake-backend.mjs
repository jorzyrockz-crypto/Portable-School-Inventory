// Shared in-memory Firestore + Auth for the test phones. Enforces the same access rules as
// firestore.rules; every refusal is recorded in `denied` (an app flow should cause none).
// autoApprove (default): a teacher who joins is approved at once, as if the custodian tapped
// Approve, so suites about other things need no approval step. Pass { autoApprove: false } to
// test approvals.
export function createBackend({ autoApprove = true } = {}) {
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
  const canView = (ctx, sid) => isCust(ctx, sid) || isViewer(ctx, sid);
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const CUSTODIAN_ONLY = ['inventory', 'catalog', 'settings'];
  // The confirmed School Head (school.headUid), never one of the custodians.
  const isHeadOf = (ctx, sid) => !!(ctx.uid && schoolPre(sid) && schoolPre(sid).headUid === ctx.uid && !isCust(ctx, sid));
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
  const changedKeys = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const cardOk = (data, uid) => data.uid === uid && typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 80 &&
    str(data.position, 80) && str(data.office, 80) && str(data.email ?? '', 120);

  function checkWrite(kind, path, data, before, ctx) {
    const p = parts(path);
    if (!ctx.uid) deny('not signed in', { kind, path });
    if (p[0] === 'schoolIds' && p.length === 2) {
      const ok = Object.keys(data).every(k => ['schoolId', 'name', 'updatedMs'].includes(k)) && str(data.name, 120);
      if (kind === 'create' || !before) {
        if (!/^[0-9]{6}$/.test(p[1]) || !ok || typeof data.schoolId !== 'string' || !isCust(ctx, data.schoolId)) deny('school id create', { path, data });
      } else if (!ok || !((isCust(ctx, before.schoolId) && (data.schoolId ?? before.schoolId) === before.schoolId) ||
                          (!school(before.schoolId) && typeof data.schoolId === 'string' && isCust(ctx, data.schoolId)))) deny('school id update', { path, data });
      return;
    }
    if (p[0] !== 'schools') deny('unknown collection', { path });
    if (p.length === 2) {
      if (kind === 'create') {
        if (!['password', 'google.com'].includes(ctx.provider) || data.ownerUid !== ctx.uid ||
            JSON.stringify(data.custodians) !== JSON.stringify([ctx.uid]) || !str(data.name, 120)) deny('school create', { path, data });
      } else {
        const after = { ...before, ...data };
        const ownerSame = !data.ownerUid || data.ownerUid === before.ownerUid;
        if (isCust(ctx, p[1])) {
          if (!ownerSame && !turnoverOk(p[1], before, after)) deny('school update: owner changes only with a confirmed turnover', { path, data });
        } else if (isHeadOf(ctx, p[1])) {
          const keys = ['custodians', 'ownerUid', 'turnoverId', 'turnoverMs', 'custodianName', 'custodianDesig', 'viewOnly', 'viewerUids'];
          if (!turnoverOk(p[1], before, after) || !changedKeys(before, after).every(k => keys.includes(k))) deny('school update (head)', { path, data });
        } else deny('school update', { path });
        if (after.headUid && (after.custodians || []).includes(after.headUid)) deny('school update: head is a custodian', { path, data });
      }
      return;
    }
    const sid = p[1], sub = p[2];
    if (p.length === 4 && sub === 'requests') {
      if (kind === 'create') {
        const keys = ['uid', 'name', 'position', 'office', 'purpose', 'neededBy', 'lines', 'status', 'createdAt', 'clientAt', 'via', 'kind'];
        if (!(isCust(ctx, sid) || isMember(ctx, sid))) deny('request create: not an approved member', { path });
        const ok = school(sid) && Object.keys(data).every(k => keys.includes(k)) && data.uid === ctx.uid && data.status === 'pending' &&
          ['request', 'took'].includes(data.kind ?? 'request') &&
          typeof data.name === 'string' && data.name.length > 0 && data.name.length <= 80 && str(data.position, 80) && str(data.office, 80) &&
          str(data.purpose, 300) && Array.isArray(data.lines) && data.lines.length > 0 && data.lines.length <= 50;
        if (!ok) deny('request create', { path, data });
        return;
      }
      const after = { ...before, ...data };
      if (isCust(ctx, sid) && after.uid === before.uid) return;
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
      const own = ctx.uid === p[3] && ch.every(k => ['name', 'position', 'office', 'email', 'joinedMs', 'updatedAt'].includes(k)) && cardOk(data, p[3]);
      const cust = isCust(ctx, sid) && ch.every(k => ['name', 'position', 'office', 'status', 'approvedMs', 'removedMs', 'editedMs', 'by', 'updatedAt'].includes(k)) &&
        ['pending', 'active', 'removed'].includes(data.status ?? 'active') && cardOk(data, p[3]);
      if (!own && !cust) deny('member update', { path, data, ch });
      return;
    }
    if (p.length === 4 && sub === 'purchaseRequests') {
      if (kind === 'create') {
        if (!isCust(ctx, sid) || apprStatus(data) !== 'pending') deny('pr create', { path, approval: data.approval });
        return;
      }
      const ch = changedKeys(before, data);
      if (isCust(ctx, sid)) {
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
        const ok = ctx.uid === p[3] && ctx.provider === 'google.com' && school(sid) && !erasing(sid) && !isCust(ctx, sid) &&
          Object.keys(data).every(k => keys.includes(k)) && data.status === 'pending' && !!(inv && inv.active === true) && headCardOk(data, p[3]);
        if (!ok) deny('head create', { path, data, provider: ctx.provider });
        return;
      }
      const ch = changedKeys(before, data);
      const own = ctx.uid === p[3] && ch.every(k => ['name', 'designation', 'email', 'updatedAt'].includes(k)) && headCardOk(data, p[3]);
      const cust = isCust(ctx, sid) && ch.every(k => ['name', 'designation', 'status', 'approvedMs', 'removedMs', 'by', 'updatedAt'].includes(k)) &&
        ['pending', 'active', 'removed'].includes(data.status) && headCardOk(data, p[3]);
      if (!own && !cust) deny('head update', { path, data, ch });
      return;
    }
    if (p.length === 4 && sub === 'headInvites') {
      if (!isCust(ctx, sid)) deny('head invite write', { path });
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
      if (!isCust(ctx, sid)) deny('stock write', { path });
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
      if (isCust(ctx, sid) && data.uid === before.uid) return;
      const ch = changedKeys(before, data);
      if (before.uid === ctx.uid && before.status === 'open' && data.status === 'cancelled' && ch.every(k => k === 'status')) return;
      deny('stock hold update', { path, data });
    }
    if (p.length === 4 && sub === 'teacherReports') {
      if (kind === 'create') {
        if (!isMember(ctx, sid)) deny('teacher report create: not an approved member', { path });
        const keys = ['uid', 'name', 'kind', 'releaseId', 'releaseNo', 'code', 'desc', 'units', 'reason', 'note', 'status', 'createdMs', 'createdAt'];
        const ok = school(sid) && Object.keys(data).every(k => keys.includes(k)) && data.uid === ctx.uid && ['received', 'problem', 'return', 'count'].includes(data.kind) &&
          data.status === 'open' && str(data.name, 80) && str(data.desc, 160) && str(data.note, 300) && Array.isArray(data.units) && data.units.length <= 50;
        if (!ok) deny('teacher report create', { path, data });
        return;
      }
      if (!isCust(ctx, sid) || ({ ...before, ...data }).uid !== before.uid) deny('teacher report update', { path, data });
      return;
    }
    if (p.length === 4 && sub === 'releases') {
      if (!isCust(ctx, sid)) deny('release write', { path });
      return;
    }
    if (p.length === 4 && sub === 'inspections') {
      if (isCust(ctx, sid)) return;
      const ch = changedKeys(before, data);
      if (kind !== 'create' && isMember(ctx, sid) && before.inspectorUid === ctx.uid && before.status === 'assigned' && data.status === 'inspected' &&
          ch.every(k => ['lines', 'status', 'inspectedMs', 'dateInspected', 'inspectedVia', 'updatedAt'].includes(k)) &&
          Array.isArray(data.lines) && data.lines.length === (before.lines || []).length) return;
      deny('inspection write', { path, ch });
    }
    if (p.length === 4 && CUSTODIAN_ONLY.includes(sub)) {
      if (!isCust(ctx, sid)) deny(`${sub} write`, { path });
      return;
    }
    deny('no rule', { path });
  }

  function checkRead(path, filters, ctx, single = false) {
    const p = parts(path);
    if (!ctx.uid) deny('read signed out', { path });
    if (p[0] === 'schoolIds') { if (single && p.length === 2) return; deny('list school ids', { path }); }
    if (p.length <= 2) {
      if (single) return;
      if (!filters.some(f => ['custodians', 'viewerUids'].includes(f.field) && f.op === 'array-contains' && f.value === ctx.uid)) deny('list schools', { path, filters });
      return;
    }
    const sid = p[1], sub = p[2];
    if (sub === 'requests') {
      if (canView(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get request', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list requests', { path, filters });
      return;
    }
    if (CUSTODIAN_ONLY.includes(sub)) { if (!canView(ctx, sid)) deny(`read ${sub}`, { path }); return; }
    if (sub === 'turnovers') {
      if (canView(ctx, sid) || isHeadOf(ctx, sid) || (single && p[3].split('-')[0] === ctx.uid)) return;
      deny('read turnovers', { path, uid: ctx.uid });
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
      if (canView(ctx, sid)) return;
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
    } else if (p[0] === 'schools' && (p.length === 2 || p.length === 4)) {
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
    const whole = p.length === 4 && ['members', 'stockHolds', 'inspections', 'purchaseRequests', 'heads', 'turnovers'].includes(p[2]);
    checkWrite(before ? 'update' : 'create', path, whole ? after : data, before || {}, ctx);
    if (autoApprove && !before && p.length === 4 && p[2] === 'members' && after.status === 'pending') after = { ...after, status: 'active', approvedMs: Date.now() };
    store.set(path, after);
    writes.push(path);
  }

  const gUser = (uid, acct) => ({ uid, email: acct.email, displayName: acct.name, provider: 'google.com', isAnonymous: false, providerData: [{ providerId: 'google.com' }] });
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
  return { store, denied, writes, handler, docs, clock };
}
