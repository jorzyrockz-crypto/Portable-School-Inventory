# Printed calendar v2: a calendar, not a document

Status: **plan** (Nov 2026). The samples are in `docs/plans/calendar-print-v2/`, built from June 2026 data and the real June art (`assets/cal-art/m06.webp`).

| File | What it shows |
|---|---|
| `0-current.jpg` | Today's print, for comparison |
| `A-agenda.jpg` | **Agenda**: rounded day boxes with dots only, the activity list and Notes beside (A4 landscape) |
| `B-write-in.jpg` | **Write-in planner**: empty day boxes to write in; *Dates to remember* and dotted Notes below (A4 portrait) |
| `C-poster.jpg` | **Poster**: a tall coloured column with the art, the month, the list and Notes; entries in the boxes |
| `D-ink-saver.jpg` | **Ink saver**: black and white, thin lines, empty boxes, the art in grey, the list and Notes beside |

## Why today's print looks like a document

- A thin table grid with a full-width green header bar. The school name in the corner looks like a letterhead.
- Every entry is written in the boxes in small type. Long DepEd names (*BOSY assessments testing window…*) repeat every Monday, so the boxes look like a form.
- One font, and nothing large except the month.
- There is no place to write, so a teacher can't use it as a planner.

## What changes

### 1. Look (every layout)

- **Day boxes as rounded cards** with small gaps (no table lines), and **big rounded day numbers** in a display font, **Fredoka**. Fredoka is about 30 KB (latin), OFL licence, bundled in `assets/fonts/` and cached offline like Inter.
- **Weekends** have a warm tint and grey numbers. **Holidays and no-class days** have a pink box with their name at the bottom (in Ink saver: grey stripes).
- **The month title sits on the art** (a cream pill, or a large title on a fade) instead of being centred over it. The school name becomes a small pill or footer line, not a letterhead.
- **Cream paper colour** (`#fffdf8`) on screen. It prints white on most printers. Ink saver uses white.
- **Distinct colours per kind:** holiday rose, assessments violet, event green, activity indigo, DepEd sky blue, meeting amber. DepEd and events are both teal today and look alike.
- **A multi-day entry is one bar** across its days in a week row, not repeated in every box.

### 2. New options (print sheet → **Layout** section)

| Option | Choices | Default |
|---|---|---|
| **Style** | Agenda · Write-in planner · Poster · Ink saver · Classic (today's, refreshed) | Agenda |
| **Activities** | In the boxes · **Beside the calendar** (a list) · Both · Not shown | Beside |
| **Day boxes** | With entries · **Dots only** (a coloured dot per entry; holidays named) · **Empty, to write in** (numbers only; holidays still named) | Dots only |
| **Notes** | Off · **Beside** · Below | **Off** (decided: an option, not on by default) |
| **Notes paper** | Lines · Dots · Blank | Lines |
| **Notes title** | free text, e.g. *Reminders*, *To do*, *Mga paalala* | Notes |

- Each Style only presets the other options; anything can still be changed. Example: *Poster* with empty boxes.
- **Where the list and Notes go:**
  - **Landscape:** beside the calendar on the right (about 25% of the width); Notes fill the space under the list.
  - **Portrait:** below the calendar in two columns (*Dates to remember* | *Notes*).
  - **Poster:** always the coloured left column.
- **The list (*This month* / *Dates to remember*):**
  - Sorted by date, with a coloured date badge (*12 FRI*, *1–5 JUN*).
  - Shows the title, plus time, venue and people when those options are ticked.
  - Follows **What to show** and **Mine only**, like the boxes.
  - When it doesn't fit, the type gets smaller (down to 8.5 pt), then it ends with *+N more in the app*. Notes always keep at least 4 lines.
- **2 months per sheet:**
  - **Stacked:** each month gets its own short list on the right, and the shared Notes go at the bottom.
  - **Side by side:** there's no room beside, so the list and Notes go below both months; *Beside* is greyed out with a note.
- **Whole SY / range:** every sheet uses the same layout. The list is per month.

### 3. Kept as is

- Paper sizes (A4, Folio 8.5 × 13 in, A3), orientation, months per sheet, From – to, Whole SY, week start.
- The art choices: this month's art, the scenes, the school photo (**Pro**) and None; Strength and Where.
- Header and footer ticks, the legend, *Printed* date, motto.
- Everyone who sees the calendar can print it. The options stay on the device (`cp_calprint_v1`, new keys added; old saved options still load).

## Build steps

1. **Fredoka**: add `@fontsource-variable/fredoka` (latin only) to `assets/fonts/`, `@font-face` for screen and print, and include it in the `sw.js` precache.
2. **Options model**: add `style`, `actPlace`, `cellMode`, `notes`, `notesPaper` and `notesTitle` to `CPR_DEFAULTS`. Picking a style applies its preset.
3. **Sheet renderer**: split `cprSheetsHTML` into
   - `cprGridHTML` (cards, dots or empty boxes, multi-day bars);
   - `cprListHTML` (the list, with fit-to-space);
   - `cprNotesHTML` (lines, dots or blank);
   - one layout function per style that places the pieces for the paper and orientation.
4. **Fit**: measure the list in the live preview, as it already does for *More this month*, and shrink or cut it so nothing spills onto a second page.
5. **Print sheet UI**: a **Layout** section at the top with style thumbnails like the art thumbs, then the option rows.
6. **Ink saver**: forces black and white, art in grayscale (`filter: grayscale(1)`), no fills except holiday stripes.
7. **Tests** (`plan-print.mjs`):
   - each style renders;
   - Dots only and Empty show no entry text (holidays still named);
   - the list order and *+N more*;
   - Notes lines, dots and blank;
   - 2 per sheet (stacked and side by side);
   - every paper size fits on one page;
   - old saved options still load.
8. **WHATS_NEW** (new id), README *Print the school calendar* section, screenshots.

## Questions for the user

1. Which **Style** should be the default: Agenda (A), Write-in (B), Poster (C) or Ink saver (D)?
2. When the boxes are **Empty, to write in**, should holidays and no-class days still be named in the box (as in the samples), or only tinted?
3. Should the side list include **DepEd / school-year dates** (Brigada, enrollment, assessments), or only holidays, events, activities and meetings (as in Poster)?
4. Should Notes be **on by default**?

## Answers (Nov 2026) and what was built

1. All four designs are styles to pick, plus Classic; **Agenda** is the default.
2. Holidays and no-class days are still named in Empty and Dots boxes.
3. The list includes DepEd and school-year dates only when they are ticked in *What to show* (and follows *Mine only*).
4. Notes are **off** by default.

Built as: **Style** (5 thumbnails) · **Day boxes** (Written in / Dots only / Empty) · **List of dates** (Beside / Below / None; *Activities in the boxes / beside / both / none* is these two together) · **Notes box** (None / Beside / Below, Lines / Dots / Blank, own title). The list is fitted on the page after drawing (`cprFitLists`): smaller type, then *+N more in the app*. Options: `style`, `boxes`, `list`, `notes`, `notesPaper`, `notesTitle` in `cp_calprint_v1`. Test: `tests/e2e/plan-print.mjs` part 4b.
