# Portable-School-Inventory

**CustodianPro** – a school general inventory & APP-CSE 2027 counter for property custodians,
optimised for iPad/tablet use. It is a single static page (`index.html`) served by GitHub Pages:

https://jorzyrockz-crypto.github.io/Portable-School-Inventory/

## Home screen: encode without distractions

The app opens on **Home**, which only asks one thing: *What are you encoding?*

1. **Type a few letters** of the item name or its stock code. The catalog and your custom items are searched together.
2. **Tap a result**, or press Enter for the top one. A sheet slides up with a big quantity stepper, the unit and one-tap room chips. The chips are rooms you already use plus common school rooms.
3. **Save & next** saves the item, shows an **Undo** toast and clears the search, ready for the next item. Pressing Enter in the quantity field also saves. **More details** opens the full item editor for price, condition, units and so on.

If nothing matches, the last row offers to add what you typed as a new custom item.

When the search box is empty, Home shows:
- three big tiles: **Scan ICS**, **Import** and **Count**. While a count is running, the Count tile shows a progress bar. A **Scan tag** tile appears once you have tagged units.
- your last 5 **recently encoded** items, which you can tap to edit.
- one status line with the number of items, total value and last backup. It links to Reports. The backup reminder appears here only when a backup is overdue.

Everything else moved out of the way:

| Where | What |
| --- | --- |
| **My Items** tab | your in-stock ledger, plus the physical count checklist while counting |
| **Catalog** tab | the full APP-CSE catalog with part tabs and category filters |
| **Reports** tab | valuation, condition, property tags, categories, rooms, print and APP-CSE summary |
| **☰ More** menu | add custom item, import, scan ICS / QR, print, CSV exports, school info, backup, restore, change history, sample data |

## Supply requests & Purchase Requests

Teachers request supplies from their own phones; the custodian reviews each request, checks it against stock, approves it, and turns approved requests into a **Purchase Request (Appendix 60)**.

**Teacher**
1. Open the invite link (or scan the QR code) the custodian shared, then type your name, position and grade/section once.
2. Tap **New supply request**, search for items (e.g. “bond paper”, “ballpen”) or type anything not in the catalog, set quantities, add a purpose and a needed-by date, and send.
3. Follow the status on the same screen: *To review → Approved → Being purchased (PR No.) → Supplied*, or *Declined* with the custodian’s reason. A pending request can still be cancelled.

A teacher’s phone only shows the request screen and only that teacher’s own requests — never the school inventory.

**Custodian**
1. On Home, tap **Supply requests** (also in ☰ More) and sign in with an email and password. The first sign-in creates your school.
2. Tap **Invite** and send the link or QR code to your faculty group chat.
3. **To review**: open a request to see *asked / on hand / to buy* for every line. Edit names, quantities, units and unit costs, link a line to an inventory item, add a note, then **Approve** or **Decline** (with a reason). You can also enter walk-in requests with **New**.
4. **To purchase**: tick approved requests and tap **Prepare Purchase Request**. Only the quantity not in stock goes on the PR (asked minus on hand, editable). Identical items from several teachers are added together, and their names go in the Purpose.
5. Check the PR header (entity, fund cluster, office, PR No., responsibility center code, date), the lines and the signatories, then **Save & print**. Saved PRs are listed under **Purchase requests**, where you can reprint them or export them to CSV. Mark a request **Supplied** once the items are handed over.

### Supply requests: Firebase setup (one time, ~10 minutes)

Requests travel through your own free Firebase project (Spark plan). Until it is set up, the rest of the app works as usual and the Supply requests card shows these steps.

1. Go to <https://console.firebase.google.com>, click **Create a project**, and give it a name (Google Analytics is not needed).
2. **Build → Authentication → Get started → Sign-in method**: turn on **Email/Password** (for the custodian) and **Anonymous** (for teachers).
3. **Authentication → Settings → Authorized domains**: add `jorzyrockz-crypto.github.io`.
4. **Build → Firestore Database → Create database**: pick a location near you (e.g. `asia-southeast1`, Singapore) and start in **production mode**.
5. **Firestore → Rules**: replace the contents with [`firestore.rules`](firestore.rules) from this repository and click **Publish**. These rules let teachers create and read only their own requests, and only the custodian read all requests and create Purchase Requests.
6. **Project settings (⚙) → Your apps → Web (`</>`)**: register an app, copy the `firebaseConfig` object, paste it into [`firebase-config.js`](firebase-config.js) in place of `null`, and commit to `main`.

