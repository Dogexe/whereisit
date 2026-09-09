# Spec: Ship an empty first run (no seeded budgets or bills)

Status: **proposed** (not built). From the September 2026 product audit's
finding D1, scoped as workstream WS-1 of the approved remediation roadmap.

A never-touched install currently presents four bills and four budgets that
the user never entered, rendered identically to real data. Home shows
"ค่าเช่าห้อง · เกินกำหนด 7 วัน · ฿8,000.00" with a live "จ่ายเลย" button on
the first screen a new user ever sees. This spec removes that seed data and
adds the two empty states its removal exposes.

## Current behavior

`src/state.js:121-132` seeds two module-level arrays with sample data:

```js
export let budgets = [
  { id: "b0", category: "อาหารและเครื่องดื่ม", limit: 3000 },
  { id: "b1", category: "การเดินทาง", limit: 1200 },
  { id: "b2", category: "ช้อปปิ้ง", limit: 1500 },
  { id: "b3", category: "บันเทิง", limit: 800 }
];
export let bills = [
  { id: "bl0", name: "ค่าเช่าห้อง", amount: 8000, day: 1, category: "ที่อยู่อาศัย/ค่าเช่า" },
  { id: "bl1", name: "ค่าอินเทอร์เน็ต", amount: 590, day: 5, category: "สาธารณูปโภค (ไฟ/น้ำ/เน็ต)" },
  { id: "bl2", name: "ประกันสุขภาพ", amount: 1200, day: 15, category: "สุขภาพ" },
  { id: "bl3", name: "Netflix", amount: 349, day: 20, category: "บันเทิง" }
];
export let goals = [];
```

`goals` already ships empty — that is the precedent this spec extends to
the other two.

These arrays reach the user through `loadFromStorage()`
(`storage.js:50-52`), which calls `restoreArray(s.budgets, budgets)`. Per
`restore.js:15`, a saved array always wins; the module default applies only
when the settings key is absent — i.e. a first-ever run. They then surface
on Home (upcoming bills, budget preview), Insights → Budgets, and Settings →
Budgets/Bills, and are written into `expense_tracker_settings_v1` on the
first `saveSettings()`, so they also form part of the first sync payload.

### What removal exposes (verified in a real browser, both viewports)

Running the app with `budgets: []` and `bills: []` — exactly the state this
change produces on a first run — at 1280×900 and Pixel 7:

| Surface | Behavior with zero rows | Verdict |
|---|---|---|
| Home → Upcoming bills | Section disappears entirely; already guarded by `dueSoon.length ? … : ""` (`home.js:252`) | Correct already |
| Home → This month's budgets | Heading and "See all" render over an **empty white card stub** (`home.js:275-281`, `.map().join("")` yields `""`) | **Broken — must fix** |
| Insights → Budgets | **Entirely blank** below the period picker (`insights.js:75-94`) | **Broken — must fix** |
| Insights → Categories | Renders `l.noExpensesPeriod` empty note | Correct already |
| Insights → Trend | Renders `l.noResults` empty note | Correct already |
| Settings → Budgets / Bills | Render `l.noBudgets` / `l.noBills` empty notes (`settings.js:187-188`) | Correct already |

No console errors in either viewport.

## Key decisions

