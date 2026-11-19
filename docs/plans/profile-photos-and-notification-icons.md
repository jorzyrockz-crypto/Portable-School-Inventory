# Plan: profile photos, and a proper icon on every phone notification

Status: **plan**, nothing built yet. Answers to the questions at the end decide the details.

## What exists today

| Place | Today |
|---|---|
| Teacher's phone header (*Hi RICKY · My items · To the property custodian of GUANKO ES*) | Text only (`#rqHello`, `#rqTitle`, `#rqSchool`). |
| Teachers page (custodian): list rows, person page header, *Same person as…* picker, Notes/To review rows | A circle with initials (`personInitials`, 5 places). |
| Member card `schools/{id}/members/{uid}` | `uid, name, position, office, email, joinedMs, status…`. **No photo.** The rules allow only those keys (`hasOnly`), so a photo needs a rules change. |
| Phone / browser notifications (`showSystemNotif`) | **Always the app icon** (`assets/icons/icon-192.png`) and the same badge, whatever the notification is. |
| In-app bell list | Each notification already has its own Phosphor icon and colour (`icon: 'ph-user-plus', tone: 'brand'`): about 40 glyphs, 55 glyph + colour pairs. |
| Notifications about one teacher | 10 kinds already carry `person: uid`: join request, confirmed receipt, problem, wants to return, counted items, not confirmed. Supply requests, *took supplies* and book loan requests don't yet. |

Where the photo comes from: teachers and custodians who sign in **with Google** have a Google profile photo (`user.photoURL`, `https://lh3.googleusercontent.com/…`). Teachers who joined **without Google** (anonymous sign-in) have none.

## 1. The user's own photo in the header (teacher's phone)

- A 48 px round photo to the right of the *Hi RICKY / My items* block (phone-first: the title keeps its size and stays left). It is the same on all four tabs (My Items, Requests, School stock, Library).
- Source: `cloud.user.photoURL`, asked for at 192 px (`=s192-c`) so it is sharp on phones. It is loaded with `referrerpolicy="no-referrer"` (Google photos can refuse requests that send a referrer).
- No photo (not Google, offline, or the image fails): a circle with the initials in the same place (*R*), so the header never jumps.
- Tapping it opens the existing **Edit my details** sheet.
- The custodian's own header gets the same treatment (More menu / account chip), using their Google photo if they signed in with Google.

## 2. Photos in the list of teachers (custodian)

- The teacher's phone saves the photo address on their member card as a new field `photo`, the same way it already keeps name, position and office up to date (`upsertMyMember`). It is updated when their Google photo changes.
- Every initials circle on the Teachers page shows the photo when there is one, with the initials as the fallback:
  - list rows (40 px), the person page header (48 px), the *Same person as…* picker, To review (join requests);
  - the Librarian list in Books & Library, and the School Head's list if it shows names.
- A shared `avatarHTML(person, size)` replaces the five copies of the initials circle. On error (offline, deleted Google photo) it switches to the initials.
- Typed names (no account) keep the grey initials circle, as now.
- **Rules** (publish again): `members`. The teacher may write `photo` on their own card: a string of up to 300 characters, either empty or starting with `https://lh3.googleusercontent.com/`. The custodian may clear it (Edit details → Remove photo). The fake backend in the tests gets the same rule.
- Reads: none extra. The photo address rides on the member card the custodian already reads; the image itself comes from Google, not Firestore.

## 3. A proper icon on every phone / browser notification

**The type icon.** Each notification is drawn on the phone at the moment it is shown, from the same Phosphor icon and colour as its row in the bell:
- `icon`: a 192 px coloured circle with the white glyph. For example, a teal circle with a hand for *New items released to you*, rose with a warning sign for *Problem reported*, emerald with a check for *confirmed receipt*, amber with a clock for *not confirmed for 12 days*.
- `badge` (the small status-bar icon on Android): the same glyph alone, white on transparent, as Android requires.
- It is drawn with a `<canvas>` using the icon font the app already loads, then turned into a `data:` image. So there are no new files to download, it works offline, and every future notification type gets its icon automatically.
- Fallback if a browser refuses `data:` icons: build-time PNGs (`assets/icons/notif/…`, about 55 small files made with `sharp` from the same Phosphor icons, cached for offline). This is decided by testing on Android Chrome before building.

**Profile photos where the notification is about a person.**
- Custodian's phone:
  - join requests;
  - supply requests and *took supplies* (`person` added);
  - confirmed receipt, problem, wants to return, counted items, not confirmed;
  - book loan requests and returns (`person` added);
  - an assistant or the School Head joining or approving.
- The icon becomes **their photo in a circle, with the small type icon in a coloured bubble at the bottom-right corner**, like a chat app. You see who it is and what happened at a glance.
- No photo for that person: their initials in a circle, with the same corner bubble.
- Notifications that aren't about one person keep the plain type icon:
  - quiet-hours summary, *3 new notifications*;
  - reminders (year-end, PR not delivered, ₱50k on an ICS);
  - cloud errors, app updates.
- Teacher's phone: notifications from the custodian (*approved*, *released to you*, *Ask back*, reminders) can show **the custodian's photo** with the type bubble, if the custodian signed in with Google (question 2). Otherwise the plain type icon is used.
- The in-app bell list uses the same picture for rows about a person: a photo with a small coloured icon in the corner. Other rows keep the plain icon.
- The browser tab's own pop-up toast (when the app is open) is unchanged: one line, as now.

## 4. Tests, notes, build

- New suite `tests/e2e/profile-photos.mjs`:
  - Google teacher: photo in the header, on the member card and in the Teachers list;
  - teacher without Google: initials; a broken photo falls back to initials;
  - rules: a teacher can't set another address or write another teacher's photo;
  - each notification type gets a non-default `icon` and `badge`, and person notifications get a photo icon (`showNotification` captured in the page).
- The fake Google account in the tests gets a `photoURL`.
- README: Teachers section and Notifications section.
- New What's new entry (`2026-11-profile-photos`), `npm run build`, PR. You publish `firestore.rules` again after merging.

## Not included

- Firebase Storage uploads. New Storage buckets need the paid Blaze plan, so the default is Google photos only (see question 1 for a free alternative).
- Photos on printed forms (ICS, RIS, accountability prints stay text only, as COA forms are).

## Questions

1. **Teachers who joined without Google** (no Google photo): initials only, or let them pick a photo from their phone? A picked photo would be shrunk to 96 × 96 px (about 5 KB) and kept on their member card, which is free on Spark and slightly larger to read.
2. **Custodian's photo on the teacher side.** Show the custodian's Google photo next to *To the property custodian of …* and on the notifications teachers get from the custodian? This needs `custodianPhoto` on the school document.
3. **Corner bubble** on person notifications (photo plus a small type icon), or the photo alone?
