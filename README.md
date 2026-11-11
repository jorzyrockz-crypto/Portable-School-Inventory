# Portable-School-Inventory

**CustodianPro** – a school general inventory & APP-CSE 2027 counter for property custodians,
optimised for iPad/tablet use. It is a single static page (`index.html`) served by GitHub Pages:

https://jorzyrockz-crypto.github.io/Portable-School-Inventory/

## Works offline

CustodianPro is an installable Progressive Web App:

- Everything it needs (styles, fonts, icons) is self-hosted in `assets/` – no CDNs.
- `sw.js` (service worker) caches the whole app on the first visit, so it opens with no internet.
- On iPad/iPhone: open the site in **Safari → Share → Add to Home Screen**.
  On Android/Chrome/Edge: use **Install app** from the browser menu.
- Inventory data is stored on the device (`localStorage`). Use **Backup Data** regularly –
  clearing the browser's website data erases it.

## Development

The page is plain HTML + inline JavaScript. CSS is compiled Tailwind, so after editing
`index.html` (new Tailwind classes or Phosphor icons) rebuild the assets:

```bash
npm install
npm run build   # -> assets/app.css, assets/fonts/*, sw.js (new cache version)
npm run serve   # http://localhost:8080
```

| File | Purpose |
| --- | --- |
| `index.html` | The app (markup + logic) |
| `tailwind.config.js` | Theme (brand colours, fonts) |
| `src/sw.template.js` | Service-worker source; `npm run build` writes `sw.js` |
| `scripts/build-assets.mjs` | Compiles Tailwind, self-hosts fonts, subsets icon fonts, writes `sw.js` |
| `scripts/build-icons.mjs` | Regenerates the home-screen icons (`npm run icons`) |
| `manifest.webmanifest` | PWA metadata (name, icons, colours) |

Generated files (`assets/`, `sw.js`) are committed so GitHub Pages can serve them directly.
