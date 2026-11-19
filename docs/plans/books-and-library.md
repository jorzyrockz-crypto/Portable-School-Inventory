# Plan: Books, Library and Librarian

Status: **planning**. No code has been written yet.

The problem it solves: the school has no single place where books are kept. Textbooks,
teacher's manuals and library books are spread across classrooms, the faculty room and storage.
Teachers can't see what exists or where it is.

The goal:

1. One searchable **Library** that every teacher can open on a phone. It shows each title, how
   many copies exist, how many are available, and **where they are**: which room and who holds them.
2. The custodian tracks books as government property: received, issued to advisers, issued to
   learners, retrieved, lost, disposed.
3. A **Librarian** role can be assigned later if the school opens a mini-library.

---

## 1. Concepts

| Concept | What it is |
|---|---|
| **Title** | One book edition, e.g. *MATATAG Science 4 Learner's Material*. Copies are counted per title, not one record per copy. |
| **Kind** | Textbook (TX), Teacher's Manual (TM), Library – Fiction, Library – Non-fiction, Reference, Big Book, SLM / Activity Sheets, Periodical, Other. |
| **Place** | Where copies sit: a classroom ("Grade 4 – Rizal room"), the faculty room, storage, the library shelf (later), a teacher's table. Each place can have a **keeper**, e.g. the adviser of that room. |
| **Holding** | *N copies of this title at this place, kept by this person*, with condition: good / damaged / unserviceable. One title can have many holdings. |
| **Lendable** | Whether teachers may borrow it, through the keeper or the librarian. Library books default to Yes, textbooks to No. |
| **Accession no.** | Optional number per copy, for library books only, e.g. `LIB-2026-0001`, with an optional QR spine label. Textbooks stay counted by title. |

## 2. Who sees and does what

| Role | Books |
|---|---|
| **Custodian** (and assistant custodian) | Everything: add, import, receive, move, issue to advisers, count, write off, dispose, print. |
| **Librarian** (new, optional) | Library desk: titles, places, holdings, accession numbers, loans, overdue list, library counts. **No access** to equipment, supplies, PRs or money. |
| **Teacher** | Library tab: search, see availability and location, request to borrow. *My Items → Books* lists what they hold. They confirm "Received" on books issued to them, lend books from their own room, and record class issuance and retrieval for their section. |
| **School Head** | Dashboard totals: titles, copies, lost this school year, overdue loans, textbook-to-learner ratio. Approves book write-offs through the existing approval flow. |

### Librarian role

- Created like an assistant custodian: More → Staff → **Invite a librarian**. This gives a link
  or QR in the form `#lib=sid-code`. The person signs in with their own Google account and the
  custodian confirms.
- One account can be **teacher + librarian**. The librarian card adds a **Library desk** tab, so
  a designated teacher does not need a second account.
- Removing a librarian keeps their history. Their open loans move back to the custodian.
- Until a librarian exists, the custodian and assistants do the library work.

## 3. Screens (phone-first)

### Teacher – Library tab
- A search box (title, author, ISBN, grade, learning area), filter chips (Grade, Area, Kind,
  "Available now"), and a **Scan ISBN** button.
- A result card shows the title and grade, then: `12 copies · 7 available`, then *where*:
  `Grade 4 – Rizal room (Ms. Cruz) 5 · Faculty room 2 · Lent to Mr. Reyes until 20 Nov`.
- Tapping **Request to borrow** (qty, date needed, return date) sends the request to the keeper
  of the chosen place, or to the librarian.
- **My loans**: what I borrowed, the due date, and a "Returned" button. The keeper confirms the return.
- **Lent from my room**: requests to approve, and what is out.

### Custodian / Librarian – Books
- **Inventory → Books** tab (laptop: a sidebar page). The list is grouped by grade or kind, with
  totals and condition.
- Title editor fields: kind, grades, learning area, author, publisher, copyright year, ISBN,
  unit cost, source (DepEd delivery / donation / MOOE / LGU / other), date received, lendable,
  and the holdings table.
- **Places** manager (More → Places): rooms and keepers. Places are pre-filled from the
  teachers' sections.
- **Receive books**: one by one, by scanning ISBNs repeatedly, or by **Excel / CSV import** of a
  division delivery list (title, grade, area, qty, cost). Deliveries gets a "Books" mode for
  purchased library books.
- **Issue to adviser**: pick a teacher and titles + qty. This creates an issuance record. The
  teacher taps "Received", and the copies' place becomes that teacher's room.
