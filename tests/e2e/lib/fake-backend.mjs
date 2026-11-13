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
  const resolveTS = v => {
    if (v && typeof v === 'object' && v.__ts) return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
    if (Array.isArray(v)) return v.map(resolveTS);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveTS(x)]));
    return v;
  };
  const deny = (why, op) => { denied.push(`${why} · ${JSON.stringify(op).slice(0, 240)}`); throw new Error('permission-denied'); };
  const parts = p => p.split('/');
  const school = id => store.get(`schools/${id}`);
  const isCust = (ctx, sid) => !!(ctx.uid && school(sid) && (school(sid).custodians || []).includes(ctx.uid));
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const CUSTODIAN_ONLY = ['purchaseRequests', 'inventory', 'catalog', 'settings'];
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
      } else if (!isCust(ctx, p[1]) || (data.ownerUid && data.ownerUid !== before.ownerUid)) deny('school update', { path });
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
      if (!filters.some(f => f.field === 'custodians' && f.op === 'array-contains' && f.value === ctx.uid)) deny('list schools', { path, filters });
      return;
    }
    const sid = p[1], sub = p[2];
    if (sub === 'requests') {
      if (isCust(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get request', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list requests', { path, filters });
      return;
    }
    if (CUSTODIAN_ONLY.includes(sub)) { if (!isCust(ctx, sid)) deny(`read ${sub}`, { path }); return; }
    if (sub === 'members') {
      if (isCust(ctx, sid) || (single && p[3] === ctx.uid)) return;
      deny('read members', { path });
    }
    if (sub === 'invites') {
      if (single || isCust(ctx, sid)) return;
      deny('list invites', { path });
    }
    if (sub === 'stock' || sub === 'stockHolds') {
      if (isCust(ctx, sid) || isMember(ctx, sid)) return;
      deny(`read ${sub}`, { path, uid: ctx.uid });
    }
    if (sub === 'teacherReports') {
      if (isCust(ctx, sid)) return;
      if (single) { const d = store.get(path); if (d && d.uid === ctx.uid) return; deny('get teacher report', { path }); }
      if (!filters.some(f => f.field === 'uid' && f.op === '==' && f.value === ctx.uid)) deny('list teacher reports', { path, filters });
      return;
    }
    if (sub === 'releases') {
      if (isCust(ctx, sid)) return;
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
    const whole = p.length === 4 && ['members', 'stockHolds'].includes(p[2]);
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
        .filter(([, d]) => filters.every(f => f.op === '==' ? d[f.field] === f.value : f.op === 'array-contains' ? (d[f.field] || []).includes(f.value) : true))
        .map(([p, d]) => ({ id: p.split('/').pop(), data: d }));
    },
    batch: ({ ops: list, ctx }) => {
      const snapshot = new Map(store);
      try { list.forEach(([kind, path, data]) => write(kind, path, data, ctx)); }
      catch (e) { store.clear(); snapshot.forEach((v, k) => store.set(k, v)); throw e; }
      return true;
    }
  };

  const handler = async (op, json) => {
    try { return JSON.stringify({ result: ops[op](JSON.parse(json)) }); }
    catch (e) { return JSON.stringify({ error: e.message }); }
  };
  const docs = prefix => [...store.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, d]) => ({ path: p, ...d }));
  return { store, denied, writes, handler, docs };
}
