// Test stand-in for assets/cloud/firebase.js (window.FirebaseSDK): the same function names
// the app uses, backed by one shared in-memory store in the test runner (window.__fb), which
// applies the same access rules as firestore.rules (see fake-backend.mjs).
//
// Offline: set window.__fakeOffline = true. Writes are then queued on the phone (snapshots
// show them with hasPendingWrites + fromCache, like Firestore's offline cache) and are sent
// in order once window.__fakeOffline is false again.
window.FirebaseSDK = (() => {
  const rpc = (op, args) => window.__fb(op, JSON.stringify(args)).then(r => {
    const o = JSON.parse(r);
    if (o.error) { const e = new Error(o.error); e.code = o.error; throw e; }
    return o.result;
  });
  const err = code => Object.assign(new Error(code), { code });

  // ---- auth ----
  const auth = { currentUser: null, listeners: [], config: {} };
  try { auth.currentUser = JSON.parse(localStorage.getItem('__fakeAuthUser') || 'null'); } catch (e) {}
  const setUser = u => {
    auth.currentUser = u;
    if (u) localStorage.setItem('__fakeAuthUser', JSON.stringify(u)); else localStorage.removeItem('__fakeAuthUser');
    auth.listeners.forEach(f => f(u));
  };
  const ctx = () => ({ uid: auth.currentUser && auth.currentUser.uid, provider: auth.currentUser && auth.currentUser.provider });

  // ---- offline queue ----
  const queue = []; // { ops:[[kind,path,data]], resolve, reject }
  let flushing = false;
  async function flush() {
    if (flushing || window.__fakeOffline) return;
    flushing = true;
    try {
      while (queue.length && !window.__fakeOffline) {
        const w = queue[0];
        try { await rpc('batch', { ops: w.ops, ctx: w.ctx }); w.resolve(); }
        catch (e) { w.reject(e); }
        queue.shift();
      }
    } finally { flushing = false; }
  }
  setInterval(flush, 100);
  function write(ops) {
    return new Promise((resolve, reject) => { queue.push({ ops, ctx: ctx(), resolve, reject }); flush(); });
  }
  const resolveTS = v => {
    if (v && typeof v === 'object' && v.__ts) return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
    if (Array.isArray(v)) return v.map(resolveTS);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveTS(x)]));
    return v;
  };
  // Apply queued writes on top of server data (what the phone shows while they wait).
  function overlay(path, docs) {
    const map = new Map(docs.map(d => [d.id, { ...d }]));
    let pending = false;
    queue.forEach(w => w.ops.forEach(([kind, p, data]) => {
      const parts = p.split('/');
      const id = parts.pop();
      if (parts.join('/') !== path) return;
      pending = true;
      const before = map.get(id);
      map.set(id, { id, data: kind === 'set' || !before ? resolveTS(data) : { ...before.data, ...resolveTS(data) } });
    }));
    return { docs: [...map.values()], pending };
  }

  let seq = 0;
  const autoId = () => 'id' + Math.random().toString(36).slice(2, 10) + (++seq).toString(36);
  const col = path => ({ type: 'col', path, id: path.split('/').pop() });
  const docRef = path => ({ type: 'doc', path, id: path.split('/').pop() });
  const snapDoc = (d, pending = false, fromCache = false) => ({
    id: d.id, exists: () => d.data !== null && d.data !== undefined,
    data: () => (d.data ? JSON.parse(JSON.stringify(d.data)) : undefined),
    metadata: { hasPendingWrites: pending, fromCache }
  });

  class GoogleAuthProvider {
    setCustomParameters(p) { this.params = p; }
    static credentialFromError(e) { return e.acct ? { acct: e.acct } : null; }
  }

  return {
    initializeApp: options => ({ options }),
    getAuth: () => auth,
    onAuthStateChanged: (a, f) => { a.listeners.push(f); setTimeout(() => f(a.currentUser), 0); return () => { a.listeners = a.listeners.filter(x => x !== f); }; },
    signInAnonymously: async () => { const u = await rpc('anon', {}); setUser(u); return { user: u }; },
    createUserWithEmailAndPassword: async (a, email, pass) => { const u = await rpc('createUser', { email, pass }); setUser(u); return { user: u }; },
    signInWithEmailAndPassword: async (a, email, pass) => { const u = await rpc('signIn', { email, pass }); setUser(u); return { user: u }; },
    sendPasswordResetEmail: async () => {},
    signOut: async () => setUser(null),
    updateProfile: async () => {},
    GoogleAuthProvider,
    signInWithPopup: async () => {
      if (window.__googlePopupBlocked) throw err('auth/popup-blocked');
      const u = await rpc('google', { acct: window.__googleAccount }); setUser(u); return { user: u };
    },
    linkWithPopup: async user => {
      try { const u = await rpc('linkGoogle', { uid: user.uid, acct: window.__googleAccount }); setUser(u); return { user: u }; }
      catch (e) { e.acct = window.__googleAccount; throw e; }
    },
    signInWithCredential: async (a, cred) => { const u = await rpc('google', { acct: cred.acct }); setUser(u); return { user: u }; },
    signInWithRedirect: async () => { localStorage.setItem('__fakeRedirect', JSON.stringify(window.__googleAccount)); location.reload(); },
    getRedirectResult: async () => {
      const acct = JSON.parse(localStorage.getItem('__fakeRedirect') || 'null');
      localStorage.removeItem('__fakeRedirect');
      if (!acct) return null;
      const u = await rpc('google', { acct }); setUser(u); return { user: u };
    },

    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    collection: (base, ...segs) => col((base && base.path ? [base.path, ...segs] : segs).join('/')),
    doc: (base, ...segs) => {
      if (base && base.type === 'col') return docRef(base.path + '/' + (segs[0] || autoId()));
      return docRef((base && base.path ? [base.path, ...segs] : segs).join('/'));
    },
    getDoc: async ref => {
      if (window.__fakeOffline) throw err('unavailable');
      return snapDoc(await rpc('get', { path: ref.path, ctx: ctx() }));
    },
    getDocs: async q => {
      if (window.__fakeOffline) throw err('unavailable');
      return { docs: (await rpc('list', { path: q.path, filters: q.filters || [], ctx: ctx() })).map(d => snapDoc(d)) };
    },
    setDoc: (ref, data) => write([['set', ref.path, data]]),
    updateDoc: (ref, data) => write([['update', ref.path, data]]),
    addDoc: async (c, data) => { const ref = docRef(c.path + '/' + autoId()); await write([['set', ref.path, data]]); return ref; },
    query: (c, ...filters) => ({ type: 'query', path: c.path, filters: filters.filter(f => f && f.field) }),
    where: (field, op, value) => ({ field, op, value }),
    orderBy: () => null,
    limit: () => null,
    serverTimestamp: () => ({ __ts: true }),
    arrayUnion: (...v) => ({ __union: v }),
    runTransaction: async () => { throw err('unimplemented'); },
    writeBatch: () => {
      const ops = [];
      return {
        set: (r, d) => { ops.push(['set', r.path, d]); },
        update: (r, d) => { ops.push(['update', r.path, d]); },
        commit: () => write(ops)
      };
    },
    // Polling listener: emits when the (server + queued) result or its metadata changes.
    onSnapshot: (q, a, b, c) => {
      const next = typeof a === 'function' ? a : b;
      const onError = typeof a === 'function' ? b : c;
      let last = null, stopped = false, cached = null;
      const isDoc = q.type === 'doc';
      const tick = async () => {
        if (stopped) return;
        try {
          const offline = !!window.__fakeOffline;
          let docs;
          if (offline) docs = cached || [];
          else {
            docs = isDoc
              ? [await rpc('get', { path: q.path, ctx: ctx() })]
              : await rpc('list', { path: q.path, filters: q.filters || [], ctx: ctx() });
            cached = docs;
          }
          let pending = false;
          if (!isDoc) {
            const filters = q.filters || [];
            const o = overlay(q.path, docs);
            pending = o.pending;
            docs = o.docs.filter(d => filters.every(f => f.op === '==' ? d.data && d.data[f.field] === f.value : true));
          }
          const sig = JSON.stringify([docs, pending, offline]);
          if (sig !== last && !stopped) {
            last = sig;
            const meta = { hasPendingWrites: pending, fromCache: offline };
            if (isDoc) next(snapDoc(docs[0] || { id: q.id, data: null }, pending, offline));
            else next({ docs: docs.map(d => snapDoc(d, pending, offline)), metadata: meta });
          }
        } catch (e) {
          if (onError) onError(e);
          stopped = true;
          return;
        }
        setTimeout(tick, 120);
      };
      setTimeout(tick, 0);
      return () => { stopped = true; };
    }
  };
})();