- **Move**: shift copies between places, e.g. a classroom to storage.
- **Library desk** (librarian / custodian): requests, out now, overdue, due this week, and
  returns to confirm.

### Teacher – Class books (learner issuance)
- Per section and school year: titles issued to the class, a count per title, and optional
  learner names (see decision D2).
- End of year retrieval: per title, record returned / damaged / lost, plus the amount paid when
  a learner pays for a lost book.
- Sending it to the custodian adds the result to the school's Summary of Losses.

## 4. Rules from policy

- Textbooks and TMs are government property. The custodian issues them to advisers, who issue
  them to learners, and the custodian keeps a record of what each user holds.
- An inventory should be taken after every grading period or at the end of a semester. This
  becomes a reminder in Year-end & reminders.
- Lost textbooks are reported right away so payment is collected **before the school year closes**,
  not at the opening of classes. This becomes a retrieval reminder in the last month of the school year.
- Year-end retrieval is checked against the issuance records, followed by a physical count and a
  **Summary of Losses**.
- **No fines or salary deductions on teachers** for books their learners lost (DECS Order 23 s.2001,
  reiterated in DO 14 s.2002). The app records what *learners* paid. It never charges the teacher.
- Some divisions use a depreciated-cost matrix for lost textbooks, based on the year delivered.
  This will be an optional table in More → Books settings, empty by default.
- Obsolete, damaged or worn-out books go on a **disposal list for the Division Office**.
  Disposal reuses the head-approved write-off.

## 5. Data (Firestore)

Everything lives under `schools/{sid}`, so Reset, backup and school history keep working.

| Path | Contents | Who writes |
|---|---|---|
| `books/{bookId}` | One title: details plus `holdings[]` `{placeId, qty, good, damaged, unserv}` and optional `copies[]` (accession numbers). Uses `createdAt` / `updatedAt` for delta sync. | custodian, assistant, librarian |
| `settings/places` | `places[]` `{id, name, kind, keeperUid, keeperName}` | custodian, assistant, librarian |
| `bookIndex/{shard}` | A packed, read-only catalogue for teachers: title, grade, area, kind, ISBN, total, available, and where (place, keeper, qty). About 4,000 titles per document. Published by staff devices (hash-deduped, debounced, like `dashboard/summary`). | staff, librarian |
| `bookMoves/{id}` | Issuance and transfer records: `{kind: issue/move/return, lines[], from, to, toUid, ackMs, by}`. The receiving teacher sets `ackMs` only. | staff, librarian; teacher acks |
| `loans/{id}` | Borrowing: `{bookId, title, qty, acc[], keeperUid, borrowerUid, outMs, dueMs, returnedMs, status: requested/out/returned/declined/lost/cancelled}`. A teacher creates requests; the keeper or librarian approves and confirms returns. | teacher, keeper, librarian |
| `classBooks/{sy_uid_section}` | Learner issuance and retrieval per section: `lines[]` `{bookId, issued, returned, damaged, lost, paid}`, enrolment, optional learner list. | the adviser (own doc only); staff read |
| `staff/{uid}`, `staffInvites` | Gain `role: 'assistant' / 'librarian'`. The school doc gains `librarians[]`. | as today |

**Reads (Spark: 50k/day free):**
- A teacher opening the Library: **1–2 reads**, one per shard, live.
- A teacher's loans: a small query.
- A custodian's or librarian's first load on a new device: one read per title, e.g. 400 titles
  = 400 reads, once. After that, only changes are read.
- Even a large school should stay well under 5% of the free daily limit.

**Rules:**
- New `isLibrarian(sid)`.
- Books, places and the index: staff or librarian.
- Loans: the borrower creates `requested` for themselves; only the keeper or librarian moves it
  to `out` / `returned`.
- Class books: an adviser writes only their own doc.
- **The rules must be published once per release** that adds collections (releases 1, 2 and 3).

## 6. Prints (app reports, not new COA forms)

- Book inventory, by place or by title (with condition).
- Issuance list per adviser, with Received signatures (tap-to-confirm name + date/time).
- Class issuance / retrieval sheet (SF3-style columns).
- Summary of Losses (school year).
- Books for disposal (for the Division Office).
- Library: loan ledger, overdue list, accession register, QR spine labels.
- Whether to also produce the RPCI format for the year-end count is decision D3.

## 7. Releases (one PR each, each with its own What's new note and e2e suite)

