# Plan: Admin panel and feature switches (Testing ES as the admin school)

Status: **A1 built** (Nov 2026): the switches, Pro, the 7-day trial, the Admin panel and More → Pro.
Decisions are in section 10 (answered 2026-11-21); F1 and F2 use the recommended defaults.
Rollout: built and tested at Testing ES (`97JbEODfGJhWcejYDWhO`), like Leave and the School Calendar.

The problem: every new feature is a **pilot written into the code**.
- `LEAVE_PILOT` and `PLAN_PILOT` in `index.html`, plus `leavePilot()` and `planPilot()` in
  `firestore.rules`, list Testing ES by its id.
- Opening a feature to more schools needs a code change, a PR, a deploy and **publishing the
  rules again**.
- Turning a broken feature off again needs the same steps.

The goal: **Testing ES becomes the admin school**. Its property custodian gets an **Admin panel**
where each new feature has one switch:

```
Off  ·  Testing  ·  Pro schools  ·  Everyone (free)
```

Features such as Leave and the School Calendar are planned as **Pro features**. The admin marks a
school as **Pro** in the panel (after it pays, outside the app), and every Pro feature that is
ready turns on for that school. New features keep arriving the way Leave and the Calendar did:
built, tested and adjusted at Testing ES first. When one is ready, one tap opens it to the Pro
schools (or to everyone, for a free feature), with no code change and no new rules.

---

## 1. Concepts

| Word | Meaning |
|---|---|
| **Admin school** | Testing ES (`97JbEODfGJhWcejYDWhO`). It stays a normal school for testing, and its custodian is the app admin. |
| **Feature** | A part of the app behind a switch: `leave` (Leave + leave cards + ₱250), `plan` (School Calendar, and later PPAs/AIP). Each future feature gets its own key. |
| **Pro school** | A school the admin marked Pro, with an optional end date (e.g. the end of the school year it paid for). Set and removed only in the Admin panel. |
| **Stage** | Where a feature is on: **Off** (nowhere, not even Testing ES), **Testing** (the admin school only), **Pro** (the admin school plus every Pro school), **Everyone** (free for all). |
| **Kill switch** | Going back a stage (e.g. Everyone → Testing). The data stays; the tabs and pages disappear, and the rules refuse the data, until it is turned on again. |

## 2. Who

| Role | What they do |
|---|---|
| **Admin** (custodian account of Testing ES) | Opens **More → Admin panel**, changes stages, adds or removes selected schools, and reads the switch history. |
| **Every other school** | Nothing to do. A feature appears on all of its phones (custodian/AO, School Head, teachers) once it is on for that school. |
| **Pro schools** | Get every Pro feature that is at the Pro stage. The custodian sees *Pro · until June 30, 2027* in More → About. |

## 3. Screens

**More → Admin panel** (only on the admin school's custodian device, with a shield icon):

```
┌ Admin panel ──────────────────────────────────┐
│ Leave (CS Form 6)                 [Pro ▾]     │
│   Testing ES + 3 Pro schools                  │
│   On since Nov 20 · changed by Rhea, Nov 24   │
│ School calendar                [Testing ▾]    │
│   Testing ES only                             │
│ ────────────────────────────────────────────  │
│ History                                        │
│   Nov 24 · Leave · Testing → Pro              │
│ ────────────────────────────────────────────  │
│ Schools · 12                     [Search  ]   │
│   San Isidro ES · 123456 · 18 users  [Pro ✓]  │
│   Oquendo ES    · 644584 ·  9 users  [Free]   │
└───────────────────────────────────────────────┘
```

- **One card per feature**, with a 4-part switch (Off · Testing · Pro · Everyone), how many schools
  it is on for, and when and by whom it was last changed.
- **Schools list:** every school using the app: name, School ID, number of users (teachers, School
  Head, assistants), Pro or Free, and the Pro end date. Search by name or School ID.
- **Make Pro:** pick a school from the list, or type its **6-digit DepEd School ID** (looked up in
  `schoolIds`, the same lookup teachers use to join), set an optional end date, and save. **Remove
  Pro** works the same way. The admin is the only one who decides; schools can't ask from the app.
- **Going to Pro or Everyone** asks first: *"Leave will appear for the 3 Pro schools (or every
  school) the next time they open the app. Their What's new will announce it."*
