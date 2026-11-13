# Notifications plan: where CustodianPro could use them

Status: November 2026. Rows marked **Built** in §3 ship today, along with the settings in §4.
What is still open: C8, C9, T3, T4 and push while the app is closed (§5).

## 1. Channels and the rule for each

| Channel | What it is | Use it for |
| --- | --- | --- |
| **Bell list** (header, next to More) | Saved list per school, role and account; unread count | Anything someone must act on or would want to look up later |
| **Toast** | Short message at the bottom (top while a sheet is open) | Results of what the user just did; one line for new bell items while the app is in front |
| **App-icon badge** | Number on the installed app icon (Android, desktop Chrome/Edge) | Same number as the bell's unread count |
| **Phone notification** | System notification. Shown only if the person tapped **Turn on** in the bell sheet and the app is open or was used recently | Bell items that arrive while the app is in the background |
| **Chrome title bar** | Window title (*Update ready ·*) and, in title-bar mode on a computer, the navy bar with **Update ready · Restart** | **App updates only.** Never the unread count or other events |
| **Banner in the page** | Bars under the header: update ready, backup reminder, install | Lasting states that need one decision |

Rules that keep this calm:

1. **Nothing for your own actions.** If you did it on this device, you get a toast, not a bell item.
2. **Announce each change once.** `notifCheck()` stores what this device has already seen.
3. **App updates go to the title bar whenever there is one.** On a computer, the title bar is the whole notice. On phones and tablets (no title bar) the update uses the Restart bar, a bell item and a phone notification.
4. **Reminders are worked out on the device.** There is no push server: they are computed when the app opens and, on Android, by Periodic Background Sync (about every 12 h, as the update check does today). Real push needs Firebase Cloud Messaging plus a Cloud Function (Blaze plan); see §5.
5. **Every type can be turned off** (§4) and goes to the matching screen when tapped (`go`).

## 2. Today (built)

| Who | Event | Source in `index.html` | Opens |
| --- | --- | --- | --- |
| Custodian | New supply request from a teacher | `notifFromRequests()` | Supply requests |
| Custodian | Teacher confirmed receipt of a release | `notifFromReports()` (`received`) | Teacher page |
| Custodian | Teacher wants to return an item · reports a problem | `notifFromReports()` | Inbox |
| Teacher | Request approved · declined (with reason) · ready to pick up | `notifFromRequests()` | My requests |
| Teacher | Items released (RIS/ICS/PAR) · transferred to you (ITR/PTR) | `notifFromMyReleases()` | My Items |
| Teacher | Return accepted / not accepted · report answered | `notifFromReports()` | My Items |
| Everyone | App update ready | `markUpdateReady()`: title bar on computers; Restart bar + bell + phone notification on phones | Restart / About |
| Android, app closed | App update downloaded | `sw.js` `backgroundUpdateCheck()` (Periodic Background Sync) | About |

## 3. Proposed: where notifications would help

Priority: **P1** = clear value and uses data the app already listens to; **P2** = useful, needs a
small rule or setting; **P3** = later or needs a server.

### Property custodian

| # | When | Message (example) | Channel | Data already there | Priority |
| --- | --- | --- | --- | --- | --- |
| C1 | An item falls to its **Min alert qty** after a release, RIS or count | *Low stock · Bond paper, A4 · 4 ream left (min 10)* · **Add to a request** | Bell (once per item until restocked) | `items[].qty`, `minQty`; Reports already counts low stock | **Built** |
| C2 | A **teacher joins** with the invite link or school code | *Ana Reyes joined · Teacher III · Grade 7* | Bell | `memberCol()` listener (`teacherRoster()`) | **Built** |
| C3 | A **release is still unconfirmed** after 3 days | *3 releases not confirmed yet · oldest ICS 2026-11-0004 to Juan* | Bell (daily digest, at most 1 a day) | `releaseList`, `tReports` (`received`) | **Built** |
| C4 | A **request waits** more than 2 school days | *2 requests waiting for your review* | Bell digest + app badge | `reqList` status + date | **Built** |
| C5 | **Year-end physical count** season (from 1 Dec) and the **RPCPPE/RPCSP** deadline (31 Jan) | *Physical count: 82 of 138 units verified · report due 31 Jan* | Bell, weekly in December/January | Count progress (`verified` per unit), Government forms | **Built** |
| C6 | Units marked **Needs repair** for more than 30 days | *2 units need repair for over a month · consider IIRUP* | Bell, monthly | Unit `condition` + `condAt` (set when the condition changes) | **Built** |
| C7 | **Backup / sync problem**: changes not saved to the account for 24 h while signed in, or sign-in expired | *Changes on this phone are not saved to your account yet* · **Fix** | Bell + existing banner, phone notification if on | Cloud sync status (`cloud.user`, pending writes) | **Built** |
| C8 | A **Purchase Request** marked ordered has no delivery after 30 days | *PR 2026-11-003 is still not delivered* | Bell | PR status (`prCol()`) | P3 |
| C9 | Equipment from **₱50,000** released without a PAR number | *Release to Ana needs a PAR number* | Toast when saving + bell if left | Release lines, thresholds already used for PAR/ICS | P3 |