1. **Books & where they are**
   - Book titles, places, holdings, receive / import / scan ISBN, move, issue to adviser with
     "Received".
   - The teacher **Library** tab (search, availability, where).
   - Inventory → Books, head dashboard totals, book inventory print.
   - Suite: `tests/e2e/books.mjs`.
2. **Library & Librarian**
   - Librarian invite and role, Library desk.
   - Borrow requests, lending from a teacher's own room, due dates and overdue reminders,
     accession numbers + QR spine labels, loan ledger.
   - Suite: `tests/e2e/library.mjs`.
3. **Textbooks for learners**
   - Class issuance and retrieval, losses and learner payments, Summary of Losses.
   - Grading-period and semester book counts in Year-end & reminders, the end-of-year retrieval
     reminder, the disposal list via head write-off, and the textbook-to-learner ratio on the
     head dashboard.
   - Suite: `tests/e2e/class-books.mjs`.

Releases 1 and 2 give teachers the Library they asked for. Release 3 completes the custodian's
textbook accountability.

## 8. Decisions (answered 2026-11-11)

| # | Decision |
|---|---|
| D1 Lending | **Library + teachers' rooms.** A borrow request goes to the keeper of the place that holds the copies: the librarian / custodian for the library and storage, or the teacher for their room. |
| D2 Learners | **Optional learner names** (SF3-style), next to the counts. See the privacy rules below. |
| D3 Paperwork | **Not sure.** The app prints its own **Book Issuance List** with tap-to-confirm signatures. An ICS / RIS print can be added later if the division asks for one. No RPCI for now. |
| D4 Accession nos. | **Yes, for library books**, with optional QR spine labels. Textbooks stay counted by title. |
| D5 Librarian | **Teacher + librarian badge** on the same Google account, with an extra Library desk tab. |
| Build order | **Releases 1 + 2 first** (Books + Library & Librarian). Release 3 (textbooks for learners) comes after. Update 2026-11-19: "build all", so all three releases ship in one PR. |

### Learner names: privacy rules (Data Privacy Act, RA 10173)
- Names only (no LRN, birthday, address or photo). Names are typed or pasted by the adviser.
- Stored in the adviser's own `classBooks` doc. Readable only by that adviser and the
  custodian / assistant (not other teachers, not the librarian, not the head).
- A **Clear names** button after retrieval is finished. Names are cleared automatically when
  the school year is closed; the counts and the Summary of Losses stay.
- A one-line notice when the adviser first adds names: "Learner names are used only for book
  issuance and retrieval."
- Learner names are never sent to the school history (audit log). Only counts are logged.

## 9. Build checklist for releases 1 + 2 (one PR)

1. **Rules:** `books`, `bookIndex`, `bookMoves`, `loans`, `settings/places` (staff + librarian
   write), the `isLibrarian()` helper, `librarians[]`, and `staffInvites.role`. The fake backend
   mirrors these.
2. **Books module in `index.html`:** delta-synced `books` collection, places, holdings,
   accession numbers, and the published `bookIndex`.
3. **Custodian UI:**
   - Inventory → Books page, title editor, Places manager.
   - Receive (manual, Excel / CSV import, ISBN scan via the existing scanner + `ean_13`).
   - Move, Issue to adviser (Book Issuance List print).
4. **Teacher UI:**
   - Library tab (search, filters, availability, where).
   - My Items → Books (with "Received").
   - Borrow request, My loans, Lent from my room.
5. **Librarian:** invite link `#lib=sid-code`, the badge on the teacher account, the Library desk
   (requests, out, overdue, returns), accession register, QR spine labels, loan ledger.
6. **Reminders:** loan due tomorrow / overdue (to the borrower and the keeper), and requests
   waiting (to the keeper).
7. **Head:** book totals and overdue loans on the dashboard.
8. **What's new notes:** `2026-11-books` ("Books & where they are") and `2026-11-library`
   ("Library & Librarian").
9. **README:** a Books & Library section with a publish-rules note.
10. **Tests:** `tests/e2e/books.mjs` and `library.mjs`, plus a full regression run and a check
    on phone, tablet and laptop layouts.

**Status (2026-11-19): built**, together with release 3 (class sheets, losses, take back, the
book count and retrieval reminders in Year-end & reminders, and the learners-with-textbooks
percentage on the head's summary). What's new: `2026-11-books`, `2026-11-library`,
`2026-11-class-books`. Suites: `books.mjs`, `library.mjs`, `class-books.mjs`.