- **Off** asks first, and says that the data is kept.
- **History:** every change, with who, when, from and to (the last 100).
- (Q4) **Schools using the app:** how many schools there are and which have a feature on.

**Everywhere else:**
- The **Pilot** badge on the Leave and Calendar pages shows only while a feature is not on for
  everyone.
- **What's new:** a feature's notes appear for a school when the feature turns on for it. The
  usual *"Updated · …"* toast announces it once, as for any update. Notes are reworded so they no
  longer say "pilot at this school"; the pilot sentence shows only while the feature is in pilot.
- **Pro badge:** a Pro feature's page shows a small **Pro** badge at Pro schools.
- **Free schools: More → Pro** (decided 2026-11-21, F3). A page listing what Pro adds (Leave and
  CS Form 6, leave cards, the School Calendar, and Pro features to come) and whom to contact, with
  **Try Pro free for 7 days**:
  - Only the school's property custodian can start it, **once per school**.
  - Every Pro feature at the Pro stage turns on for the whole school (custodian/AO, School Head,
    teachers) for 7 days. A strip in More says *Pro trial · 5 days left*.
  - 2 days before the end, and on the last day, the custodian is reminded (notification + title
    bar badge, as for app updates).
  - When the 7 days end, the school is Free again and the trial records follow F2 (view only).
  - The admin sees trials in the schools list (*Trial · ends Nov 28*) and can **Make Pro**, **extend
    the trial**, or **allow a new trial**.
  - Before the trial, Pro features stay out of sight: no locked tabs, only the More → Pro page.

## 4. Data and rules

**One document:** `appConfig/features`

```js
{
  leave: { stage: 'off' | 'testing' | 'pro' | 'all', changedBy, changedMs },
  plan:  { stage: …, changedBy, changedMs },
  log:   [{ at, by, feature, from, to }]                // the last 100
}
```

**Pro is stored on the school:** `schools/{sid}.pro = { untilISO, untilMs, by, ms }` (no end date:
`untilMs` 0). Only the admin may write the `pro` field; the school's own custodian can't. Every
school's custodian rule must ignore a change to `pro` it didn't make.

**The 7-day trial is stored on the school too:** `schools/{sid}.trial = { startMs, untilMs, by }`.
The school's custodian may write it **only once** (no `trial` before), with `untilMs` = `startMs` +
7 days (± a few minutes) and `startMs` close to `request.time`. Only the admin may change it after
that (extend, or remove it to allow a new trial).

**`firestore.rules`:**

```
function adminSchool() { return '97JbEODfGJhWcejYDWhO'; }
function features() { return get(/databases/$(database)/documents/appConfig/features).data; }
function isPro(schoolId) {
  let p = schoolDoc(schoolId).get('pro', null);
  let t = schoolDoc(schoolId).get('trial', null);
  return (p != null && (p.get('untilMs', 0) == 0 || p.untilMs > request.time.toMillis()))
    || (t != null && t.get('untilMs', 0) > request.time.toMillis());
}
function featureOn(name, schoolId) {
  let st = features().get(name, {}).get('stage', 'testing');
  return st != 'off' && (schoolId == adminSchool() || st == 'all' || (st == 'pro' && isPro(schoolId)));
}
match /appConfig/features {
  allow read: if signedIn();
  allow write: if isCustodian(adminSchool()) && /* stages are valid */;
}
// schools/{sid}: the admin may change only `pro`; the school's custodians may not touch it.
// The schools list: the admin may list schools (name, School ID, counts) — Q4.
```

- `leavePilot(schoolId)` becomes `featureOn('leave', schoolId)`, and `planPilot` becomes
  `featureOn('plan', …)`. If the document doesn't exist yet, every feature is **Testing**, the
  same as today.
- **Cost:** the `get()` calls count as document reads when a rule needs them (Leave and Calendar
  reads and writes only; a listener pays once when it starts; the school document is usually read
  by the rules already). That is a small cost within Spark's 50,000 reads a day.
- **Users per school** for the schools list: kept as counts on the school document
  (`counts { teachers, assistants, head }`), updated by the custodian's app when members change,
  so the list costs one read per school, not one per member.
- The rules are **published once** with this change. After that, switches need no new rules.

## 5. The app

