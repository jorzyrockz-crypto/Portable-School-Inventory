# UI review: findings (November 2026)

Build reviewed: `main` at 6221905 (phone layout, PR #14) plus this branch's title-bar change.
**This is a report only.** Nothing listed below has been fixed yet.

## How it was checked

- **Screens:** 22 screens at **360×740** and **390×844** (phones, light and dark), **820×1180** (iPad portrait) and **1280×800** (computer). The screens were:
  - sign-in and teacher join
  - Home, encode sheet, My Items, property numbers, Catalog, Reports
  - More, bell, school info, APP-CSE Summary, item details
  - Supply requests, Release, Released to teachers, Government forms, About
  - the teacher's My Items, Requests and request form
- **Automated checks:**
  - horizontal overflow
  - tap targets under 32 px
  - text under 11 px
  - text contrast against WCAG AA (4.5:1 for normal text, 3:1 for large)
  - controls without an accessible name
  - text cut off with "…"
  - duplicate ids
- **Visual review** of every screenshot, in light and dark.

Nothing on any screen scrolls sideways, and no ids are duplicated.

## Summary

| # | Finding | Where | Severity |
| --- | --- | --- | --- |
| 1 | White text on orange buttons is hard to read (2.15:1) | Request / New / New supply request / Continue / Send request | High |
| 2 | Grey captions (`text-slate-400`) are too faint (2.56:1) | Section labels, KPI titles, "(25 units)", form labels, sign-in "OR WITH EMAIL" | High |
| 3 | Icon-only buttons have no name for screen readers | Qty − / + (My Items, Catalog), close ✕ on several sheets, Reports print on phones | High |
| 4 | APP-CSE Summary footer is crammed on phones | Summary sheet: "Open Active Items in Catalog" wraps to 4 lines; "Print Official Report" spills out of its button | High |
| 5 | Touch targets shrink on tablets | ≥640 px (iPad): My Items tabs 28 px, room links 16 px, catalog chips 28 px, room quick-chips 24 px, "Open Active Items in Catalog" 16 px | Medium |
| 6 | About: version card squeezed on small phones | 360 px: "Version …" text is a narrow 5-line column next to "Check for updates" | Medium |
| 7 | Reports: category and room names cut off | Phones: "Part II: O…", "Audio & V…", "Paper M…"; tablet: "Central Stockr…", "Principal / Ad…" | Medium |
| 8 | Header school name cut off on phones | "114656 - Oquendo Elementar…" on every custodian screen at 360–390 px | Medium |
| 9 | Many 10 px labels | Badges (EQUIPMENT, HEALTHY, LOW STOCK), "TOTAL VALUE", More section labels, request card captions, Reports "x/y SKUs", About dates | Medium |
| 10 | Tabs that scroll sideways give no hint | My Items tabs ("Consumables (" cut), catalog category chips: no fade or arrow at the edge | Low |
| 11 | Grey strip above My Items on phones | 16–20 px of page background between the header and the full-width list | Low |
| 12 | Home status line cut off at 390 px | "22 items in stock · ₱1,042,971…" (the "syncing…" part is lost) | Low |
| 13 | Toast action button wraps | "What's / new" on two lines in the *Updated ·* toast | Low |
| 14 | Old wording in About | "Effortless classroom & equipment tracking…" while the new banner and link previews describe ICS/PAR/RIS, COA forms and supply requests | Low |
| 15 | Computers use the phone layout | 1280 px: narrow centred column, a 4-tab bar at the bottom, Home much narrower than the header | Low (design) |
| 16 | Light grey text on light grey cards (4.34:1) | `text-slate-500` on `bg-slate-100` (header school line on the art, "SHOWING 361 OF 361 ITEMS", Home status) | Low |

> **Update (Nov 2026):** *My Items* was renamed **Inventory** and redesigned (one row per item, tap for an item sheet). That fixes the cut-off My Items tabs (10: the filter chips now wrap), the grey strip (11) and the unnamed −/+ on My Items rows (3: the steppers moved into the item sheet as *One less / One more*). Catalog parts of 3 and 10 are still open.

## Details and suggested fixes

### 1. Orange buttons (High)
White on `bg-amber-500` (#f59e0b) is **2.15:1**. The minimum is 4.5:1 for 14 px bold text, or 3:1 at 18.5 px bold.
- **Fix:** use `bg-amber-600 hover:bg-amber-700` (white text reaches 3.2:1, fine for the large 16 px+ bold labels) or dark text (`text-amber-950`) on amber-400.
- The emerald **Release** button and **Download CSV** are 3.77:1. They pass only as large text, so use emerald-700.

### 2. Faint grey captions (High)
`text-slate-400` (#94a3b8) on white is **2.56:1** (3.98:1 in dark mode). It is used for:
- the small uppercase section labels (RECENTLY ENCODED, TOTAL VALUATION, SORT BY, MY REQUESTS, APPEARANCE)
- unit counts and form labels in the property-numbers sheet

**Fix:** use `text-slate-500` (4.76:1 on white) for these labels. In dark mode the generated slate-500 equivalent already passes.

### 3. Unnamed icon buttons (High)
Screen readers announce these as just "button":
- the qty steppers (− / +) in My Items and Catalog
- the ✕ on School info, Item details and the APP-CSE Summary
- the Reports print button on phones (its text is hidden below 640 px)

**Fix:** add `aria-label="Decrease"` / `"Increase"` / `"Close"` / `"Print"`. The phone-layout test can assert this.

### 4. APP-CSE Summary footer (High)
Four buttons share one row on a 390 px phone.
- **Fix:** below 640 px, stack the buttons as two rows: Print + CSV on top, Catalog link + Close below. Or move "Open Active Items in Catalog" into the sheet body as a link.

### 5. Tablet touch targets (Medium)
The `sm:` (≥640 px) classes return to desktop sizes, but an iPad is a touch device.
- **Fix:** keep the larger phone sizes up to `lg` (1024 px), or base them on `(pointer: coarse)` with a small CSS rule (`@media (pointer: coarse) { .ledger-tab, … { min-height: 40px } }`).
- **Partly addressed (Nov 2026):** touch tablets 700 px and wider now scale the whole UI with the screen width (root font size up to 20 px, `tests/e2e/tablet-layout.mjs`), so on an 800 px tablet a 28 px tab is about 33 px. The `sm:` sizes themselves are unchanged.

### 6. About version card (Medium)
- **Fix:** below 400 px, put **Check for updates** under the text (`flex-wrap`, button `w-full`).

### 7. Reports names cut off (Medium)
On phones, each category row puts the name, SKU badge, value and units on one line, and the Stock Locations card is too narrow on tablets.
- **Fix:** on phones, put the name on its own line, with the badge, value and units below it.
- **Fix:** on tablets, give Locations the full width under Categories, or allow names to wrap onto 2 lines.

### 8. Header school name (Medium)
- **Fix:** drop the school ID prefix in the header on phones ("Oquendo Elementary School"), or let the name use 2 lines at 11 px.

### 9. 10 px text (Medium)
About 20 elements per list screen are 10 px.
- **Fix:** raise to 11 px (`text-[11px]`) for badges and captions. 10 px is hard to read in daylight on low-end phones.

### 10–16 (Low)
- **10. Tabs that scroll sideways:** add a right-edge fade (`mask-image`) on scrollable tab rows.
- **11. Grey strip above My Items:** remove `pt-4` on `#viewItems` below 640 px, or give the strip the header colour.
  - **Fixed (Nov 2026)** in the Inventory redesign: the list starts right under the header on phones.
- **12. Home status line:** let it wrap to 2 lines, or shorten "syncing to your account" to an icon.
- **13. Toast button wraps:** add `whitespace-nowrap shrink-0` to the toast action.
- **14. About wording:** reuse the new sharing text: *Property and supplies for school custodians and teachers: QR tags, physical count, ICS/PAR/RIS, COA forms and supply requests.*
- **15. Computers:** at ≥1024 px, use a left sidebar instead of the bottom tabs, and a two-column Home (encode on the left, recent items and requests on the right).
- **16. Grey on grey:** use `text-slate-600` on `bg-slate-100`.

## What looks good

- No sideways scrolling on any screen or size. Pop-ups are bottom sheets on phones, and buttons on phones are 40 px or more.
- Dark mode is consistent: the night art, readable cards, and clear selected states.
- The teacher screens pass every automated check except the orange button (finding 1).
- The sign-in, join and request forms have labels and large inputs. The date fields fit.
