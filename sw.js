/* CustodianPro service worker – generated from src/sw.template.js by `npm run build`.
 *
 * - Precaches the whole app on first visit, so it opens with no internet.
 * - Page (index.html): network first (3 s timeout), falls back to the cached copy.
 * - Assets (CSS, fonts, icons): cache first – they are versioned via CACHE below.
 * - firebase-config.js (Supply Requests settings): network first like the page, so a
 *   config edited on GitHub reaches phones without a rebuild.
 * - Firebase SDK (assets/cloud/) is not precached; it is cached the first time it is used.
 * - Text recognition for "Scan ICS" (assets/ocr/, ~7 MB) is not precached; it is kept
 *   in its own cache the first time it is used, so app updates don't download it again.
 * - Tapping a phone notification (shown by the page while the app is open or was used
 *   recently; there is no push server) focuses CustodianPro and opens that notification.
 * - The page asks for this worker's version ("get-version") to tell whether an update
 *   brings anything new to the page that is open.
 * Inventory data itself lives in localStorage and never touches this cache.
 */
const CACHE = 'custodianpro-b40c02675a41';
const PRECACHE_URLS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./firebase-config.js",
    "./assets/app.css",
    "./assets/brand/banner.webp",
    "./assets/fonts/Phosphor-Bold.woff2",
    "./assets/fonts/Phosphor-Duotone.woff2",
    "./assets/fonts/Phosphor-Fill.woff2",
    "./assets/fonts/inter-latin-ext-wght-normal.woff2",
    "./assets/fonts/inter-latin-wght-normal.woff2",
    "./assets/fonts/jetbrains-mono-latin-ext-wght-normal.woff2",
    "./assets/fonts/jetbrains-mono-latin-wght-normal.woff2",
    "./assets/icons/apple-touch-icon.png",
    "./assets/icons/badge-96.png",
    "./assets/icons/favicon-32.png",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/icons/maskable-512.png",
    "./assets/icons/shortcut-count.png",
    "./assets/icons/shortcut-items.png",
    "./assets/icons/shortcut-requests.png",
    "./assets/icons/shortcut-scan.png",
    "./assets/vendor/fflate.LICENSE.txt",
    "./assets/vendor/fflate.js",
    "./assets/vendor/jsQR.LICENSE.txt",
    "./assets/vendor/jsQR.js",
    "./assets/vendor/qrcode.js"
  ];
const OCR_CACHE = 'custodianpro-ocr-7.0.0';
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('custodianpro-') && k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      cache.put('./index.html', response.clone());
      return response;
    }
    throw new Error(`HTTP ${response && response.status}`);
  } catch (err) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function handleConfig(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetchWithTimeout(new Request(request, { cache: 'no-cache' }), NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      cache.put('./firebase-config.js', response.clone());
      return response;
    }
    throw new Error(`HTTP ${response && response.status}`);
  } catch (err) {
    return (await cache.match('./firebase-config.js', { ignoreSearch: true })) || Response.error();
  }
}

async function handleAsset(request) {
  const isOcr = new URL(request.url).pathname.includes('/assets/ocr/');
  const cache = await caches.open(isOcr ? OCR_CACHE : CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  } else if (url.pathname.endsWith('/firebase-config.js')) {
    event.respondWith(handleConfig(request));
  } else {
    event.respondWith(handleAsset(request));
  }
});

// A tapped notification: bring an open CustodianPro window forward and tell it which
// notification was tapped, or open the app with ?notif=<id> when no window is left.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const nid = (event.notification.data && event.notification.data.nid) || '';
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => c.url.startsWith(scope));
    if (client) {
      try { await client.focus(); } catch (e) { /* focus is best effort */ }
      client.postMessage({ type: 'open-notification', nid });
      return;
    }
    await self.clients.openWindow(`${scope}?notif=${encodeURIComponent(nid)}`);
  })());
});

// The page compares this with its own version (meta app-version) before announcing an update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'get-version' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE.slice('custodianpro-'.length) });
  }
});
