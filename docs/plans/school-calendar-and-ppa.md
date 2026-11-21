# Plan: School Calendar with Programs, Projects and Activities (School Planning)

Status: **planning**. No code has been written yet. The decisions are in section 10 (answered
2026-11-20).
Rollout: **a pilot at Testing ES only** (`97JbEODfGJhWcejYDWhO`), like Leave.

The problem: the school's plans live on paper and in separate files.
- The School Improvement Plan (SIP) and its Annual Implementation Plan (AIP) are typed once for
  the Division and then rarely looked at again.
- The DepEd school calendar (terms, breaks, exams, INSET) is a memo PDF.
- School events are announced in group chats.
- Nobody sees in one place what happens this week, who is responsible, how much it costs and
  whether it was done.

The goal:
1. A **School Calendar** that everyone opens on a phone. It shows the DepEd calendar for the
   school year (terms, holidays, breaks, exams, INSET) plus the school's own activities.
2. The school's **Programs, Projects and Activities (PPAs)**, as in the SIP/AIP. Each activity has
   a schedule, a venue, the people responsible, a budget and a fund source. The activities ARE
   the calendar entries, so the plan is not typed twice.
3. **Prints in the DepEd formats**:
   - AIP (SIP Annex 10).
   - Project Work Plan and Budget Matrix (Annex 9).
   - A monthly calendar of activities.
   - A mid-year / year-end monitoring report.
4. **Links to what the app already does**: Purchase Requests charged to an activity, the leave
   calendar, the inventory's year-end count, ICS renewals and useful-life warnings.

---

## 1. Concepts

| Concept | What it is |
|---|---|
| **School year (SY)** | June to April. SY 2026–2027 is the first three-term year (DepEd Order No. 009, s. 2026): June 8, 2026 to April 8, 2027, 201 class days. Terms: T1 Jun 8 to Sep 15, T2 Sep 16 to Dec 18, T3 Jan 4 to Apr 8, each with opening, instructional and end-of-term blocks. |
| **DepEd calendar** | The national dates for the SY: opening, the term blocks, exams, end-of-term activities, Christmas break, EOSY rites, Brigada Eskwela, and regular and special holidays. The app ships a starter set that the planner can check against the memo and edit (some sites quote different closing dates). |
| **School day type** | Each date is a class day, a holiday, a break, INSET or a suspension (typhoon or local holiday). Class days are counted per month and per term, to check the 201 days. |
| **Program** | A big area of the SIP, e.g. *Reading Program*, *School-Based Feeding*, *Brigada Eskwela*, *DRRM*. Optional grouping. |
| **Project** | A school improvement project under a program. Fields: objective, problem statement, root cause, output for the year, project team. Matches the AIP's "School Improvement Project Title · Project Objective · Output for the Year". |
| **Activity** | One thing done on a date or dates, under a project or standalone (e.g. *Parent–Teacher Conference*). Fields: schedule (from–to, all day or with times), venue, person(s) responsible, budget, fund source (MOOE, SEF/LGU, PTA, Canteen, IGP, Donations, Others), expected output and status. The AIP's rows. |
| **Status** | Planned, Ongoing, Done (with the accomplishment, actual cost and photos or proof later), Moved (new date, with the reason) or Cancelled (with the reason). |
| **Event** | A calendar entry that is not part of the AIP: a meeting, a visit, a deadline. It works like an activity with no project and no budget. |

Hierarchy: **Program to Project to Activity**. A project may have no program, and an activity
may have no project.

## 2. Who sees and does what

| Role | School Calendar and PPAs |
|---|---|
| **School Head** (the School Planning Officer) | Everything: set up the SY calendar, add programs, projects, activities and events, assign people, mark Done or Moved, print the AIP and reports. **Approves or returns what teachers propose** (Approve tab, approvals kind `plan`). |
| **AO / custodian** | The same as the School Head except approving: encodes the calendar and PPAs directly, no approval needed. Also charges PRs to an activity (section 6) and adds inventory dates (year-end count, ICS renewals). |
| **Teacher** | A **Calendar** tab: this week and month, the DepEd dates, school events, and **"Mine"**, the activities they are responsible for. They get reminders and **mark their own activities Done** with a short accomplishment (the head or AO can undo it). They may also **propose** a program, project or activity, or a change to one. It shows as "For approval" (only to them, the head and the AO) until the School Head approves it, then it joins the calendar and the AIP. If returned, they get the head's note and can fix and resend it. |
| **Parents / learners** | Not in this version. A public read-only link to the calendar could come later. |

## 3. Screens (phone first; on computers the same pages use the space)

