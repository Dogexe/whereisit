# Spec: Home header — greeting + date, drop "Overview"

Status: **proposed** (not built). Requested directly from an annotated
screenshot mark-up (`E:\design\UPmP7gus.jpg`): replace Home's static
`"{Month Year}"` / `"Overview"` header with a personalized greeting on row
one and the date moved to row two.

## Current behavior

`renderHome()` (`src/screens/home.js:113-119`) renders `.home-header-row`
as two stacked lines inside `.home-col-main`'s leading block:

- Row 1: `.today-label` — `today`, a localized `"{long month} {year}"`
  string (e.g. `"September 2026"`), computed at `home.js:93` via
  `Date#toLocaleDateString`.
- Row 2: `.screen-title` — the literal i18n string `l.overview`
  (`"ภาพรวม"` / `"Overview"`, `i18n.js:7`).

The profile avatar button sits to the right of both rows, unaffected by
this spec.

## Key decisions (confirmed with the user before building)

1. **Row order flips and the content changes**: row 1 becomes the
   greeting, row 2 becomes the date. `l.overview` is dropped from Home
   entirely (not reused elsewhere on this screen) — confirm no other
   caller depends on it before removing the key, since it may still be
   used as a nav/section label elsewhere in the app.
2. **Date format is unchanged** — row 2 keeps rendering exactly what
   `.today-label` renders today (`"September 2026"`-style long month +
   year), just relocated to the second row. No new date-formatting logic.
3. **Greeting name source**: reuse the display name Home already computes
   for the profile-avatar fallback, `accountDisplayName(currentUser,
   l.notSignedIn)` (`home.js:108`) — do not introduce a second name
   source. When the user is **signed out**, `accountDisplayName` returns
   `l.notSignedIn` ("Not signed in" / "ยังไม่ได้เข้าสู่ระบบ"); per
   decision 5 below, the signed-out greeting drops the name rather than
   showing that label.
4. **Greeting varies by time-of-day, with 2-3 phrasings per bucket** (the
   "multiple way to greet user" requirement). Three buckets, using the
   device's local hour at render time (`new Date().getHours()`):
   - **Morning** (05:00–11:59): pick randomly from `["Good morning",
     "Rise and shine"]` (en) / a matching Thai pair.
   - **Afternoon** (12:00–17:59): `["Good afternoon", "Hope your day's
     going well"]` (en) / matching Thai pair.
   - **Evening** (18:00–04:59): `["Good evening", "Welcome back"]` (en) /
     matching Thai pair.
   - The pick is random **once per Home render** (not once per session,
     not on a timer) — consistent with this app having no existing
     client-side timer/interval pattern to reuse for a mid-session
     refresh, and Home already re-renders on every real navigation.
   - Exact Thai phrasings are Codex's to draft following this app's
     existing tone (short, casual, matches `notSignedIn`/`overview`'s
     register) and get sanity-checked in review — this spec fixes the
     *structure* (3 buckets × 2-3 options each, i18n-paired), not the
     literal Thai copy.
   - Full greeting when signed in: `"{Greeting}, {name}"` (e.g. `"Good
     morning, Nitipoom"`). When the name is empty/signed out: just
     `"{Greeting}"` (no trailing comma/name) — see decision 5.
5. **Signed-out greeting drops the name**, per user decision: rather than
   `"Good morning, Not signed in"`, render just `"Good morning"` (time-of-
   day greeting alone) when `currentUser` is falsy.

## New behavior

- `.home-header-row`'s two text lines swap **content**, not their type
  styling — each row keeps the visual weight it has today, per the
  maintainer's annotated mockup (`E:\design\UPmP7gus.jpg`): the small/muted
  line stays small/muted and the large/bold line stays large/bold, only
  the text each renders changes.
  - Row 1 (top, small/muted — `.today-label`'s existing type treatment):
    the computed greeting string from decision 4/5.
  - Row 2 (bottom, large/bold — `.screen-title`'s existing type
    treatment): the existing `today` date string, unchanged format.
  - Correction: an earlier draft of this spec had the sizing backwards
    (greeting large/primary, date small/secondary) from misreading the
    mockup. The date is the primary/large line; the greeting is the
    secondary/small line above it — confirmed directly against the
    mockup's annotations, not a preference call.
- No change to the profile avatar button, its click handler, or
  `.home-header-row`'s layout/spacing beyond the text change.

## Out of scope

- No change to `accountDisplayName()` itself, `currentUser`, or how the
  profile avatar resolves its own fallback initial/icon.
- No mid-session refresh of the greeting (e.g. a clock that flips the
  bucket if the app is left open across a time-of-day boundary) — it's
  computed once per render, per decision 4.
- Not touching the hero card, account switcher, or icon coloring — see
  `docs/specs/home-hero-account-carousel.md` and
  `docs/specs/home-income-expense-icon-color.md`.
- Not adding any new i18n infrastructure — new greeting strings follow
  the existing `key: [th, en]` tuple convention in `i18n.js` exactly as
  today's keys do.

## UX constraints

- Follow `docs/UX.md`.
- Match existing: Home's own `.home-header-row` (`src/screens/home.js`,
  `styles.css`) — this is a content/order change to an existing element,
  not a new component.
- Reuse: `accountDisplayName()` (`src/account.js`), the existing
  `today`/date computation at `home.js:93`, the existing `i18n.js`
  `key: [th, en]` tuple pattern.
- New design primitives required by this spec: none.
- Mobile and desktop: identical — `.home-header-row` does not currently
  branch by viewport width and this spec introduces no such branch.

## Verification plan

Low-risk, text/render-only change. After implementing:

1. `npm test` (unit tests touching `home.js` rendering, if any exist).
2. Real-browser check (both `th` and `en`, light/dark, signed-in and
   signed-out): confirm greeting renders above the date, confirm all
   three time-of-day buckets render correct copy (can force by stubbing
   `Date`/`getHours` in a quick manual check or a small unit test), and
   confirm the signed-out case shows the bare greeting with no name/comma
   artifact (e.g. no `"Good morning, "` trailing comma-space).
3. Confirm no other screen/string referenced `l.overview` before deleting
   the i18n key outright — if another caller exists, keep the key and
   just stop using it on Home.