### Teacher

| # | When | Message (example) | Channel | Data already there | Priority |
| --- | --- | --- | --- | --- | --- |
| T1 | Items released to you are **not marked Received** after 2 days | *Please confirm you received ICS 2026-11-0004 (2 projectors)* | Bell reminder (once) + phone notification if on | `myReleases`, own `received` reports | **Built** |
| T2 | The custodian **starts the year-end count** | *Year-end count: check the 4 items you hold and report problems* | Bell | Count season (C5) + `myReleases` | **Built** |
| T3 | A request is **partly supplied** (fewer than asked) | *Supplied 3 of 5 boxes of chalk* | Bell | Request lines and supplied quantities | P2 |
| T4 | The custodian **asks you to return** an item (needs a new "Ask to return" action) | *Please return Laptop 10ES-2026-0007 by Friday* | Bell + phone notification | New report kind `ask-return` | P3 |

### Everyone

| # | When | Channel | Priority |
| --- | --- | --- | --- |
| E1 | App update ready | **Chrome title bar on computers** (no bell item, no toast); Restart bar + bell + phone notification on phones | Built |
| E2 | Works offline / back online | Toast and the existing offline badge only (not the bell) | Built |
| E3 | Phone notifications blocked by the browser | Note in the bell sheet (exists) | Built |

## 4. Settings to add with P1/P2

In the bell sheet under *Get these on your phone too*:

- **Reminders** (C3, C4, C5, C6, T1, T2): on/off, default on, at most one reminder digest per day.
- **Low stock** (C1): on/off, default on.
- **Quiet hours** for phone notifications: 7 pm – 6 am by default. Items still go to the bell.

**Built (Nov 2026):** custodian switches *Low stock*, *Unconfirmed releases*, *Waiting too long* (C4 + C6) and
*Year-end count*; teacher switches *Reminders to tap Received* and *Year-end count*. *Quiet hours* (on, 7:00 PM – 6:00 AM,
times editable) appears once phone notifications are on. Phone notifications held overnight are summed up in one
notification (*3 notifications overnight*) when quiet hours end, if the app is still in the background.

## 5. Push when the app is fully closed (P3)

Today a phone gets phone notifications only while the app is open or was used recently. To reach a
closed app:

1. Firebase Blaze plan and Firebase Cloud Messaging (FCM). Store each device token under `schools/{id}/members/{uid}/tokens`.
2. A Cloud Function per event (new request, release, report answered) that sends to the right tokens, applying the same "not your own action" rule.
3. The service worker shows the push. Tapping it opens the same `go` screen as the bell item.
4. iPhone: only for the installed app (iOS 16.4+), after the user taps **Turn on**.

Cost for one school is within the free FCM allowance; the Cloud Functions need the Blaze plan
(pay as you go, normally ₱0 at school volumes).

## 6. Suggested order

1. **P1:** C1 low stock, C2 teacher joined, C3/T1 confirm-receipt reminders (**built, Nov 2026**: T1 reminds at 2 and 7 days, C3 once at 3 days; releases older than 30 days are skipped; switches *Low stock* and *Reminders* in the bell sheet), C7 sync problem (**built**). These only add `notifCheck` sources next to the existing ones, plus a daily digest helper.
2. **P2:** C4–C6, T2 and the settings in §4 (**built, Nov 2026**). T3 is still open.
3. **P3:** C8, C9, T4 and FCM push (§5), if the school moves to the Blaze plan.

Each step gets tests in `tests/e2e/notifications.mjs` using the fake backend: event → one bell item → tap opens the screen → no repeat after a reload.