The config values are not secret; access is controlled by the published rules. Phones pick up the new config the next time they open the app online.

## Equipment condition tracking

For equipment (ICS/PAR) items, the item editor records how many on-hand units are
**Serviceable**, **Needs Repair** or **Unserviceable** (serviceable is computed so the three
always add up to the quantity). The split appears on the dashboard ("Equipment Condition"),
in the ledger's *Repair / Unserviceable* tab, in the printed report's *Condition* column, and as
three extra columns in the CSV export — handy for the RPCPPE physical count and IIRUP disposal.

## Property numbers, QR labels & scanning

Equipment can be tracked **per unit** instead of only as a count:

1. In the dashboard ledger, tap the purple **QR** button on an equipment item (or *Tag units* in
   the item editor), then **Tag N units**. Each unit gets a property number such as
   `SJNHS-2026-0001` (prefix = school initials, or set your own under *School Info*). Any number
   can be edited to match a sticker that is already on the item. The condition counts already
   recorded for the item carry over to the new units.
2. Per unit you can record the serial number, location, who it is assigned to, and its condition.
   Once an item has units, its Serviceable / Repair / Unserviceable counts come from the units.
3. **Print QR labels** – 3 across on A4/Letter; cut them out, or print on sticker paper.
4. **Scan** (bottom bar, or *Scan Tags* on the dashboard) opens the camera. Each label scanned
   is marked *verified today*, and the dashboard shows how many units were verified this year,
   which helps with the annual physical count. Numbers can also be typed in by hand.
5. **Property register (CSV)** exports one row per unit. The printed report and the inventory
   CSV list each item's property numbers.

On-hand quantity can't go below the number of tagged units; remove a unit (disposed of,
transferred or lost) from its list first. The QR generator and reader are bundled in
`assets/vendor/`, so tagging and scanning work offline too. The camera needs HTTPS (GitHub Pages
is fine) and permission to use the camera.

## Change history

Every change is recorded automatically with the date, time and custodian name:
- counts (taps on the same item within 3 minutes are merged, e.g. *Quantity 12 → 15*)
- prices, minimum alert levels, locations and classification
- condition
- property numbers: tagged, renamed or removed (with the reason you enter), plus scans and
  label printing
- school info, sample data, reset, backups and restores

Open it from **Change History** in *Quick Custodian Tools*, or from the clock button in the item
editor / *History* in the property-number list to see one item. You can filter by type, search,
and **Export CSV**. The latest 3,000 changes are kept on the device and included in backups.

## Importing from Excel or CSV

Already keep your inventory in a spreadsheet? Tap **Import** (in *Quick tools*, or
**Import Excel / CSV** on an empty dashboard) and choose an `.xlsx` or `.csv` file.

- The first sheet is read. Title rows above the column headings are fine — the app
  finds the header row and guesses which column is the description, quantity, item code,
  unit, unit cost, room/location and repair/unserviceable counts. Change any of them
  before importing. The DepEd RPCI layout works as-is (it uses *On Hand Per Count*,
  not *Balance Per Card*).