1. **Empty states are minimal — text only, no icon and no call-to-action
   button.** Confirmed with the maintainer, and it matches the convention
   this repository already documents for exactly this case
   (`styles.css:478-481`): plain `.empty-note` is for "the app's other,
   first-use states ('you haven't added any budgets yet', etc.) — those stay
   untouched, generic, and intentionally minimal per this repo's earlier
   onboarding pass", while `.empty-note-search` is reserved for
   "your search/filter found nothing". Settings' own budgets and bills lists
   already follow this. The roadmap's earlier wording proposed a CTA; the
   documented convention wins.

2. **Reuse the existing `noBudgets` string.** `l.noBudgets`
   (`i18n.js:150` — `["ยังไม่มีงบประมาณ", "No budgets yet"]`) already exists
   and is already used by Settings' budgets list. Both new empty states use
   it, so **no new `STRINGS` entry and no new CSS rule are required.**

3. **Home keeps its section heading and "See all" button when empty.**
   Matches Home's own Recent activity section directly above, which keeps
   both and renders an empty note inside its card (`home.js:243-249`).
   Hiding the whole section — the treatment Upcoming bills gets — is
   deliberately *not* used here: bills are optional reminders, budgets are a
   feature worth leaving discoverable.

4. **Insights' empty state must not compete with the existing
   unbudgeted-spending card.** `renderBudgetsContent()` already renders an
   `.insight-card` with its own "+ Add budget" button whenever
   `unbudgeted > 0` (`insights.js:89-101`) — that covers "user has spending
   but no budgets". The new empty state therefore applies only when
   `rows.length === 0 && unbudgeted === 0`, which is precisely the fresh-install
   state. Two competing calls to action in one view would violate
   `docs/UX.md`'s one-primary-action rule.

5. **Existing users are unaffected, and no migration is needed.** Verified
   against `restore.js:15`: `restoreArray` returns a saved array whenever one
   exists, so a user who already has budgets or bills keeps every one of them,
   including ones edited from the original seeds. Only a first-ever run sees
   the new empty default.

## New behavior

- `state.js`'s `budgets` and `bills` initialise to `[]`, matching `goals`.
- Home's budget card renders `l.noBudgets` in a plain `.empty-note` when the
  preview list is empty, instead of an empty card.
- Insights → Budgets renders `l.noBudgets` in a plain `.empty-note` when
  there are no budget rows **and** no unbudgeted spend for the selected
  period.
- Everything else on a fresh install is unchanged: 16 default categories and
  one default "เงินสด" account still ship, because those are app vocabulary
  and a required invariant respectively, not fabricated user data.

### Intended side effect worth recording

A signed-in user setting up a **new device** currently receives the four
seeded budgets and four seeded bills merged alongside their real synced rows
— phantom entries on every new device. After this change they receive only
their own data. This is an improvement, not a regression, and no tombstones
are generated: `markAllPending()` (`sync.js:176-183`) maps over each array,
and both backfills guard their pushes with `if (changed*.length)`
(`sync.js:219-226`), so empty arrays are a no-op throughout.

## Out of scope

Deliberately excluded so this stays one reviewable change:

- **D2 — irreversible "Mark paid"** (roadmap WS-2). Removing the seeded bills
  makes the trap unreachable on a fresh install, but `markBillPaid` is
  untouched here and remains irreversible for real bills.
- **D4 — English localization of built-in categories and the default
  account** (roadmap WS-7 decision). This change removes roughly two thirds
  of the Thai strings visible in English mode as a side effect; the remainder
  is a separate, undecided scope.
- **C3 — erase-all / reset** (roadmap WS-7 decision).
- No change to default categories or the default account.
- No onboarding, tour, first-run wizard, or sample-data toggle.
- No retro-cleanup of seeded rows already saved on existing installs — see
  decision 5.

## UX constraints

- Follow `docs/UX.md`.
- Match existing: Home's Recent activity empty state (`home.js:248`) for the
  Home case; Settings' budgets list empty state (`settings.js:187`) for both.
- Reuse: plain `.empty-note` (`styles.css:477`) and `l.noBudgets`
  (`i18n.js:150`).
- New design primitives required by this spec: **none.** No new CSS class, no
  new `STRINGS` key, no new icon.
- Mobile (<1024px) and desktop (≥1024px): identical. Neither surface branches
  on viewport, and both empty states are plain centered text.
- Thai and English: both covered by the existing `noBudgets` pair; no new
  string widths to verify.

## Verification plan

Medium risk. The change is small, but it alters a shared state default and
breaks two existing e2e specs, so both suites run.

1. **`npm test`** — unit suite must stay at 173/173. The suite builds its own
   budget fixtures via `setBudgets(...)` (`tests/derived.test.js:155,173`) and
   never reads `state.js`'s defaults, so no unit test should need changing.
   A test that *does* need changing is a signal the change went wider than
   intended.
2. **`npm run test:e2e`** — two specs currently depend on a seeded budget
   existing and **must be updated as part of this ticket**:
   - `e2e/manage-row-swipe.spec.js:40-43` opens Settings → Budgets and
     asserts the first `[data-delete-budget]` row is visible.
   - `e2e/nav.spec.js:85` asserts `.manage-row-wrap` is visible inside the
     budgets sub-page.
   Both should create a budget through the real UI first, following
   `e2e/helpers.js`'s existing `createAccount()` pattern rather than writing
   to `localStorage`.
3. **New e2e coverage** asserting both empty states render on a fresh
   profile. This replaces a manual browser check: the e2e suite already runs
   signed-out with clean storage, which is exactly the state under test.
4. `npm run build` — the change is bundled application code.
5. Confirm on a fresh profile that Home shows no upcoming-bills section and
   no empty card stub, and that Insights → Budgets shows the empty note
   rather than a blank panel.
