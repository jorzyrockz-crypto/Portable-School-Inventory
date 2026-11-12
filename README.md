# Portable-School-Inventory

![CustodianPro School Inventory – effortless classroom & equipment tracking](assets/brand/banner.png)

**CustodianPro** – a school general inventory & APP-CSE 2027 counter for property custodians,
optimised for iPad/tablet use. It is a single static page (`index.html`) served by GitHub Pages:

https://jorzyrockz-crypto.github.io/Portable-School-Inventory/

## Signing in

Every phone signs in before using the app. The sign-in screen shows the school art (a tall
picture on phones held upright, a wide one on tablets turned sideways and computers) and asks
who is using the phone:

- **Property custodian**: Google, or email and password. The first sign-in creates the school
  (*School* field). This is the same account that receives teachers' requests and keeps
  the **Inventory** saved online.
- **Teacher**: paste the invite link or type the school code from the custodian. Opening the
  invite link on the phone skips this step and goes straight to *Join*.

After that the app opens straight to Home, also without signal: the phone remembers who signed
in, and Firebase keeps the session. **More → Account → Sign out** (custodian) or **Leave**
(teacher) brings the sign-in screen back. When a custodian's session ends (password changed,
signed out on Firebase), the screen asks them to sign in again, or to start over.

Inventory that was already on a phone before sign-in was required is never lost. The welcome
card says how many items the phone has. On the custodian's first sign-in they become the school
inventory, or are merged with it (the merge question explains the choice).

Without a Firebase project (`firebase-config.js` set to `null`) there is nobody to sign in with,
so the app stays the local-only inventory with no sign-in screen.

## Welcome tour

After a property custodian's first sign-in (a new school), a three-step welcome replaces the bare invite sheet:

1. **Your school:** school name, the custodian's name and position, and the school head. These go on every printed form.
2. **Add your items:** import Excel/CSV, scan a printed ICS, pick from the catalog, or look around with sample data. The choice opens when the tour ends.
3. **Invite your teachers:** the QR code and school code, **Share link** and **Print poster**: an A4 poster with a big QR code and three steps for the faculty room (also in the invite sheet).

It is shown once per phone. **More → Welcome tour** opens it again.

## Questions and messages

Every question and message (*Sign out of CustodianPro?*, *Take back …?*, *Reason for declining*, *Restart now to update?* …) opens in the app's own dialog instead of the browser's “custodianpro.vercel.app says” box. Each one has a clear title and named buttons (**Sign out** / **Cancel**, **Restart** / **Later**), follows light/dark, and works with the keyboard (Enter, Escape, Tab). Tapping outside doesn't close it, so a stray tap can't lose an answer.

In code, use `appAlert(message, opts)`, `await appConfirm(message, opts)` and `await appPrompt(message, value, opts)` (`opts`: `title`, `ok`, `cancel`, `tone` = `ask`/`warn`/`danger`/`good`/`info`, `icon`, `label`, `placeholder`, `multiline`, `required`). Never use `alert` / `confirm` / `prompt`: the end-to-end tests report a native box as an error.

## Light and dark

The app follows the phone's light or dark setting. **More → Appearance** (teachers: at the
bottom of their screen) switches between **System**, **Light** and **Dark**. The choice is
applied before the first paint, so there is no white flash when opening the app at night.
Printed forms always use the light look. In dark mode the sign-in screen and the strip behind Home use a night version of the school picture, and the selected option of every switch (System/Light/Dark, My Items/Requests, transfer type…) is a lighter raised pill.

Dark colours are generated, not hand-written: `scripts/dark-theme.mjs` reads the Tailwind
colour classes in `index.html` (`bg-white`, `text-slate-900`, `bg-amber-50`,
`hover:bg-slate-50` …) and writes an `html.dark` counterpart for each one into
`assets/app.css`. New classes are picked up on the next `npm run build`.

## On a phone

CustodianPro is laid out for a 360–430 px phone first and widens on tablets and computers:

