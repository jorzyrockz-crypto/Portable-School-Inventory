// Shared in-memory Firestore + Auth for the test phones. Enforces the same access rules as
// firestore.rules; every refusal is recorded in `denied` (an app flow should cause none).
export function createBackend() {
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

  function checkWrite(kind, path, data, before, ctx) {
    const p = parts(path);
    if (!ctx.uid) deny('not signed in', { kind, path });
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
        const keys = ['uid', 'name', 'position', 'office', 'purpose', 'neededBy', 'lines', 'status', 'createdAt', 'clientAt', 'via'];
        const ok = school(sid) && Object.keys(data).every(k => keys.includes(k)) && data.uid === ctx.uid && data.status === 'pending' &&
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
    if (p.length === 4 && CUSTODIAN_ONLY.includes(sub)) {
      if (!isCust(ctx, sid)) deny(`${sub} write`, { path });
      return;
    }
    deny('no rule', { path });
  }

  function checkRead(path, filters, ctx, single = false) {
    const p = parts(path);
    if (!ctx.uid) deny('read signed out', { path });
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
    deny('read: no rule', { path });
  }

  function write(kind, path, data, ctx) {
    const before = store.get(path);
    if (kind === 'update' && !before) throw new Error('not-found');
    checkWrite(before ? 'update' : 'create', path, data, before || {}, ctx);
    store.set(path, kind === 'set' ? resolveTS(data) : { ...before, ...resolveTS(data) });
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