- Rows are matched to the APP-CSE catalog by item code, then by description (case and
  spacing don't matter). Several rows for the same item, such as one row per room, are
  added together. Rows that don't match can be added as custom items.
- **Replace** sets each quantity to the number in the file; **Add to current** adds it
  to what you already have. Quantities never go below the number of tagged property
  units.
- Every import makes one Change History entry, and you can **Undo** it right away.
- The file is read on the iPad itself and is never uploaded. Old `.xls` (Excel 97-2003)
  files aren't supported — in Excel use *Save As › Excel Workbook (.xlsx)* or *CSV*.
- A CSV made with **Export CSV** imports straight back, so it doubles as a simple
  spreadsheet round trip.

## Physical count progress

Tap **Start count** on the dashboard, give the count a name (e.g. "Year-end count
2026"), then go around the school checking items off:

- Each ledger row gets a check button. Changing an item's quantity or saving it also
  marks it as counted.
- The progress bar shows how many items are counted out of all items you have in
  stock. **Not counted** filters the ledger to what's left.
- **Finish** shows which items were missed and writes a summary into Change History.
- The count survives closing the app and is included in JSON backups.

## Scanning a printed ICS

Encode an approved **Inventory Custodian Slip** (COA Appendix 59) from a photo instead of
typing it. Tap **Scan ICS (Inventory Custodian Slip)** in *Quick tools* or in the
*Property Tags* panel, then **Take photo of ICS**.

- The photo is cleaned up on the phone or tablet (straightened, adaptive black and
  white, table lines removed) and read with [Tesseract.js](https://github.com/naptha/tesseract.js).
  Nothing is uploaded. The first scan downloads the text reader (about 7 MB); after
  that, scanning works offline.
- You get an editable review before anything is saved:
  - **Header:** ICS No., date received, received by (accountable person) and position.
  - **Each line:** quantity, unit, unit cost, description, inventory item no. and
    estimated useful life.
  - **Save to:** the suggested catalog item, or a new custom item.
- Quantities are cross-checked with the money columns (total cost ÷ unit cost).
  Look-alike letters in item-number prefixes (SJNHS / SINHS) are corrected against your
  property-number prefix. Each line notes anything that was guessed or corrected.
- **Save** adds the quantities to stock (untick for items already counted that the ICS
  only assigns). It also creates one property record per unit with the inventory item
  no. (ranges like `SJNHS-2026-0101 to 0105` are expanded), the ICS No. and date, the
  useful life, and the person who received it. Units without an item no. get the next
  numbers in your series. Items on an ICS are marked ICS/PAR (equipment).
- Re-scanning an ICS No. that was already encoded shows a warning, and inventory item
  numbers that already exist block saving. One Change History entry is written, with
  **Undo** right after saving.
- No camera reading? Under **Paste text instead**, paste text copied with Google Lens
  (*Select text › Copy*), Samsung *Extract text*, or the cells of the ICS Excel file.
- Typed or printed ICS work well. Handwriting is not read reliably. Lay the page flat
  in good light and fill the screen with it.

The property register CSV now also lists ICS No., ICS date and estimated useful life.

## Equipment vs. consumable classification

Each item is automatically classified as **Equipment (ICS/PAR)** or **Consumable (RIS)** by
category, by name (e.g. CHAIR, CABINET, WHITEBOARD, ROUTER, UPS – regardless of unit) and by
price (anything counted per "unit" costing ₱500 or more). If an item is classified wrongly,
open it and pick **Equipment** or **Consumable** under *Classification*; choose **Auto** to go
back to the automatic rule. Custom items can be classified when they are added.

## Works offline

CustodianPro is an installable Progressive Web App:

- Everything it needs (styles, fonts, icons) is self-hosted in `assets/` – no CDNs.
- `sw.js` (service worker) caches the whole app on the first visit, so it opens with no internet.
- On iPad/iPhone: open the site in **Safari → Share → Add to Home Screen**.
  On Android/Chrome/Edge: use **Install app** from the browser menu.
- Inventory data is stored on the device (`localStorage`). Use **Backup Data** regularly –
  clearing the browser's website data erases it. The app shows *Last backup: …* under the
  dashboard tools and a reminder banner when changes haven't been backed up for 7 days
  (1 day if you have never made a backup). **Restore** shows what a backup contains before
  replacing anything, and offers **Undo** right after.

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
| `scripts/build-assets.mjs` | Compiles Tailwind, self-hosts fonts, subsets icon fonts, copies the QR libraries to `assets/vendor/`, writes `sw.js` |
| `scripts/build-icons.mjs` | Regenerates the home-screen icons (`npm run icons`) |
| `manifest.webmanifest` | PWA metadata (name, icons, colours) |

Generated files (`assets/`, `sw.js`) are committed so GitHub Pages can serve them directly.