- Pop-ups become **bottom sheets** below 640 px (the `.sheet-sm` class on the overlay): full width, rounded top, buttons above the home indicator.
- Lists stack on a phone: **Inventory** rows are one tidy line per item (see below); **Catalog** cards put the stepper under the item name.
- Every tap target is at least 32 px (most 40 px); headers wrap their buttons onto a second row instead of squeezing the title.
- Toasts sit above the bottom tabs, move to the top while a sheet is open (also when the sheet opens after the toast), and go to the bottom on the sign-in screen so the logo stays visible.
- `tests/e2e/phone-layout.mjs` checks this at 390 × 844: no sideways scrolling, no small buttons, sheets anchored to the bottom, full peso amounts on Reports.
- **Touch tablets** (700 px and wider, `pointer: coarse`) scale the whole UI with the screen width: the root font size becomes `100vw / 42`, between 16 and 20 px, and every size is in rem. The phone-first column then fills the screen (686 of 800 px in portrait) instead of sitting small in the middle. The fixed-px caption classes (`text-[10px]`, `text-[11px]`…) are switched to rem inside that rule. Computers (mouse) and phones keep 16 px. A browser tab zoomed by Chrome reports a narrower width, so it is not enlarged twice. `tests/e2e/tablet-layout.mjs` checks this.

## Inventory (was *My Items*)

The custodian's list of everything the school has (quantity above 0). It was called *My Items*; the teacher's own *My Items* (what was released to them) keeps its name.

