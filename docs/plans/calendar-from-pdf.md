# Read the school calendar from a PDF or photo

Status: built (School calendar switch, Testing ES first). Decisions by the user, 2026-11-21:

| Question | Answer |
|---|---|
| Which PDFs | **Any calendar PDF**: the DepEd Order (Annex A / B), regional or division memos, a school-made calendar. Any line with a date becomes an entry to check. |
| Scanned pages and photos | **Yes**: typed PDFs are read directly; scanned pages and photos go through the text reader that Scan ICS already uses. |
| One reading for every school | **Both**: the admin (Testing ES custodian) reads the DepEd Order once and **publishes** it, so every school gets *Load the DepEd calendar* for that year; each school can still read its own memo or calendar. |
| Dates already on the calendar | **Add only what is new**: a date already there (same first day, similar title) is unticked and marked *Already there*. Nothing is removed. |

## Flow

1. **Where:** *Read a calendar PDF* on the setup card of a school year that is not set up yet, and *Read dates from a PDF or photo* under the add buttons once it is. SH and AO only (whoever can edit the calendar).
2. **Pick:** a PDF or a photo, or paste the text. Nothing is uploaded; everything is read on the phone.
   - Typed PDF: PDF.js (Apache-2.0, vendored in `assets/pdf/pdfjs-<version>/`, about 2 MB, cached the first time it is used, not precached) gives the words with their positions; words on the same line are joined, and a wide gap between columns becomes ` | `.
   - Scanned page (no text on it): the page is drawn on a canvas and read with Tesseract (`assets/ocr/`).
   - Photo: read with Tesseract.
   - At most 30 pages.
3. **Read** (`cpdfParse(lines, sy)`, a pure function):
   - Dates: `June 8, 2026`, `June 8`, `June 8–12`, `June 29 – July 3, 2026`, `Dec. 21, 2026 to Jan. 3, 2027`, `8–12 June 2026`, `June 1, 8 and 15`, `06/08/2026`, weekdays ignored; a month heading (`JUNE 2026`) followed by `8 Opening…` lines.
   - The year when it is not written: June to December is the first year of the school year, January to May the second.
   - The school year itself: `SY 2027–2028` / `School Year 2027-2028` (the most common one) picks the year to fill.
   - Title: the line without its dates; an empty title takes the next line; a line that continues the one before (starts in lower case, or the one before ends in *and*, a comma…) is added to it. Text after a column gap becomes the note.
   - Kind: special working day, suspension, no classes, exams (examination, summative / periodical test), INSET, break (not the wellness break), holiday (the list of regular and special holidays, or the word *holiday*), otherwise *DepEd activity* (a DepEd / division paper) or *School event* (a school-made calendar). National-only activities (NAT, NCAE, PEPT, NSPC, A&E, Palarong Pambansa) are marked so they stay out of *All*.
   - First and last day of the school year: *opening of classes*, *first day of classes* / *end of the school year*, *last day of classes*. Terms: lines with *Term 1* / *First Term* and a date range (not exams): the earliest start and the latest end per term.
   - The memo: `DepEd Order No. 12, s. 2027`, `Division Memorandum No. …`.
4. **Check:** every entry as a card: tick box, title, kind, from and to. Marks: *Already there* (unticked), *Outside SY …* (unticked), *Used for the terms* (unticked). Tick all / none. For a school year that is not set up: first and last day (filled in when found) and the terms found. Changing the school year reads the text again.
5. **Save:**
   - *Add N to the calendar*: the dates go on `planYears/{sy}.days` with `src: 'pdf'` (no notification per date; the DepEd update never touches them); *School event* entries become school events. A year that is not set up is created with its first and last day, terms and memo.
   - Admin only, *Publish for every school*: writes `depedCalendars/{sy}` `{ sy, v, memo, start, end, terms, days[{k, f, t, n, s, nat}], by, updatedAt }` (no school events). `v` is one more than the built-in list and the last published one, so schools that loaded an older list see *Update the DepEd calendar*.

## Every school

- When the calendar opens a school year, the app reads `depedCalendars/{sy}` once (1 read per year per session, kept on the phone). The DepEd calendar for a year = the published one when it is newer than the list built into the app.
- Rules: any signed-in user can get one; only the admin writes or removes it (`sy` format, at most 400 days and 4 terms, memo ≤ 300).

## Tests

`tests/e2e/plan-pdf.mjs`: the date reader (formats, years, kinds, terms, SY, memo); paste text into a new school year; a typed PDF (made by the test) with a two-column table; a scanned PDF (ImageMagick) through a stubbed text reader; reading again marks everything *Already there*; the admin publishes; another school loads it as the DepEd calendar and a non-admin cannot write it.