1. **Calendar** (everyone; the School Head's new **Plan** tab, the teacher's **Calendar** tab,
   and the custodian's sidebar or More):
   - **Agenda** (default on phones): today, then the upcoming days. Each entry has its
     colour/kind chip (DepEd, holiday, activity, event, leave, inventory), its time and its venue.
   - **Month**: a grid with dots. Tap a day to see its list. A strip at the top shows the term
     and block, e.g. "Term 2 · Instructional · Day 58 of 201".
   - Filters: All · Mine · DepEd · Activities · Holidays.
2. **Plan (PPAs)** (the planner):
   - A list of Programs, each with its Projects and their Activities as cards.
   - Totals per project: number of activities, budget, done %.
   - Add / edit sheets: Program, Project, Activity. Copy an activity to repeat it (weekly or
     monthly, e.g. "Reading period every Friday").
3. **Activity sheet** (everyone who can see it): details, people, budget and source, linked PRs
   and amounts spent, status history, Done or Move.
4. **SY setup** (the planner, once a year):
   - Load the DepEd calendar for the SY, check and edit the dates.
   - Add school-specific non-class days (local holidays, the fiesta).
   - Mark suspensions as they happen; the class-day count updates.
5. **Prints** (section 7).

## 4. Data (Firestore, Spark-friendly)

```
schools/{sid}/planYears/{sy}        one per school year, e.g. "2026-2027"
  { sy, start, end, terms: [{ n, from, to, blocks: [{ kind: opening|instructional|endterm, from, to }] }],
    days: [{ at | from,to, kind: holiday|break|inset|suspension|noclass|exam|event, title, ref }],
    people: [{ uid, name, pos }],        (D2) the school's people, for "Person(s) responsible" on teachers' phones
    classDays, updatedAt }

schools/{sid}/ppas/{id}              one per program, project or activity
  { sy, kind: 'program'|'project'|'activity'|'event', parentId, order,
    title, objective, problem, rootCause, output,
    from, to, allDay, startTime, endTime, venue,
    who: [{ uid, name }], team: [{ uid, name, role }],
    budget, source: mooe|sef|pta|canteen|igp|donation|other, sourceNote,
    status: proposed|returned|withdrawn|merged|planned|ongoing|done|moved|cancelled, done: { atMs, byName, note, actual },
    by: { uid, name, role: head|ao|teacher },
    decision: { ok, byUid, byName, role, atMs, note },     the School Head's answer to a proposal
    changeOf,                                               a teacher's suggested change to this activity id
    series,                                                 activities made together by Repeat
    moved: [{ from, to, atMs, by }], log: [...], removed, createdMs, createdAt, updatedAt }
```

- **As built in D2:** a proposal is decided on the ppa document itself, not through an approvals
  document (so no `apId`, no approvals kind `plan`): Approve sets `status: 'planned'` (or, for a
  suggested change, copies its fields onto the activity and sets the suggestion to `merged`);
  Return sets `status: 'returned'` with `decision.note`. The School Head decides; with no School
  Head in the app, the AO does. The Approve tab lists proposals with the PRs and the other
  approvals.

- One document per activity keeps writes small. A school has about 30–150 per year, well
  within the 50k reads / 20k writes a day.
- A teacher's phone reads `planYears/{sy}` (one read) plus the activities of the year. Teachers
  see the whole school calendar, so no per-uid query is needed.
- Rules: `planPilot(schoolId)` like `leavePilot`.
  - Write: the head (`isHead`) and staff (the AO / custodian, assistants), freely.
  - A teacher (member) may create only with `status: 'proposed'` and `by.uid` = their own uid,
    and may edit or withdraw their own while it is `proposed` or `returned`.
  - A teacher may not change the School Head's `decision`, approve their own, or add straight to the plan.
  - (D4) A teacher may update only `status`/`done` (to Done) on an activity where they are in `who`.
  - Read: members, staff and head. A member does not see other teachers' `proposed`/`returned`
    entries (the app filters them; the rules allow reading the school's plan).
  - Delete: custodian only (Reset app).
- Reset app: skip `planYears`/`ppas` when the pilot is off, as with `leaves`.

## 5. Notifications and Home

- **Teacher**:
  - "Tomorrow: Parent–Teacher Conference · you are responsible · Gym, 1:00 PM" (the day before).
  - "Added to an activity".
  - "Activity moved to …".
- **Planner**:
  - "3 activities this week".
  - "Overdue: mark Done or Moved" for past activities still Planned.
- **Home attention card** (all roles): "This week: 2 activities, 1 holiday".
- The **Chrome title bar is not used** for these; it stays for app-update notices only.

## 6. Links to the rest of the app

| Existing feature | How it connects |
|---|---|
| **PR per expense** | New optional "For activity" field on the PR. The PR's Purpose can be filled from the activity. The activity then shows **Budget ₱X · PRs ₱Y · Left ₱Z**, and the AIP print can show "utilized". The PR approval flow stays the same. |
| **School Head approvals** | A teacher's proposal (new PPA, or a change to one) goes to the Approve tab as a new kind `plan`: Approve, or Return with a note, as with PRs and leave. What the head and AO encode needs no approval. After the AIP is final, the head and AO edit freely and every change is kept in its history (Q4). |
| **Leave** | Approved leaves show on the calendar as "On leave: Ana Reyes". The kind of leave is never shown, and only the head and AO see it (privacy). The ₱250 limit and Form 6 stay as they are. |
| **Inventory** | The year-end physical count, ICS renewal due dates and useful-life warnings appear on the calendar as "Inventory" entries for the custodian and head only. |
| **Books** | The textbook retrieval at the end of the SY appears as an activity. |
| **School year** | The app's SY helpers (`syOf`, `tSyOf`, `bkSY`) are unified on one SY definition from `planYears` when the pilot is on. |

## 7. Prints (A4 / Legal, like the other forms)

1. **Annual Implementation Plan** (SIP Annex 10). Columns: School Improvement Project Title ·
   Project Objective · Output for the Year · Activities · Person(s) Responsible · Schedule/Venue ·
   Budget per Activity · Budget Source. Grouped by program, with totals per source (MOOE, PTA,
   LGU/SEF, Others).
2. **Project Work Plan and Budget Matrix** (Annex 9), one per project. Header: Problem
   Statement, Objective and Root Cause. Columns: Activity · Output · Date of Implementation ·
   Person Responsible · Budget · Budget Source.
3. **Calendar of activities**: a monthly grid or list for posting on the bulletin board.
4. **Monitoring report** (mid-year / year-end): each activity with target vs actual date, status,
   accomplishment, budget vs PRs, and % done per project.
5. Optional: **class-day count** per month and term, to check the 201 days.

## 8. Build order (one PR each, each with its own What's new entry, pilot `'plan'`)

| PR | What | Size |
|---|---|---|
| **D1** (first) | School year setup + Calendar (agenda and month), the DepEd starter dates, holidays and suspensions, school events, class-day count. The head and AO edit; teachers get a read-only Calendar tab; the head gets a Plan tab and the AO a Calendar page. | M |
| **D2** (built) | Programs, Projects, Activities: the head and AO encode, edit, copy and repeat; on the calendar; "Mine" for teachers; reminders. Teachers propose (or suggest a change), and the School Head approves or returns it in the Approve tab (decided on the ppa document). | L |
| **D3** | The printed **Monthly Calendar** only, with customization (clay-style art per month, general scenes or the school's photo; colours, A4 / Folio / A3, 1 or 2 months per sheet, months, what to show, header and footer). Plan: `docs/plans/monthly-calendar-print.md`. | M |
| **D3b** (later) | Prints: AIP (Annex 10), Work Plan and Budget Matrix (Annex 9). | M |
| **D4** (built) | Done / Moved / Cancelled with accomplishments (actual date, what was done, actual cost, participants, remarks, up to 3 photos in `ppaPhotos`); teachers mark their own activities Done; Move needs a new date and a reason; monitoring report by term, mid-year and year-end (printed with the photos); overdue reminders the day after and weekly (the people responsible; one for all to the head and AO). | M |
| **D5** | Links: PR "For activity" with budget utilization; leave and inventory entries on the calendar. | M |

Each PR follows the usual pattern:
- `index.html` plus `firestore.rules` and the `fake-backend.mjs` mirror.
- A new e2e suite.
- The README section.
- A reminder to republish the rules.

## 9. Things kept out on purpose

- No change to the inventory, PR, Leave or Books flows beyond the optional links in section 6.
- No Google Calendar sync in v1. It needs OAuth scopes and a server; later, an `.ics` export
  of the calendar is possible without a server.
- No public parents' page in v1.
- No grades or class programs (class schedules); this is the school-level calendar.

## 10. Decisions (answered 2026-11-20)

| # | Question | Answer |
|---|---|---|
| Q1 | Who encodes the calendar and the PPAs? | **Mainly the School Head and the AO** (directly). **Teachers may also encode PPAs, but they go to the School Head for approval.** |
| Q2 | First PR | **D1: the Calendar first.** |
| Q3 | Starter DepEd dates | Planned: ship SY 2026–2027 (DO 009 s. 2026), editable. Not asked; recommended default. |
| Q4 | Teachers mark their own activities Done? | **Yes**, with a short accomplishment (the head or AO can undo). |
| Q5 | Changes after the AIP is final | **Free edits, with history** (for the head and AO; a teacher's change is a proposal, as in Q1). |
| Q6 | Fund sources | Planned: MOOE, SEF/LGU, PTA, Canteen, IGP, Donations, Others. Not asked; editable later. |