- **Top:** *Inventory*, the saved-online chip, `N items · ₱ total` and **Add items** (opens the Catalog). Then a search box (name, code, room, property or serial number, teacher) and a sort menu: highest value, name, room, most / least quantity.
- **Filter chips** wrap onto a second line instead of scrolling sideways, each with its count: *All · Equipment · Consumables · Low stock · Needs repair · With teachers*, plus *Not counted* during a physical count. Chips with nothing in them are hidden.
- **One row per item:** type icon, name (2 lines at most), *room · code*, at most two status labels (repair / unserviceable, low stock, with a teacher, tagged; more show as *+N*), and on the right the quantity and total value. There are no +/− buttons on the rows, so a count can't change by accident while scrolling.
- **Tap a row** for the **item sheet** (a bottom sheet on phones): on hand, unit cost and total value; a low-stock note; the quantity stepper; room, category, condition, property numbers and who has the units (each name opens that teacher's page); and **Release · Edit details · History** at the bottom.
- **During a physical count** each row has a check button on the left (tap to mark counted without opening the item), and the sheet has **Mark as counted**, which returns to the list.
- `tests/e2e/phone-layout.mjs` checks the rows, chips, sheet and count mode at 390 px; `release.mjs` and `teachers-overview.mjs` use the sheet for Release and the teacher links.

## Sharing and link previews

Links to CustodianPro (and teacher invite links) show a large preview in Messenger, Facebook, Viber, WhatsApp, Telegram, LinkedIn and X:

- `index.html` `<head>`: description, Open Graph and X (`twitter:`) tags, canonical address and WebApplication structured data (features, screenshots, free).
- `assets/brand/og-image.png` (1200×630): the banner, **drawn from the real app**. It shows the current Home and Inventory screens, so it never shows features the app doesn't have. The image URL carries `?v=<date>`; change it when the picture changes so Facebook and Messenger fetch it again.
- `assets/brand/social-preview.png` (1280×640): the same banner for GitHub (**Settings → General → Social preview**; uploaded by hand).
- `assets/brand/banner.png` / `.webp` (1024×434): the README header and **More → About**.

To redraw after a UI change (with the site served on `BASE_URL`):

```bash
cd tests/e2e
node make-screenshots.mjs   # assets/screenshots/ (install sheet), used by the banner
node make-banner.mjs        # assets/brand/og-image.png, social-preview.png, banner.png/.webp
```

## Planning notes

- [`docs/NOTIFICATIONS_PLAN.md`](docs/NOTIFICATIONS_PLAN.md): which channel is for what (title bar = app updates only), today's notifications, and where new ones would help (low stock, teacher joined, confirm-receipt reminders, year-end count, sync problems, push via FCM).
- [`docs/UI_REVIEW.md`](docs/UI_REVIEW.md): UI inspection findings across phone, tablet and computer, light and dark, with suggested fixes.

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
| **Inventory** tab | everything the school has (quantity above 0): search, filter chips, tap an item for its sheet; the physical count checklist while counting |
| **Catalog** tab | the full APP-CSE catalog with part tabs and category filters |
| **Reports** tab | valuation, condition, property tags, categories, rooms, print and APP-CSE summary |
| **☰ More** menu | add custom item, import, scan ICS / QR, print, CSV exports, school info, backup, restore, change history, sample data |

## Supply requests & Purchase Requests

Teachers request supplies from their own phones; the custodian reviews each request, checks it against stock, approves it, and turns approved requests into a **Purchase Request (Appendix 60)**.

**Teacher**
1. Open the invite link (or scan the QR code) the custodian shared, or choose **Teacher** on the sign-in screen and paste the link or type the school code. Then type your name, position and grade/section once.
2. Tap **New supply request**, search for items (e.g. “bond paper”, “ballpen”) or type anything not in the catalog, set quantities, add a purpose and a needed-by date, and send.
3. Follow the status on the same screen: *To review → Approved → Being purchased (PR No.) → Supplied*, or *Declined* with the custodian’s reason. A pending request can still be cancelled.

A teacher’s phone only shows the request screen and only that teacher’s own requests — never the school inventory.

**Custodian**
1. On the sign-in screen choose **Property custodian** and tap **Continue with Google** (or use email and password). The first sign-in creates your school. Requests are under **Supply requests** on Home (also in ☰ More).
2. Tap **Invite** and send the link or QR code to your faculty group chat.
3. **To review**: open a request to see *asked / on hand / to buy* for every line. Edit names, quantities, units and unit costs, link a line to an inventory item, add a note, then **Approve** or **Decline** (with a reason). You can also enter walk-in requests with **New**.
4. **To purchase**: tick approved requests and tap **Prepare Purchase Request**. Only the quantity not in stock goes on the PR (asked minus on hand, editable). Identical items from several teachers are added together, and their names go in the Purpose.
5. Check the PR header (entity, fund cluster, office, PR No., responsibility center code, date), the lines and the signatories, then **Save & print**. Saved PRs are listed under **Purchase requests**, where you can reprint them or export them to CSV. Mark a request **Supplied** once the items are handed over.

### Supply requests: Firebase setup

The app is connected to the Firebase project **russapps-custodianpro** (settings in [`firebase-config.js`](firebase-config.js)). In the [Firebase console](https://console.firebase.google.com/project/russapps-custodianpro), do these once:

1. **Build → Authentication → Get started → Sign-in method**: turn on
   - **Google** (custodian, and teachers who want their requests on every phone). Pick a support email and save.
   - **Anonymous** (teachers who just type their name).
   - **Email/Password** (optional: custodians without a Google account).
2. **Authentication → Settings → Authorized domains**: add `jorzyrockz-crypto.github.io`. Without it, Google sign-in shows “This website is not on the Firebase authorized domains list”.
3. **Build → Firestore Database → Create database**: pick a location near you (e.g. `asia-southeast1`, Singapore) and start in **production mode**.
4. **Firestore → Rules**: replace the contents with [`firestore.rules`](firestore.rules) from this repository and click **Publish**. These rules let teachers create and read only their own requests. Only the school’s custodian can list requests and create Purchase Requests. Only Google or email accounts can set up a school, and nothing can be deleted.

The config values are not secret; access is controlled by the published rules. To use a different project, replace the object in `firebase-config.js` (or set it to `null` to hide Supply requests).

**Switching to another project.** Data stays in the old project, so nothing moves over by itself. Each phone remembers which project it last used. On the first open after the switch, the app keeps the phone's inventory, history and settings, clears its link to the old school, and asks the custodian to sign in again.
- **Custodian:** signing in creates the school in the new project, and the Inventory uploads everything.
- **Teachers:** need a new invite link.

**Sign-in**
- **Custodian:** *Continue with Google* (or email + password). The first sign-in creates the school; signing in on another phone or tablet finds it again.
- **Teacher:** open the invite link, type your name, and tap *Continue* (no account needed), or *Continue with Google* to keep your requests when you change phones. You can also link Google later from the teacher screen.

**Offline**
- After the first online visit, the app and the sign-in stay on the phone.
- Firestore keeps a copy of the requests and Purchase Requests on the device, so the lists open without signal.
- New requests, approvals and PRs made offline are queued, marked *Sending…*, and sent automatically when the phone reconnects (also after the app is closed and reopened).
- Signing in for the first time needs internet.

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

## Releasing items to teachers

Teachers who join with the invite link are listed automatically (their phone sends their name, position and office). The custodian releases items from stock:

- **From a request:** an approved request with everything in stock, or a delivered one, has a **Release** button. The teacher and the approved items are filled in.
- **From Inventory:** tap the item, then **Release** in its sheet. Or tap **Release** at the top of Supply requests.
- **Supplies** go on a **RIS** (Requisition and Issue Slip, Appendix 63) and leave the stock count.
- **Equipment** goes on an **ICS** (Inventory Custodian Slip, Appendix 59). It stays in Inventory, and each unit shows *With Ana Reyes · ICS 2026-11-001*. Pick which property numbers to hand over. Units without one get the next number automatically.
- **Equipment worth ₱50,000 or more** (PPE under COA Circular 2022-004) goes on a **PAR** (Property Acknowledgment Receipt, Appendix 71) instead. One release can create an ICS and a PAR; each line says which slip it goes on, and the unit shows *With Ana Reyes · PAR 2026-11-001*.
- Numbers run per month (`2026-11-001`, …), separately for RIS, ICS, PAR, ITR, PTR and RRSP. The slips print from the done screen.
- Someone without an account (e.g. utility staff) can be typed in. The slip still prints.

**Items delivered** on a Purchase Request now adds the items to the stock in Inventory. Items that weren't in Inventory yet are added as new items. The requests then show *Ready* to the teacher until you release them.

**Assigned to** (Property Numbers) suggests the teachers. Picking one links the unit to that teacher's account. Names typed earlier or read from a scanned ICS (e.g. *MR. JUAN D. DELA CRUZ*) are linked automatically when *Juan Dela Cruz* joins. Titles, middle initials and *Last, First* order are ignored. Two teachers with the same name are left for you to pick.

Every release, assignment and return is kept as a record under the school (`releases`), and nothing is ever deleted. A teacher can read only the records made out to their own account. Teachers can't see the school inventory or the list of other teachers.

> Publish the updated [`firestore.rules`](firestore.rules) again after updating. The new parts are `members` and `releases`.

## Transfers between teachers and rooms

**Transfer** on a person's page (or on a unit in Property Numbers) moves equipment to another teacher, or to a new room with the same teacher:

- Tick the units, pick the new accountable person (or *Same person, new room*), the new room, the transfer type (**Donation**, **Reassignment**, **Relocate**, **Others**) and the reason.
- Items below ₱50,000 go on an **ITR** (Inventory Transfer Report, Annex A.5), items of ₱50,000 and up on a **PTR** (Property Transfer Report, Appendix 76). Each line keeps the unit's earlier ICS/PAR no.; the school head signs as *Approved by*.
- The new holder gets a notification and confirms the slip under **New from the property custodian**. The old holder's list drops the units and their history shows *Transferred out*. A room change alone isn't a new item to confirm.
- Every unit in Property Numbers has an **Accountability history**: issued, transferred, moved and returned, with the slip numbers.
- **Take back** and accepted returns print an **RRSP** (Receipt of Returned Semi-Expendable Property, Annex A.6) with its own number.

## Government forms

**Reports → Government forms** (also in **More**) fills the year-end COA/DepEd forms from what the app already knows, printed on A4 (the wide ones in landscape):

| Form | What it uses |
| --- | --- |
| **RPCPPE** (Appendix 73) / **RPCSP** (Annex A.8) – physical count | Each tagged unit counts as found when its QR was scanned or it was checked in the physical count since the chosen date. Shortage quantity and value, holder and room in Remarks. |
| **IIRUP** (Appendix 74) / **IIRUSP** (Annex A.10) – unserviceable property | Units marked *Unserviceable* in Property Numbers, with blank inspection, disposal and sales columns to fill in by hand. |
| **Slips & receipts** | Every RIS, ICS, PAR, ITR, PTR and RRSP made, filtered by form, to print again. |

The inventory committee, COA representative, fund cluster and similar names are remembered for next year; *As at* is always today unless changed.

## A teacher's My Items

On a teacher's phone the screen has two tabs: **My Items** and **Requests**.

- **New from the property custodian:** each RIS or ICS released to the teacher, with a **Received** button. The custodian's records show who confirmed.
- **Accountable equipment · ICS:** every unit under the teacher's name, with its property number, serial, ICS no. and value. Returns are subtracted. Each unit has two actions:
  - **Report a problem:** needs repair, not working, lost or missing, or something else, plus a note.
  - **Return:** the item stays on the list, marked *Return requested*, until the custodian marks it received back.
- **Supplies received · RIS:** every slip, newest first. *Report a problem* covers fewer than released, damaged, or wrong item.
- Reports sent without signal are queued (*Sending…*) and go out when the phone reconnects.

The custodian sees open reports at the top of **Supply requests** under **From teachers**, and as *N from teachers* on Home:

- **Mark for repair / Mark unserviceable** sets the unit's condition in Inventory.
- **Received back** clears the assignment. The unit is back in stock, and a return record is kept.
- **Decline** asks for a reason. **Noted** closes a report without changes.
- The teacher sees the answer on the item.

Teachers create only their own reports and read only their own. Only the custodian can resolve them (`teacherReports` in `firestore.rules`).

## Released to teachers (overview)

**More → Released to teachers** (or **Teachers** on Supply requests) lists everyone who holds something:
- teachers who joined;
- anyone items were released to;
- names typed or scanned under *Assigned to*. These show as *No account*, and appear even if you never signed in.

Each person shows their equipment units and value, plus *to confirm* (slips they haven't marked Received) and *open* reports. Search by name, item, property number or serial.

A person's page lists:
- **Accountable equipment:** taken from Inventory. It shows condition, ICS no., and *Confirmed* when the teacher tapped Received. **Take back** returns a unit to stock unassigned and keeps a return record.
- **Supplies received (RIS):** with a reprint button for each slip.
- **History:** releases, assignments, links and returns.

**Print accountability** gives a *Summary of Accountability* for one person. **Print all** gives one page per person. Each summary covers:
- equipment on ICS (ICS no., date, inventory item no., description and serial, condition, unit cost and total);
- supplies on RIS;
- signature lines for *Certified correct* (the teacher) and *Verified by* (the custodian).

In Inventory, an item's sheet lists who has its units (*Ana Reyes · 1 unit · ICS 2026-11-001*); tapping a name opens that person's page.

## Notifications

A bell in the header (next to **More**) shows what happened and how many you haven't read yet. Tap it for the list, and tap a notification to open the matching screen. The unread count also appears on the home-screen icon where Android supports it.

| Who | Is told when |
| --- | --- |
| Property custodian | a teacher sends a supply request · confirms receipt of released items · reports a problem · wants to return an item |
| Teacher | a request is approved, declined (with the reason) or ready to pick up · items are released to them (RIS/ICS) · a return is accepted or not · a report is answered |

- **Nothing for your own actions.** A custodian typing in a walk-in request, or a teacher sending a report, gets no notification for it.
- **No repeats.** Each phone remembers what it has already shown, so reloading the app doesn't repeat anything. Changes made while the app was closed appear the next time it opens.
- **On the phone.** In the bell sheet, tap **Turn on** under *Get these on your phone too* (the app never asks by itself). Notifications then appear even when you're in another app, **as long as CustodianPro is open or was used recently**. Android may stop a background app after a while; there is no push server, so a phone where the app is fully closed won't get notified.

## App updates

A new version downloads in the background (checked when the app opens, when it comes back to the front, and every hour). Nothing restarts by itself; you choose when:

Chrome's title bar is used **for app updates only**, whenever there is one. Other notifications (requests, releases, reports) never go to the title bar; they stay in the bell, on the app-icon badge and in phone notifications.

- **On a computer (title bar).** The window title starts with *Update ready ·*, so it shows on the Chrome tab and in the title bar of the installed app. When that installed app hides Chrome's title bar (the chevron next to the window buttons), CustodianPro draws its own navy title bar with an **Update ready · Restart** button. That is the whole notice, so there's no bell item and no toast. With a normal title bar, the **Restart** bar under the header is shown as well, because a window title can't be clicked.
- **On a phone or tablet (no title bar).** A bar under the header (**Restart** or **Later**), an item in the bell (or a toast before sign-in), and a phone notification if those are on and the app is in the background.
- **Everywhere.** An *Update* tag on **More → About & what's new**.
- **Afterwards.** *Updated ·* with **What's new** appears once. **More → About & what's new** shows the version, a **Check for updates** button, the latest changes (`WHATS_NEW` in `index.html`; add an entry for each noticeable release) and **Share app link**.

- **While the app is closed.** On Android, once CustodianPro is installed and used now and then, Chrome lets it check about every 12 hours (Periodic Background Sync; no server needed). A new version is downloaded and announced once with a phone notification, *CustodianPro update ready*; tapping it opens About. **More → About** says whether this is on. Other browsers (iPhone, Firefox) check the next time the app opens.

`npm run build` writes the version into `index.html` (`<meta name="app-version">`, the same value as the `sw.js` cache version). A new service worker that brings the version already running is not announced. One exception: the page is fetched from the network first, so when the app is opened right after a deploy, the page can already be the new version while its styles still come from the previous version's cache (for example, spacing that is new in this release is missing). The page asks the worker in charge which version served it; if that differs from its own version, the update is announced anyway, and **Restart** puts page and styles back in step. `tests/e2e/app-updates.mjs` step 10 checks this.

## Works offline

CustodianPro is an installable Progressive Web App:

- Everything it needs (styles, fonts, icons) is self-hosted in `assets/` – no CDNs.
- `sw.js` (service worker) caches the whole app on the first visit, so it opens with no internet.
- On iPad/iPhone: open the site in **Safari → Share → Add to Home Screen**.
  On Android/Chrome/Edge: tap **Install** on the bar under the header (or **More → Install app on this phone**). The browser's menu works as well. Chrome's install sheet shows screenshots of the app (`assets/screenshots/`).
- Long-press the home-screen icon for shortcuts: **Scan ICS**, **Count**, **Inventory** and **Requests** (teachers get their own My items and requests).
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
| `scripts/build-icons.mjs` | Regenerates the home-screen icons from `src/app-icon.png` (`npm run icons`): rounded tile, Android maskable and iPhone versions, plus the notification badge and shortcut icons |
| `manifest.webmanifest` | PWA metadata: name, icons, navy theme colour, shortcuts, screenshots |
| `scripts/dark-theme.mjs` | Dark mode: maps every light colour class in `index.html` to a dark one (called by `build-assets.mjs`) |
| `assets/brand/` | School art for the sign-in screen and the faded strip behind the top of Home: `login-portrait.webp` 572×1024, `login-landscape.webp` 1024×434 (both precached). Banner: `banner.png` (this README), `banner.webp` (About sheet, precached), `og-image.png` 1200×630 (link previews: `og:image` / X card), `social-preview.png` 1280×640 (upload under GitHub → Settings → Social preview) |
| `tests/e2e/make-screenshots.mjs` | Re-renders `assets/screenshots/` from the app with sample data (not precached by `sw.js`) |

Generated files (`assets/`, `sw.js`) are committed so GitHub Pages can serve them directly.

**Vercel (optional mirror).** [`vercel.json`](vercel.json) deploys the same committed files. It skips `npm install` and the rebuild, and copies `index.html`, `sw.js`, `manifest.webmanifest`, `firebase-config.js` and `assets/` into `public/`, the folder Vercel serves. Run `npm run build` and commit before pushing, exactly as for GitHub Pages. For Google sign-in on the Vercel address, add that domain under Firebase → Authentication → Settings → Authorized domains.

### End-to-end tests

`tests/e2e/` runs the app on simulated phones in headless Chromium, with Firebase replaced by an in-memory stand-in that applies the same access rules as `firestore.rules` (`lib/fake-backend.mjs`):

```bash
npm run serve &                       # app on http://localhost:8080
cd tests/e2e && npm install
node inventory-sync.mjs               # Inventory saved to the account
node release.mjs                      # teachers, RIS/ICS releases, stock in
node teacher-items.mjs                # a teacher's My Items, reports and returns
node teachers-overview.mjs            # released-to-teachers overview, take back, accountability print
node project-switch.mjs               # moving to another Firebase project keeps inventory, resets cloud links
node notifications.mjs                # bell, phone notifications, shortcuts, install bar
node app-updates.mjs                  # update notices (title bar), Restart, What's new (own server)
node login-theme.mjs                  # sign-in screen, teacher code / invite link, sign out, light/dark
node coa-forms.mjs                    # welcome tour, poster, PAR, ITR/PTR transfers, RRSP, RPCPPE/IIRUP, background update check
node phone-layout.mjs                 # 390 px phone: no sideways scroll, 32 px+ buttons, bottom sheets, toast placement
# (make-screenshots.mjs and make-banner.mjs redraw images; npm test skips them)
# or: npm test (all suites)
```

Set `CHROME_PATH=/path/to/chrome` to use an installed Chrome instead of `@sparticuz/chromium`. `BASE_URL` changes the address.