- `featureOn(name)` replaces `leaveOn()` and `planOn()`. It reads the same document:
  - **Live:** one listener on `appConfig/features` (1 read when the app opens, plus 1 per change).
    Tabs, pages and sidebar items appear or disappear at once.
  - **Cached** in localStorage, so the app starts with the last known switches, also offline.
  - The test override keys (`custodian_leave_pilot_v1`, …) stay, for tests only.
- Teachers' and School Heads' phones follow their school's switches and Pro status (the school
  document they already read).
- **Pro ends** (end date passes or the admin removes it): see follow-up F2.
- **Reset app** skips a feature's collections when the feature is off for the school (as now).
- **Selected or Everyone → Testing or Off** while someone has the page open: the page closes to
  Home with *"Leave was turned off for now"*.

## 6. Turning a feature on for everyone (checklist)

1. All of its suites pass. The README section no longer says "pilot".
2. Its What's new note reads well for a school seeing it for the first time.
3. Admin panel: **Pro** (the Pro schools get it), or **Everyone** for a free feature.
4. If something breaks: **Testing** (or Off) at once, fix it, then turn it on again.

New features follow the same path: a new key, built behind `featureOn('<key>')` and the matching
rule, starting at **Testing**.

## 7. What changes for Leave and the Calendar

- They start at **Testing** (exactly as today), now controlled by the Admin panel.
- They are **Pro features**: when ready, the admin moves them to **Pro**. There's nothing to
  migrate: the data is already per school.

## 8. Tests

- `fake-backend.mjs`: `appConfig/features` with the same `featureOn` rule. The `leavePilot` and
  `planPilot` options become "features on for these schools".
- `leave-*.mjs` and `plan-calendar.mjs` turn their feature on through the config document instead
  of the localStorage key.
- New `admin-panel.mjs`:
  - Only the admin school's custodian sees the panel, and other custodians can't write the
    document (rules).
  - Make a school Pro (by School ID, with an end date); Testing → Pro: the tabs appear on that
    school's phones live; a Free school sees only More → Pro; Everyone: they see it too.
  - The 7-day trial: the custodian starts it once; Pro features turn on for the school; a second
    trial is refused (rules); after 7 days they turn off (view only); the admin can extend it.
  - A school's own custodian can't make itself Pro (rules); an expired Pro turns the features off.
  - The schools list shows names, School IDs, user counts and Pro.
  - What's new announces the feature.
  - Off: the tabs go away and the rules refuse the data.
  - History.

## 9. Build order

| PR | Scope |
|---|---|
| **A1** | `appConfig/features` + `schools.pro` + rules `featureOn`/`isPro` + the Admin panel (feature switches, schools list, Make Pro, trials) + More → Pro with the 7-day trial + Leave and Calendar moved to switches + tests. **Publish the rules once.** |
| A2 (later) | Anything from the follow-ups not in A1 (e.g. reminders before Pro ends, a price/plan page). |

After A1, the School Planning parts (D2 PPAs, D3 prints, D4 monitoring, D5 links) are built behind
`featureOn('plan')` at Testing, and opened with the switch.

## 10. Decisions (answered 2026-11-21)

- **Q1 Admins:** **only the custodian account(s) of Testing ES.** Not its assistants, not an email
  list.
- **Q2 Stages:** *"I'm planning this as a pro feature."* So the stages are **Off · Testing · Pro ·
  Everyone (free)**, and the admin marks schools as **Pro**. Leave and the Calendar are Pro
  features.
- **Q3 Getting in:** **the admin adds schools** (by School ID or from the schools list). No
  requests from schools.
- **Q4 Schools list:** **yes**: name, School ID, number of users, Pro or Free, which features are
  on.

**Follow-ups (still open):**
- **F1 Pro end date:** does Pro have an end date (e.g. per school year), or does it last until the
  admin removes it?
- **F2 When Pro ends:** do the school's Leave and Calendar records become **view only** (read,
  print, no new entries), or **hidden** until Pro is renewed? (They are never deleted.)
- ~~F3 Free schools~~ **Decided 2026-11-21:** *"free schools can access the Pro page in 7 days"*,
  read as **a 7-day free trial of Pro**, started from More → Pro (section 3).
- Payment stays outside the app (the admin marks Pro after being paid).

If F1 and F2 stay unanswered, A1 uses the recommended defaults: **F1** an optional end date per
school; **F2** view only (read and print, nothing new). F2 also applies when a trial ends.
