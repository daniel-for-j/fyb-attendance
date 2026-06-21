# FYB Week 2026 — Registration & Attendance App

A lightweight installable app for Bingham University FYB Week 2026. Built from
your 998 verified paid-student records. Works fully offline for search and
attendance marking; syncs across devices in the background once Firebase is
configured (5-minute one-time setup).

---

## 1. Get it online (so people can open/install it)

This is a set of static files — no server-side code. Drag the whole
`fyb-app` folder into any free static host:

- **Netlify Drop**: https://app.netlify.com/drop — drag the folder in, get a link instantly.
- **GitHub Pages**: push the folder to a repo, enable Pages.
- **Vercel / Cloudflare Pages**: similar drag-and-drop or git deploy.

Once live, share the link with your registration team.

## 2. Install it on a phone/tablet (no app store needed)

- **Android (Chrome)**: open the link → menu (⋮) → "Add to Home screen" / "Install app".
- **iPhone (Safari)**: open the link → Share icon → "Add to Home Screen".

It now behaves like a normal app icon and opens full-screen, offline-ready.

## 3. Turn on cross-device sync (one-time, ~5 minutes, free)

Right now every device works perfectly on its own, offline, for search and
marking attendance — but won't share marks with other devices until you do this:

1. Open **`firebase-config.js`** in the project folder — it has full
   step-by-step instructions in the comments at the top.
2. Create a free Firebase project at https://console.firebase.google.com,
   enable **Firestore Database**, and paste 6 config values into that file.
3. Re-upload the updated `firebase-config.js` to your host (or redeploy).

After that, every device that opens the app syncs attendance marks in the
background automatically whenever it has internet — no manual refresh needed.

**Until this is done:** the app still works great on a single device. You can
run registration entirely on one phone/laptop if you don't need multi-device
sync.

## 4. Using the app

- **Search tab**: type any part of a name or matric number. Tap a result to
  open their full record and mark them present/absent for any of the 7 days
  with one tap each.
- **Event Days tab**: pick a day (Mon–Sun) to see a live headcount for that
  day's event, and search-and-check-in students specifically for that day.
- **Stats tab**: total paid students, how many have attended at least once,
  and a per-day attendance bar chart.
- **Setup tab**: shows sync status, and lets each device set a name (e.g.
  "Main Gate Tablet") so the team can see who checked someone in.

## 5. Known data notes

- Your CSV had **no phone number column** (only emails), so search covers
  **name, matric number, and email** — not phone. If you'd like phone search
  later, that needs a phone number added to the source data.
- 4 students appear to have paid twice in the original export (duplicate
  matric numbers) — these were automatically collapsed to one record each so
  no one shows up twice in search.
- A few dozen matric numbers in the original sheet have typos or inconsistent
  formatting (extra/missing slashes, mixed case, stray characters). Search is
  built to ignore punctuation/case so these will still mostly be found by
  partial name or partial digits — but it's worth a quick manual review of
  the original CSV for anything that looks badly mistyped.

## 6. Files in this folder

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | FYB Week gold/maroon/black theme |
| `app.js` | Search, attendance marking, all views |
| `db.js` | Offline local storage (IndexedDB) |
| `sync.js` | Background cross-device sync (Firebase) |
| `firebase-config.js` | **Edit this** to turn on sync — instructions inside |
| `students-data.js` | The 998 paid students, generated from your CSV |
| `manifest.json` / `sw.js` | Makes the app installable and offline-capable |
| `icons/` | App icons generated from your FYB logo |
