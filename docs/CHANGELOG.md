# Project changelog / pass history

This is the full narrative history of every feature pass, redesign, and bug-fix
round done on this app, moved out of the root `CLAUDE.md` so that file stays
short enough to load in full every session. Load this file only when you
actually need the story behind a past decision — "why is this built this way,"
"has this been tried before," "what did the spec for X actually decide." For
current architecture facts (where things live, standing conventions), see
`CLAUDE.md`'s Architecture section instead; this file is history, not a
reference.

Entries are in chronological order, oldest first, exactly as they were
originally written into `CLAUDE.md`.

## Module-split status

The app used to be one ~1850-line `index.html` with everything inline. That's being split into modules incrementally (small, independently-verified stages), tracked as part of a larger "make whereisit a real product" roadmap:
1. ✅ **Done**: extract the inline `<script>` verbatim into `src/main.js`, add the esbuild build + GitHub Actions deploy pipeline. No logic changes — this stage was purely about the build/deploy plumbing.
2. ✅ **Done**: extract the inline `<style>` block verbatim into `styles.css`, linked from `index.html` and copied into `dist/` by the build script.
3. ✅ **Done**: split `src/main.js`'s pure-logic sections into `categories.js`, `i18n.js`, `utils.js`, `state.js`, `storage.js`, `theme.js`, `derived.js`. Unlike stages 1-2 this was a real refactor, not a verbatim move — see "State ownership across modules" in `CLAUDE.md`'s Architecture section for why, and don't repeat the mistake of reassigning `transactions`/`budgets`/`bills`/`goals` directly from outside `state.js`. `markBillPaid` stayed behind in `main.js` (it has side effects — render/toast/sync — unlike the rest of what used to be the "derived data" section).
4. ✅ **Done**: extract the Supabase sync/auth section into `sync.js`. `currentUser` got the same setter treatment as stage 3's arrays (`setCurrentUser`, called from `main.js`'s `onAuthStateChange` listener, which stayed in `main.js`). `syncNow()` needs to trigger a re-render but `renderScreen()` was still `main.js`-owned at the time — rather than a circular import, `sync.js` took a callback (`setSyncRerenderCallback`), superseded in stage 5 by `renderScreen` moving to `screens/router.js` (the callback registration still happens, just pointed at the new home).
5. ✅ **Done**: split every screen into its own module under `screens/` — `home.js`, `transactions.js`, `add.js`, `insights.js`, `settings.js` (which absorbed the old "Budgets/Bills management" and "Savings goals management" sections too, since those were always sub-renders of Settings, not separate screens) — plus three new leaf modules: `toast.js` (`showToast`, needed by every screen), `pwa-install.js` (`deferredInstallPrompt` + `setDeferredInstallPrompt`, moved out for the same reassignment reason as stage 3/4's setters), and `screens/router.js` (`setTab`/`renderScreen`/`renderChrome`). `main.js` is now ~73 lines, boot-sequence only. See "Cross-module callbacks and the registration pattern" in `CLAUDE.md` for how `router.js` avoids depending on all 5 screens while all 5 screens depend on it. `markBillPaid` moved into `screens/home.js` (its only caller) rather than staying in `main.js`, for the same reason.
6. ✅ **Done** (verified, not built): checked `index.html` directly — no inline `<style>` or `<script>` logic remain; it's markup only (the `.app`/`.screen`/`.toast`/`.tabbar` structure), the manifest/icon `<link>`s, the two CDN library loaders (Supabase JS, Lucide — external, not app code, and deliberately staying that way per the scope note below), `<link rel="stylesheet" href="./styles.css">`, and `<script type="module" src="./main.js">`. This was already achieved as a side effect of stages 1-2 (script/style extraction) and stage 5 (`main.js` down to boot-only) — no further work was needed. **The module-split roadmap is now complete.**

Supabase JS and Lucide were deliberately staying as CDN `<script>` tags (not npm packages) through this whole effort — that was a scope decision, not an oversight. **Superseded for Lucide** by the "App correctness and offline" pass below: Lucide is no longer CDN-loaded at all (self-hosted as `icons/sprite.svg`, an inline `<use>` sprite), since the CDN being unreachable offline — not just unpinned — turned out to be a real bug. Supabase JS is unaffected by that pass and still stays on the CDN (see the "App correctness and offline" section for why).

## Broader "make whereisit a real product" roadmap

The module split above was one item out of a larger roadmap that spans multiple sessions. Status of the rest, so a future session doesn't have to re-derive it:
1. **Data protection**: ✅ already correct, not a gap — see RLS note in `CLAUDE.md`'s schema section.
2. **Module split** (file organization / build step): ✅ done, see above.
3. **Error handling & messaging**: ✅ done. Auth failures (sign-in/sign-out) are handled — see the Auth bullet in `CLAUDE.md`'s Architecture section. `localStorage` save failures are handled — see the Persistence bullet and its `queueMicrotask` note, which matters if you ever touch `saveToStorage`/`saveSettings` again. Sync failures now also toast once outside of Settings (`sync.js`'s `lastSyncFailed` flag) rather than only updating the small Settings-only status line — on investigation, "doesn't distinguish offline/outage/auth-expired" turned out to be a smaller gap than originally assumed (offline and signed-out already had their own distinct messages, and an expired session self-resolves into the signed-out message via the existing auth listener), so the actual fix was visibility, not message categorization.
4. **Data export**: ✅ CSV/JSON already existed before this roadmap started; not revisited.
5. **First-time onboarding**: ✅ done — but turned out to be a much smaller gap than the original spec pass assumed. A fresh, empty-localStorage load was checked directly: sample budgets and bills already ship by default, and Settings' Goals section already had inviting "not yet" wording with a visible Add button. The only real gap was Home's recent-activity list reusing `noResults` ("No transactions found," search-failure phrasing borrowed from Transactions' filtered empty state) for the "genuinely zero transactions ever" case — fixed with a dedicated `noTransactionsYet` string used only there.
6. **Error visibility for the builder**: ✅ done — `error-report.js` logs unhandled client errors to a new Supabase `error_logs` table (insert-only from the app; read via the Supabase dashboard, not through the app). See the Error reporting bullet in `CLAUDE.md` and the schema section.
7. **Polish**: ✅ done — three of the four original sub-items turned out to be non-issues once actually checked: confirmation toasts already exist for every save, and there's no genuinely long-running operation anywhere that would benefit from a loading spinner (the app is local-first; background sync already shows "Syncing..." as text). Custom domain was skipped — it needs the user to actually own a domain and control DNS, not something buildable unilaterally; revisit if that ever changes. Privacy policy is done: `privacy.html`, bilingual, linked from Settings — see the schema section's `error_logs` note and the Error reporting architecture bullet for what it discloses about data handling. Gets ahead of the Google OAuth consent-screen requirement (a privacy policy URL is required once the app moves off "Testing" mode) rather than needing it built under time pressure later.

**This closes out the full "make whereisit a real product" roadmap from the original spec pass.** A recurring pattern worth remembering for the next roadmap: several items (data protection, data export, first-time onboarding, loading states, confirmations) turned out to already be substantially or fully handled once actually checked against the live app/database rather than assumed from the original framing — check before building.

## UI/UX pass (post-roadmap)

A separate, later round of UI/UX work, specced first (see `repo/docs/specs/`) then built and verified live in a browser:

1. ✅ **Done**: swipe-to-reveal transaction row actions. Edit/Delete are no longer always-visible on transaction rows — they're hidden by default and revealed by dragging the row left (touch) or hovering it (mouse/desktop). Applies to both Home's recent-activity rows and the Transactions screen (`src/screens/tx-row.js`, shared). See `repo/docs/specs/swipe-to-reveal-transaction-actions.md` for the full spec, and `CLAUDE.md`'s "A caught-bugs note" for a real hit-testing bug this surfaced.
2. ✅ **Done**: Settings screen redesign ("Concept B" — refined single page, not the grouped-navigation alternative that was also previewed and rejected). Regrouped into icon-led cards (Appearance, Cross-device Sync, Manage), with Budgets/Bills/Goals collapsed by default via native `<details>`, persisted per-session via `state.settingsGroupOpen`. No functional changes to any save/delete/sync logic. See `repo/docs/specs/settings-redesign-concept-b.md`.
3. ✅ **Done**: one-way "Export to Google Sheets" (`src/sheets-export.js`), a third row next to CSV/JSON export in Settings' Sync & Data card. Every click creates a brand-new spreadsheet (never updates a previous one) with four tabs — Transactions, Budgets, Bills, Goals — via Google Identity Services (a CDN script, no new npm dependency) requesting only the narrow `drive.file` OAuth scope, not full Sheets/Drive access, and works independently of whether the user is signed in for Supabase sync. Needed a real Google Cloud OAuth Client ID that only the user could create (a step no amount of asking-Claude can substitute for); see `repo/docs/specs/google-sheets-export.md` for the exact console steps that were followed, in case this ever needs redoing (a new environment, a rotated credential). Verified live end-to-end by the user themselves, including the actual Google consent screen — that step doesn't get automated even when it technically could be, since granting an OAuth permission is the kind of thing to leave to the account owner's own click.
4. ✅ **Done**: the fourth, originally-open-ended "other UI/UX improvement" item — found via interview + a live visual audit rather than a pre-supplied bug report ("something cutting across screens" → "visual style" → "inconsistency"). Budget/Bill rows inside Settings' Manage section were the one icon-less exception among every other icon-led row this session's redesigns established (transaction rows, Settings toggle rows, Settings group headers); fixed by giving them the same category icon transaction rows already use (`iconFor(category)` + `rowTone("expense")` from `categories.js` — zero new icon/color data) plus aligning `.manage-row`'s font-size/gap to match its siblings exactly. Deliberately left Home's budget preview and Insights' Budget tab untouched — they're a different, legitimate icon-less progress-bar pattern (same shape as Insights' category-breakdown legend-dot rows), not the same gap. See `repo/docs/specs/settings-manage-row-icons.md`.

**This closes out all four items from the session's original UI/UX request.**

## Sync efficiency pass (post-UI/UX)

`syncNow()` (`src/sync.js`) used to re-upload and re-download the entire local dataset every 25 seconds, regardless of whether anything had changed — the full-table push was really just an unconditional retry mechanism, since every individual create/edit/delete already pushed its own single row immediately. Fixed across four commits (merged via PR #1), see `CLAUDE.md`'s Sync bullet for the resulting architecture:

1. ✅ **Done**: extracted the pull-side last-write-wins merge logic into pure, unit-tested functions in `src/merge.js` (`mergeRowsById`, `mergeBudgetsByCategory`), added `npm test` (Node's built-in test runner, no new dependency) and wired it into CI before `npm run build`. Preserved (not fixed) a pre-existing `pullBudgets` quirk: merges by category name instead of id, never compares timestamps, treats a tombstone as a no-op, and bails out early on an empty cloud result — see `src/merge.js`'s doc comment.
2. ✅ **Done**: `src/pending.js` tracks records still needing upload, persisted to `localStorage`. `syncNow`'s push phase now pushes only pending rows (zero network calls when nothing's pending) instead of the whole table. `markAllPending()` runs once on a genuine new sign-in (the `SIGNED_IN` auth event specifically, not a session-restore reload) so a fresh/long-offline device still gets exactly one full upload.
3. ✅ **Done**: `src/watermark.js` tracks the newest `updated_at` seen per table and filters pulls to `.gte("updated_at", watermark)` instead of an unfiltered `select` — derived only from server-returned timestamps, never the local clock. `resetWatermark()` pairs with `markAllPending()` on sign-in.
4. ✅ **Done**: a Codex second-opinion review of commits 2-3 caught two real bugs, both fixed with regression tests — see `CLAUDE.md`'s Sync bullet for both. It also flagged a cross-account local-data leak on shared devices; confirmed via `git show main:src/sync.js` (pre-PR) that this predates the whole pass (the original full-table push already tagged everything with whoever `currentUser` currently was, with no local-state clearing on sign-out) — left unfixed and documented rather than silently expanded into scope, since fixing it is a product decision (what should happen to local state on an account switch), not a bug fix.

Live-verified via DevTools Network (not just tests): idle sync traffic dropped from 7 requests/tick (4 full-table `GET`s + 3 full-table `POST`s) to 4 requests/tick (4 filtered `GET`s, 0 `POST`s when nothing's pending).

## Sync correctness pass (post-sync-efficiency)

The cross-account leak flagged-but-not-fixed at the end of the pass above turned out to be worth fixing after all, plus two scale-related bugs a closer look surfaced. Four commits (merged via PR #2):

1. ✅ **Done**: account data isolation. `src/account.js`'s pure `shouldWipeLocalData(storedUserId, incomingUserId)` decides whether a sign-in should wipe local data (only when a *different* account was previously on this device — never on no-stored-id or a same-account resume). `sync.js`'s `wipeLocalAccountData()` does the actual wipe (transactions/budgets/bills/goals/pending/watermark, deliberately leaving `state.lang`/`state.dark` alone) — called from `main.js`'s auth listener on both `SIGNED_OUT` (the clean case) and a mismatched `SIGNED_IN`/`INITIAL_SESSION` (the safety net for when sign-out never fired cleanly). Live-verified by signing out of a real session and inspecting `localStorage` directly, not just via the unit tests.
2. ✅ **Done**: pagination. Supabase caps `select()` at 1000 rows with no error on truncation — `src/paginate.js`'s `fetchAllPages()` pages through everything instead.
3. ✅ **Done**: `pushRows()` chunks large uploads into batches of 500, clearing pending per-chunk (not once at the end) so a mid-batch failure only leaves the failed chunk and later ones pending.
4. ✅ **Done**: a second Codex review (a fresh thread — this was an independent review, not a follow-up to the first) of commits 1-3 caught two more real bugs before merge:
   - `INITIAL_SESSION` wasn't recording the signed-in account id, only `SIGNED_IN` was — a user who already had cloud data loaded *before* this account-tracking code shipped would have no baseline to compare against on a later account switch. Fixed by running the same account-mismatch check for both events (main.js), keeping the "one full upload" side effects exclusive to genuine `SIGNED_IN`.
   - A race: an in-flight pull for the outgoing account could resolve *after* a wipe and silently repopulate local state with the old account's data via `setTransactions()`/etc. Fixed with a `syncEpoch` counter (`sync.js`) that `setCurrentUser()` bumps on any identity change (not a same-account token refresh); every pull discards its result if the epoch moved while it was in flight. The push side doesn't need this — RLS (`auth.uid() = user_id`) already rejects a stale push under a mismatched account server-side, independent of anything the client does.
   - Commit 2's pagination was upgraded from offset-based (`.range()`) to keyset/cursor-based: offset pagination assumes a stable result set between page fetches, but a concurrent write that moves a row across a page boundary mid-fetch can silently skip it — and if that row's timestamp was under the new watermark, permanently. Fixed with a composite `(updated_at, id)` cursor via `.or()`, covered by a regression test that mutates a row's timestamp between simulated page fetches.

Live-verified: real sign-out on a real signed-in session, `localStorage` inspected directly (transactions/budgets/bills/goals/pending/watermark all correctly wiped, `lang`/`dark` correctly preserved, the account id correctly *not* cleared). The two-account leak test and the >1000-row pull test from the original request need a second real Google account and 1000+ seeded rows respectively — left to the repo owner, same as the Google Sheets OAuth consent step earlier in this doc.

## Marketing landing page

🗑️ **Removed.** `repo/landing/` (and the `cpSync("landing", "dist/landing", ...)` line in `scripts/build.mjs`, and `tests/landing-feature-cards.test.js`, which existed only to test it) were deleted at the user's request. The page no longer exists anywhere in this repo or at `https://dogexe.github.io/whereisit/landing/` once the removal deployed. Everything below in this section and the "brand unification + polish" subsection is kept only as historical record of what was built and later removed — don't treat any of it as describing current state, and don't assume `repo/docs/specs/landing-page.md` describes anything still live.

✅ ~~Done~~, scoped via `/spec` first (`repo/docs/specs/landing-page.md`) since a landing page wasn't part of any prior roadmap item. Lived at `repo/landing/index.html` — a single self-contained static file (own inline `<style>`/`<script>`, no build step, not part of the esbuild pipeline) — copied into `dist/landing/` by one added `cpSync` line in `scripts/build.mjs`. Deployed alongside the app at `https://dogexe.github.io/whereisit/landing/`; the app itself at the site root was completely untouched by this change.

Deliberately minimal single-screen scope (hero + 4 feature bullets + a closing CTA + footer) — no screenshots, no "how it works," no FAQ, no nav. Bilingual (Thai/English) via a manual TH/EN toggle button that flips a `data-lang` attribute on `<html>` and shows/hides paired `<span lang="th">`/`<span lang="en">` elements per string, persisted to `localStorage`; this was a page-local toggle only, not wired into the app's own `src/i18n.js`. The primary CTA linked to `../` (the app root) — verified live to actually land on the working app, not just checked by reading the href.

### Landing page brand unification + polish (post-launch, later removed)

A review round found the landing page reading as a different product from the app (warm amber accent + Manrope vs. the app's cool indigo + Inter) plus a few real bugs. Fixed across four commits on `landing-brand-unification-polish`, three of the original five items from that review:

1. ✅ **Done**: fixed feature cards being invisible with JavaScript disabled/blocked/erroring — measured, not theoretical: 0 of 4 cards rendered. `.feature-card` used to be `opacity:0` in plain CSS, made visible only by a script-added `.in-view` class. Fixed by inverting the default (progressive enhancement): the base `.feature-card` rule is visible in plain CSS; the hidden/reveal states moved to `.feature-card.pre-reveal`, a class the script adds immediately before observing, so the scroll-reveal animation only exists when JS is there to run it, never something JS is needed to undo. `prefers-reduced-motion` now skips the reveal entirely (checked via `matchMedia` before the script opts a card into `.pre-reveal` at all) rather than just playing it 1ms faster. Playwright isn't a dependency; added a lightweight regression test instead (`tests/landing-feature-cards.test.js`) that parses the page's own inline `<style>`/`<script>` text rather than rendering it.
2. ✅ **Done** (superseded the "deliberately distinct from the app's theme" design decision above): adopted the app's actual palette — `--accent: #6247ea` with `#4f34d6`/`#3f28ab` hover/deep tones (`styles.css`'s `--color-accent-600`/`-700`), Inter instead of Manrope, and neutrals matching `--color-bg`/`-card`/`-text`/`-muted`/`-border` (including a dark-mode block now matching `src/theme.js`'s actual dark palette, not its own unrelated warm dark theme). `.btn-primary` reused the app's `.hero-card` gradient (`linear-gradient(135deg, accent, accent-700)`) and paired it with white text (`--accent-text: #ffffff`) — the old amber pairing used dark text, which doesn't carry over to indigo. The landing page kept its own inline stylesheet (not importing `styles.css`, which carries app-shell layout this page doesn't need) — token values were duplicated with a comment noting they must be kept in sync by hand.
3. ✅ **Done**: added `landing/og-image.png` (1200×630, a real committed file) for social sharing previews — the page had `og:title`/`og:description` but no `og:image`, so sharing the link produced a bare text card. Built by rendering an HTML template in a real browser at 1200×630 and capturing it (no new npm dependency, no third-party image service); used the app's indigo hero-card gradient and the existing `icons/icon-512.png` piggy-bank icon. Added `og:image`/`-width`/`-height`, `og:url`, `og:site_name`, `twitter:card` (`summary_large_image`) + `twitter:image`/`-title`/`-description`, and `<link rel="canonical">`. `og:image`/`og:url` were absolute (`https://dogexe.github.io/whereisit/landing/...`) since most scrapers ignore relative paths.
4. **Skipped, not a bug**: the review's fourth item claimed the app never updates `<html lang>` on a language switch. Checked before building anything — `screens/router.js`'s `renderChrome()` already did `document.documentElement.lang = state.lang` on every render, wired to the language-switch handler in `settings.js`. Live-verified: switching to English in Settings did change `<html lang>` to `"en"`. No change made.
5. ✅ **Done** (Lucide's pin later superseded — see the "App correctness and offline" pass below): pinned the CDN dependencies. `index.html` loaded `@supabase/supabase-js@2` and `lucide@latest` — a breaking upstream release on either would change the live app with no change on this side and no version to roll back to. Resolved what those loose specifiers currently served (2.112.4 and 1.35.0 — this was a pin, not an upgrade) and pinned both to exact file paths with a sha384 Subresource Integrity hash + `crossorigin="anonymous"` (both CDNs already send `Access-Control-Allow-Origin: *`). Google Identity Services (`accounts.google.com/gsi/client`) was loaded unconditionally on every page load but was only used by the Google Sheets export flow — moved to on-demand loading in `src/sheets-export.js` (`loadGisScript()`, cached as a module-level promise so overlapping export clicks don't inject duplicate script tags, with a 15s timeout matching the file's existing `FETCH_TIMEOUT_MS` pattern). GIS has no versioned CDN URL, so it was excluded from the SRI pinning.

## App correctness and offline pass (post-landing-polish)

A phone-viewport review with seeded data found six real issues (five fixed, one already-handled). Six commits on `app-correctness-offline-pass`. `derived.js` had no test coverage before this pass; `tests/derived.test.js` and `tests/utils.test.js` are new.

1. ✅ **Done**: an unpaid bill silently disappeared instead of showing overdue. `nextBillDueDate` used to take only `day` and roll forward the moment it passed, so `daysUntilBillDue` could never go negative — miss rent on the 1st and by the 2nd the app said "due in 30 days" and dropped it off Home entirely, with no record it was ever missed. Now takes the whole bill (`day` + `lastPaidCycle`): while a cycle is unpaid the due date stays pinned to that cycle (so `daysUntil` goes negative), and only rolls forward once `lastPaidCycle` matches. Design choice, documented in `derived.js`: an overdue bill resets to a fresh countdown at the next cycle's start regardless of whether it was ever paid, rather than being held indefinitely across month boundaries. Overdue rows get a `.manage-row-overdue` CSS class (reuses `--color-expense-700`) on both Home and Settings' bill rows, plus `overdueByDay`/`overdueByDays` i18n strings.
2. ✅ **Done**: "+100% from last month" when there's no last month. `pctDeltaLabel` treated a falsy `prev` as "compare against zero," so a brand-new user's first month showed +100% on balance, income, and expense alike. Now takes an explicit `hasPriorData` flag (from a new `monthHasTransactions(key, type)`, not inferred from the totals) and returns `null` (no badge) whenever there's nothing meaningful to compare against — including a real prior period whose total happens to be exactly 0 (a genuine income-equals-expense tie), which is still a division by zero. Home renders `null` as no pill on the balance card and an em dash on the income/expense stat cards.
3. ✅ **Done**: the app mixed Buddhist and Gregorian years. Home's header and the Insights period picker already read Buddhist Era (native `toLocaleDateString` with the `th-TH` locale), but the Add screen's date field and Transactions' date group headers were hand-rolled and always Gregorian. Now follows the language toggle everywhere: Thai UI → Buddhist Era, English UI → Gregorian, via one shared `displayYear`/`gregorianYearFromDisplay` pair in `utils.js` that `dateLabel` (display), `parseDateText` (typed-input parsing), and `derived.js`'s `yearLabel` all go through — rather than fixing each call site with its own `+543`.
4. ✅ **Done**: content scrolled underneath the tab bar. `.screen` (the one container every screen renders into — there's no per-screen scroll container) had a flat `100px` bottom padding that never accounted for `env(safe-area-inset-bottom)`, so a notched/gesture-nav phone (especially the installed standalone PWA, which draws edge-to-edge under the safe area) could show the last row partly behind the tab bar. Added `viewport-fit=cover` to the meta viewport tag (required for `env()` to resolve to anything but 0), a `--tabbar-h` custom property, and `.screen`/`.toast` bottom offsets became `calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + Npx)` instead of a flat number.
5. ✅ **Done**: the offline promise was broken by CDN dependencies. `sw.js`'s `APP_SHELL` never precached `styles.css`/`main.js` (a real gap — the SW's fetch handler only caches a resource *after* it's been requested once, and the very first page load that registers a new SW isn't controlled by it yet), and the Google Fonts webfont + Lucide icon library were cross-origin, which the fetch handler deliberately never caches at all — installing the PWA and going offline before those ever loaded produced an unstyled app with empty-circle icons, reproduced by killing the dev server outright. Fixed by self-hosting both: verified against Google Fonts' own served subsets that **Inter has no Thai glyphs at all** (so Thai text, the app's primary language, was already falling back to system fonts online and offline alike — self-hosting Inter alone wouldn't have fixed anything), so `fonts/inter-latin.woff2` (Latin, variable 400–800, ~47KB) is paired with `fonts/notosansthai-thai.woff2` (Thai, ~26KB) as a second `--font-sans` family. Lucide (already pinned+SRI'd per item 5 above, but pinning doesn't help an unreachable CDN) was replaced entirely by `icons/sprite.svg`, a self-hosted `<symbol>` per icon this app actually uses, referenced via same-origin `<use href="./icons/sprite.svg#name">`; `utils.js`'s `icon()` emits this directly and `refreshIcons()` is now a documented no-op. `sw.js`'s `APP_SHELL` gained `styles.css`, `main.js`, `sprite.svg`, and both fonts, with `CACHE_NAME` bumped to `v3`. supabase-js deliberately stays CDN-only (sync can't work offline anyway). **Sharp edge hit and fixed**: `icons/sprite.svg` is a real XML document — a comment containing `--` (this codebase's usual em-dash style) silently truncates the file and stops every icon from rendering with zero console error; the sprite's own doc comment now warns about this explicitly, verified with a real XML parser, not by eye. (This exact bug recurred at least once more later — see the Bill reminders section's "Integration gap" note and always re-verify with an XML parser after editing this file.)
6. ✅ **Done**: Insights hid spending in categories with no budget set. `computeBudgets()` only iterates existing budget entries, so a category nobody set a limit for never appeared on the screen users read as "where my money went" (seeded data: 1,390 of 3,539 total spending, invisible). Added `unbudgetedSpend`/`unbudgetedSpendForYear` to `derived.js` and a card on Insights' Budgets tab (only rendered when nonzero) with a "+ Add budget" affordance that jumps straight to Settings' inline add-budget form (expands the Budgets group, sets `budgetEditId = "new"`) rather than just linking to Settings in general.

Every fix live-verified in a real browser, not just tested/built — including a genuine offline test (killed the local dev server entirely, reloaded, confirmed the app still renders fully styled with icons intact purely from the service worker cache).

## Bill reminders via Web Push (post-app-correctness-and-offline)

The app previously had no notification code at all — bills only surfaced when the user happened to open it. Done on `bill-reminders-web-push` (branched from `main`, independent of the app-correctness-and-offline branch), two commits, applied directly to the live Supabase project (not a staging copy — this repo doesn't have one).

**This is the project's first backend component and first checked-in migration.** Everything before this (the four original tables, `error_logs`) was created ad hoc against the live project and only documented, not scripted, here — `repo/supabase/migrations/` didn't exist before this.

- **Schema** (`supabase/migrations/20260828120000_bill_reminders_push.sql`): `push_subscriptions` (endpoint, p256dh, auth, user_id), RLS matching the existing four tables exactly (one `ALL` policy, `auth.uid() = user_id`). `bills.last_notified_cycle` mirrors `last_paid_cycle`'s shape (a `"YYYY-MM"` cycle key) so the reminder job sends at most once per bill per cycle — never nagging an overdue bill daily, self-resolving into a fresh reminder each new cycle the same way the client's own overdue logic (see the app-correctness pass above) does. `pg_cron` + `pg_net` enabled; a daily cron job (00:00 UTC = 07:00 Thailand time) invokes the edge function via `net.http_post`, authenticated with the project's anon key only to satisfy `verify_jwt`.
- **VAPID keys**: generated once locally (`npx web-push generate-vapid-keys`, no new npm dependency — it's a one-off CLI, not a runtime dependency), stored in Supabase Vault via `vault.create_secret()` as a one-off `execute_sql` call — **the actual key values were never put in any commit**. `get_vapid_keys()`, a `SECURITY DEFINER` SQL function in the migration file, reads them back out for the edge function; `EXECUTE` is revoked from `public`/`anon`/`authenticated` and granted only to `service_role`, so no ordinary client can ever reach the private key through it. The public key is hardcoded as a plain constant in `src/push.js` (same treatment as `SUPABASE_ANON_KEY`/`GOOGLE_SHEETS_CLIENT_ID` — it isn't a secret).
- **Edge Function** (`supabase/functions/send-bill-reminders/index.ts`, deployed): runs with the service-role key (legitimate here — a backend batch job over *all* users' bills, not one signed-in user's RLS-scoped request) and ports `src/derived.js`'s `nextBillDueDate`/`daysUntilBillDue`/`billDueCycle` **verbatim** — kept in sync by hand, the file's own doc comment says so explicitly. Deno's clock is UTC; `now` is shifted +7h before any date math so day boundaries land on Thailand wall-clock time. Sends via `npm:web-push` to every subscribed device for a bill's owner when `daysUntil <= 1` and `last_notified_cycle` doesn't already match the current cycle; prunes subscriptions that come back 404/410 (permanently invalid); only advances `last_notified_cycle` when a send was actually attempted. Notification text is Thai-only — there's no stored per-user language preference to pick from server-side.
- **Client** (`src/push.js`, a new leaf module; `screens/settings.js` gained a toggle-row; `main.js` gained deep-link handling; `sw.js` gained `push`/`notificationclick` handlers, `CACHE_NAME` bumped to `v3`): `enableBillReminders()`/`disableBillReminders()` are only ever called from a real click handler, never on page load. Requires both push support (feature-detected via `serviceWorker`/`PushManager`/`Notification` presence — this also satisfies iOS's 16.4+-and-installed-to-home-screen requirement with no UA/version sniffing) and a signed-in user. `pushReminderState()` distinguishes `"unsupported"`/`"denied"`/`"off"`/`"enabled"` via a small `localStorage` flag rather than an async `getSubscription()` call on every Settings render. A tapped notification focuses an already-open tab or opens one, navigating to `"./?bill=<id>"`; `main.js` reads that param and deep-links straight into that bill's edit form.

**Live-verified against the real project**: manually invoked the deployed edge function directly — it correctly found the account's real overdue/due-soon bills and correctly sent 0 notifications with 0 side effects since `push_subscriptions` was still empty. `get_vapid_keys()` confirmed returning both keys correctly via direct SQL. Client-side: the toggle renders correctly across every state in both languages, and clicking it while signed out shows the sign-in-required toast without ever prompting for notification permission.

**Left to the repo owner**: the full sign-in → grant permission → receive a real push notification path needs a real Google account and a real OS-level permission grant.

**Integration gap — found, then fixed the same day.** This branch was built off `main` before the app-correctness-and-offline pass's PR (#5) merged, so it started out using that pass's *predecessor* icon system (the CDN-loaded `lucide.js`). Once PR #5 merged into `main`, this branch merged `main` back in (one conflict, in `sw.js` — both branches had independently bumped `CACHE_NAME` to `v3`) and picked up PR #5's self-hosted `icons/sprite.svg` lookup, which only contained the ~41 icon names in use *at the time PR #5 was written* — `"bell"` wasn't among them, so the toggle's icon started rendering nothing. Fixed by adding a `bell` `<symbol>` to `icons/sprite.svg`. Verified with a real XML parser before trusting it, and live-verified the icon renders correctly in Settings.

## Mobile UI polish pass (post-bill-reminders)

Triggered by watching an external mobile-UI-design tutorial and auditing this app against it (bottom-nav conventions, card nesting, mobile type scale, bottom sheets, empty states, touch targets), rather than from a pre-existing roadmap item. Most of the audit came back clean (no double-nested cards, tab bar buttons already ≥44px, distinct "no transactions yet" copy already existed from the earlier onboarding pass) — three real, small gaps got fixed directly on `main` (no branch/PR for this one, changes were small enough to verify and ship in one pass):

1. ✅ **Done**: transaction amount was under-sized relative to its own row. `.tx-row-wrap .amt` (`styles.css`) was `14px`, smaller than its own row's category label at `15px` — bumped to `16px`. Swipe-to-reveal (`src/screens/tx-row.js`) still measures the amount's width live via `getBoundingClientRect()` on every render, so the larger glyph needed no other code change.
2. ✅ **Done**: the tab bar's "Add" button (the app's primary action) was visually identical to the other 4 tabs. `styles.css`'s `.tabbar button[data-tab="add"] .icon` now renders it as a raised circle (52px, `.hero-card`'s existing accent gradient, `--shadow-accent`) breaking out above the bar — CSS-only.
3. ✅ **Done**: the Transactions screen's "no search results" state was visually identical to every other (unrelated) empty state in the app. Added a `search` icon to `icons/sprite.svg`, a `clearFiltersBtn` i18n string, and a `.empty-note-search` variant (`src/screens/transactions.js`'s `renderTxListOnly`) with a "Clear filters" action that resets every active filter and does a full `renderTransactions()` re-render. Deliberately scoped to `transactions.js` only — `insights.js`'s Trend tab reuses the same `noResults` string for a materially different case with nothing to clear.

Two other gaps from the same audit (no bottom-sheet component anywhere in the app; no contextual top app-bar) were investigated and intentionally not built — flagged as possible future work, not small enough to bundle into this pass.

Live-verified in a real browser: the Add button breakout renders correctly in both light/dark and Thai/English; a genuine no-match search shows the new icon+button state distinctly from the zero-transactions state; "Clear filters" correctly resets the search input and re-shows the list; swipe-to-reveal on a wide amount (฿123,456.00) still reveals Edit/Delete without clipping, the exact bug class documented in `CLAUDE.md`'s "A caught-bugs note."

## UI/UX fundamentals pass (post-mobile-UI-polish)

A second video-prompted audit (a broader "every UI/UX concept" primer, same channel), checked against interactive states, semantic color, dark-mode shadow/border treatment, light-mode shadow discipline, large-heading typography, and icon-to-text sizing. Most came back already correct: semantic color tokens already exist and are used purposefully, dark mode already uses a lighter card color than the background instead of leaning on shadows, shadow tokens are already disciplined, and heading letter-spacing is already tightened app-wide. Three real, small gaps got fixed directly on `main`:

1. ✅ **Done**: buttons had no visible keyboard-focus state. `.btn` (`styles.css`) had `:active`/`:disabled`/per-variant `:hover` but no `:focus-visible`, unlike `.input`/`.input-wrap` which already had one — added `.btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`.
2. ✅ **Done**: invalid amount submission on the Add screen had no visual feedback on the field itself, only a toast. Added `.input-wrap.has-error { border-color: var(--color-expense); }` plus wiring in `src/screens/add.js` to add/clear that class and `aria-invalid`. **A live-browser test caught a real pre-existing bug while verifying this**: the amount `<input>` had `required`/`min="0"` HTML attributes that triggered the browser's own native constraint-validation tooltip *before* the form's `submit` event ever fired — meaning neither the new error state nor the already-existing `toastInvalidAmount` toast had ever actually fired for the most common case (a genuinely empty field), silently, since before this pass. Fixed by removing `required`/`min="0"` from the input so the app's own JS validation is what actually runs; `step="0.01"` was left in place.
3. ✅ **Done**: `.hero-card .amount` (the home screen's large balance number) already had tightened letter-spacing but no `line-height` override, inheriting body's loose `1.45`. Added `line-height: 1.15` — safe because the content is numeral-only, unlike a Thai-bearing heading. Deliberately did **not** apply the same tightening to `.screen-title` or the global `h1,h2,h3,h4` rule for that reason.

## User-controlled categories (post-UI/UX-fundamentals)

Full spec at `repo/docs/specs/custom-categories.md` — scoped via `/spec` first, since this wasn't in any prior roadmap. Full user CRUD over income/expense categories (including today's built-ins, not just custom additions), synced across devices. Staged into 5 steps because categories today are plain hardcoded strings with no id anywhere — `transactions`/`budgets`/`bills` all store the category name directly — and making renames propagate everywhere (a confirmed requirement) needed a real id-based schema migration across three existing tables, not just new UI.

**Stage 1 — done**: new `public.categories` Supabase table + RLS (`supabase/migrations/20260829060000_categories.sql`), additive only. See the spec doc's Status section for the one deliberate deviation (`wipeLocalAccountData()` re-seeds categories instead of emptying them, since they're closer to app vocabulary than personal account data).

**Stage 2 — done**: `category_id` added to `transactions`/`budgets`/`bills` (`supabase/migrations/20260829070000_category_id_columns.sql`), a one-time client-side backfill (`sync.js`'s `backfillCategoryIds()`), and `derived.js`'s budget/breakdown functions now match by `categoryId` with a name+type fallback for anything not yet backfilled — see the spec doc for the full detail, including a real behavior change this unlocked (budgets now correctly honor cross-device deletes) and new test coverage for `computeBudgets`/`checkBudgetAlert`/`computeBreakdown`.

**Stage 3 — done**: Settings gained a full Categories management section (`src/screens/settings.js`) — add/edit/delete over all 16 built-ins plus custom ones, following the exact `wireInlineCrud`/`manageRowHtml`/`inlineForm` pattern already used for Budgets/Bills/Goals, a new icon picker (`CATEGORY_ICON_CHOICES` in `categories.js`), and this app's first pre-delete "in use" guard. Also folded in: Budgets'/Bills' own category pickers in Settings now read from `state.categories` instead of a hardcoded list.

**Stage 4 — done**: the Add screen (`src/screens/add.js`) now tracks `state.formCategoryId` and writes `categoryId` directly at creation. `guessCategory`/`CATEGORY_KEYWORDS` (`categories.js`) now return/key by category id, resolved once against the fixed `DEFAULT_CATEGORIES` list at module load — verified live that a keyword match survives a rename.

**Stage 5 — done. This closed out the whole feature.** `tx-row.js` now resolves both category name and icon through the live category record. `transactions.js`'s category filter/search now match via `categoryId`/`categoryDisplayName`. A third write path was found and fixed while auditing: `home.js`'s `markBillPaid` was still only copying a bill's `.category` name across, never `.categoryId` — fixed, so every transaction-creation path writes a proper id at creation time.

## Tab bar polish pass (post-custom-categories)

Triggered by watching a bottom-mobile-navigation-bar design video and auditing the app's tab bar against its ~18 tips directly. Four small, real gaps got fixed directly on `main`:

1. ✅ **Done**: active tab had only one visual change (color). Added `.tabbar button.active span { font-weight: 700; }` as a second, cheap signal.
2. ✅ **Done**: the 4 non-Add tab icons rendered at 18px. Added `.tabbar button:not([data-tab="add"]) .icon { width: 22px; height: 22px; }`.
3. ✅ **Done**: zero micro-interactions — `.tabbar button` had no `transition`, no tap feedback, and no animated screen transition. Fixed with a `transition: color` on `.tabbar button`, `.tabbar button:active .icon { transform: scale(0.88); }` for tap feedback, and a `screen-fade-in` keyframe applied via a `.screen-enter` class, **deliberately triggered only from `setTab()`** (not from `renderScreen()` itself, since that's also called from sync pulls/local saves and animating on every one of those would read as a glitch). Deliberately did not build a sliding-underline active-tab indicator.
4. ✅ **Done**: light-mode inactive-tab contrast was a real, confirmed shortfall (a WCAG relative-luminance calculation put `--color-tertiary` on `--color-bg` at 2.70:1, under the 3:1 minimum). Added a dedicated `--color-tabbar-inactive` token (`#7d808c` for light, 3.65:1) rather than changing the shared `--color-tertiary` token used in 11+ other spots.

Live-verified: computed styles confirmed active/inactive colors, font weights, icon size, and the transition property all match; the fade correctly does **not** fire on a dark-mode toggle (a non-tab-switch re-render), proving the scoping holds.

## Desktop sidebar shell (post-tab-bar-polish)

Added a persistent left sidebar nav (logo/title header + 5 nav rows) that replaces the bottom tab bar at wide viewports (`>=1024px`), leaving everything below that breakpoint untouched. Done directly on `main`.

- `index.html` gained a `<nav id="sidebar">` with the same 5 `data-tab` buttons as `#tabbar`, plus a small header. Both share a `.nav-btn` class specifically so `router.js`/`main.js` can wire clicks/active-state/labels once, generically.
- `screens/router.js`'s `renderChrome()` was generalized from querying `#tabbar button`/`#tabbar span[data-l]` to `.nav-btn`/`.nav-btn span[data-l]` (plus `#sidebar [data-l]` for the header's title span). `main.js`'s click-wiring was generalized the same way.
- `styles.css`: a new `min-width: 1024px` breakpoint hides `.tabbar-wrap`, shows `.sidebar`, and flips `.app` to `flex-direction: row`. The sidebar is `position: sticky; top: 0; height: 100vh` — **`height:100vh` was a later fix, not the original approach**: the sidebar initially relied on flex's `align-items: stretch` to match `.screen`'s content height, which broke the sidebar-footer polish pass below (whose account-status row uses `margin-top: auto`, so on a tall page "the bottom" could be far below the fold). `height: 100vh` makes the sidebar a fixed viewport-height column instead.
- Deliberately did **not** give the sidebar's own Add button the tab bar's breakout-circle treatment.

Live-verified in a real browser: below 1024px, `#sidebar` stays `display:none` and `.tabbar-wrap` stays `display:flex` with `.tabbar` itself pixel-unchanged. At 1024px+: sidebar renders correctly in light/dark, clicking each item navigates and moves the active-state highlight. `npm run build && npm test` (80/80) both pass.

## Desktop screen layouts (post-sidebar-shell)

The sidebar shell above only widened the *stage* each screen renders into; this pass reworked what each screen actually puts in that wider stage at `1024px+`, so it reads as a real desktop layout rather than the mobile layout stretched wider. Done directly on `main`, one screen at a time.

- **Transactions**: rows render as a dense table — Date/Category/Amount/Actions as fixed-width grid columns — instead of the mobile swipe-to-reveal card, with a static header row. `.tx-row-inner` and `.tx-trail-group` are `display: contents` at desktop, unwrapping them so their children become direct grid items alongside a new `.tx-date-cell`, matching the header's `grid-template-columns` with zero DOM/JS changes. Scoped to `.tx-list-card` only — Home's recent-activity list, which reuses the same row markup, stayed completely untouched.
- **Insights**: the tab-switch and period-picker become one compact row (`.insights-toolbar`) at Insights' existing `880px` breakpoint. `.insight-cards` goes from 2 to 3 columns; the breakdown pie chart is enlarged from 140px to 180px via a CSS override on its wrapper.
- **Settings**: switches to a list-left/detail-right pattern at `1024px+` — a new `.settings-nav` controls which `.settings-group` shows via `state.settingsActiveSection`. Mobile keeps the exact same stacked-page markup. **A real bug hit and fixed**: forcing a closed `<details>`'s body to `display: block !important` silently does nothing — a `<details>` without its `open` attribute doesn't render non-summary content at all, as part of the element's own spec, regardless of any CSS override (`getComputedStyle` even reports `display: block` on the non-rendering child, which makes this easy to misdiagnose). The actual fix: the nav-click handler sets the relevant `<details>` element's real `.open` *property* directly.
- **Add**: deliberately untouched and deliberately not added to `screen-wide` — confirmed live that this alone kept it a comfortable ~640px centered form beside the sidebar.
- **Home**: untouched — it already had a working `.home-columns` grid from a pre-existing `screen-wide` treatment.

Every screen was checked at 375px/768px against pre-pass screenshots (computed-style diffs, not eyeballing) to confirm mobile stayed pixel-identical, and at 1024px/1400px for the new desktop behavior. `npm test` (80/80) was run after each screen's change individually.

## Sidebar/desktop polish pass (post-desktop-screen-layouts)

A follow-up polish round plus a full regression sweep across breakpoints and themes. Done directly on `main`.

- **Sidebar footer**: `#sidebar` gained a compact account-status row (`.sidebar-footer`, pinned via `margin-top: auto`) showing the signed-in user's name, mirroring Settings' own profile row via a shared pure function, `accountDisplayName(currentUser, notSignedInLabel)` in `account.js`.
- **Top bar**: considered and deliberately **not built** — every screen already renders its own `<h2 class="screen-title">`; a persistent top bar would just duplicate it.
- **Dark-mode audit**: every rule added across the sidebar-shell and desktop-screen-layouts passes was checked for hardcoded colors — none found, all `var(--color-*)`.
- **A real bug hit while building the footer**: the sidebar's original stretch-to-content height meant `.sidebar-footer`'s `margin-top: auto` pinned it to the bottom of a box that could be far taller than the viewport on a long page — the footer was technically present, just scrolled off screen below the fold, which made it look simply missing in a screenshot taken at the top of the page. Fixed at the root (`height: 100vh` on `.sidebar`).
- **Full regression sweep**: 375px/768px/1024px/1440px × light/dark × all 5 screens, automated overflow/active-tab checks plus live visual verification. `npm test` (80/80) passed both mid-pass and at the end.
- **A test-harness pitfall worth recording, not an app bug**: the regression sweep's first pass toggled dark mode via a dynamic `import('./src/state.js')` against the *built* `dist/` bundle, which has no `src/` folder (esbuild inlines everything) — every import silently failed and no-oped, invisible at first because the test tabs happened to already be in dark mode from earlier manual testing. Fixed by driving theme changes through the real `#darkSwitch` UI control instead of reaching into module internals.

## Insights period-picker redesign (post-sidebar-desktop-polish)

Full spec at `repo/docs/specs/insights-period-picker-redesign.md` — reached through six rounds of an interactive, clickable HTML preview, including two reversals, since the right shape only became clear once real trade-offs were seen working live. Replaces Insights' old plain two-`<select>` period picker (shared by Budgets and Breakdown/"Categories") with one shared pill component, scoped to Insights only at the time.

- **Budgets and Breakdown share one identical pill** (`‹ 📅 August 2026 ›`) — arrows step month-by-month, tapping the center opens a popover with a year stepper + a 4×3 month grid, and tapping the year heading switches to a whole-year view instead of a separate "year" mode. One function, `pillPickerHtml`/`wirePillPicker` in `period-picker.js`.
- **Breakdown converged on this shape only after two rejected intermediate designs, worth remembering**: first, the resolved value was folded directly into a Today/Month/Year tab row to remove duplication — the user tried it live and asked for a real pill back, since the merged version read as *missing* something rather than cleaner. Second, the pill came back but *alongside* the tab row plus a paginated 12-year grid — the user's next reaction made clear the ask had always been full parity with Budgets' single-control shape, not tabs-plus-pill. **Lesson**: removing duplication and removing the thing the user actually wanted are not always the same fix; validate live at each step rather than assuming the previous round's theoretical problem is now fully solved.
- **Breakdown's one genuine difference from Budgets is a "Today" shortcut** — a dashed-border button inside the popover. A hidden-gesture alternative (double-click/long-press) was prototyped and **failed even in the mockup**: a single tap already opens the popover, so the second click of a double-click lands on a since-replaced DOM element, and making that reliable would add real latency to the common single-tap case.
- **Custom date filtering moved out of the top-level period modes entirely**, into Breakdown's existing Filters sheet, with an explicit single-day/date-range toggle. While a custom date is active, the pill renders nothing at all — two independent controls can't both claim to represent the current period without one lying.
- Three new icons added to `icons/sprite.svg` (`calendar`, `chevron-left`, `filter`), re-verified with a real XML parser after each edit per this repo's standing warning about that file breaking silently.
- The desktop `.insights-toolbar` compact-row treatment from the desktop-screen-layouts pass doesn't carry over — both tabs now just stack at every width, live-verified to cause no overflow at 1536px.

Live-verified end to end: pill open/close on both tabs, month-grid selection, year-heading whole-year toggle, Breakdown's "Today" shortcut, the Filters sheet's single-day/range toggle, light/dark at mobile and desktop widths via the real Settings toggle. Zero console errors.

## App rename and Home polish (post-insights-period-picker-redesign)

Four small, unrelated fixes bundled into one request, done directly on `main`, each verified live before moving to the next.

- **App renamed from "รายรับ-รายจ่าย" / "Income & Expenses" to "whereisit"** (lowercase, literal, both `i18n.js` entries are now the same string). Updated `index.html`'s `<title>`, `manifest.json`'s `name`/`short_name`, `privacy.html`.
- **Home's budget preview now lists every budgeted category**, not just the first two — `screens/home.js`'s hardcoded `.slice(0, 2)` cap removed.
- **Home tab's icon changed from a 2×2 grid glyph to a literal house** — a real `#home` symbol already existed in the sprite and was simply never wired up.

Live-verified: sidebar and mobile tab bar both show "whereisit"/the house icon, a fresh install (`localStorage.clear()`) renders correctly with no prior state, dark mode checked at desktop width for the Home budget list specifically.

## Transactions period-picker unification (post-app-rename-and-home-polish)

Full spec at `repo/docs/specs/transactions-period-picker-unification.md`. Prompted by the user asking directly whether Insights' custom-date filter was still necessary and whether the two screens' filter systems could be unified — answered "yes, custom date is still necessary" (Insights' pill can't reach an arbitrary single past day or a range crossing month boundaries) and "yes, unify."

- **Transactions' Filters-sheet Date field now uses the same `pillPickerHtml`/`wirePillPicker` component** Insights already uses, replacing the old select-based `periodPickerHtml`/`wirePeriodPicker` (left in place, genuinely unused, confirmed via `git grep`).
- **The pill component was generalized from a single `opts.todayShortcut` boolean to `opts.shortcuts: [{ key, label }]`**, since Transactions needs two shortcuts ("All", "Today") where Insights' Breakdown only ever needed one.
- **Custom date moved into its own Filters-sheet section**, styled identically to and reusing every i18n string from Insights' equivalent section.
- **A real bug found and fixed during live verification, not anticipated in the spec**: the popover overflowed past the Filters sheet's left edge the first time it was opened, because Transactions' Date field wrapped the pill in a plain `.filter-row` with no full-width stretch rule (unlike Insights' `.toolbar-row .picker-anchor { flex: 1 }`). Fixed with the equivalent rule scoped to `.filter-row`.
- **`wirePillPicker` also gained a scroll-into-view fix that benefits every caller unconditionally**: after wiring, if the popover is open, `popoverEl.scrollIntoView({ block: "nearest" })` — addresses a popover opened near the bottom of a scrolled Filters sheet otherwise rendering below the fold.

Live-verified: pill open/close, both shortcuts, stepping the pill's arrows correctly clearing an active shortcut, the year-heading whole-year toggle, both custom-date sub-modes, removing the "period" chip resetting fully, Insights' Budgets/Breakdown tabs confirmed pixel-identical to before this change. Zero console errors. `npm run build && npm test` (80/80) passed after every file change.

## Add transaction as a mobile bottom sheet (post-transactions-period-picker-unification)

Full spec at `repo/docs/specs/add-transaction-bottom-sheet.md`. Prompted directly: "add button on mobile should pop from the bottom like filter does."

- **Below 1024px, Add/Edit is a bottom-sheet overlay, not a tab.** Tapping the tab bar's "Add" button (or "Edit" on a swiped-open transaction row) opens the sheet on top of whatever screen is already showing; `state.tab` never changes, so the tab bar's active highlight correctly stays on Home/Transactions/etc.
- **Desktop (≥1024px, sidebar shown) is completely untouched** — Add/Edit still navigates `state.tab` to `"add"` and renders the same full-page form. Both the sidebar-vs-tab-bar click target and `editTx()`'s call site branch on a new `isDesktopShell()` helper (`utils.js`, `matchMedia("(min-width: 1024px)")`) rather than guessing the breakpoint independently in two places.
- **`add.js` was refactored, not duplicated**: the form's HTML moved into `addFormFieldsHtml(l, isEditing)` and its wiring into `wireAddForm({ onSaved, onCancelled })`, called by both the existing `renderAdd()` (desktop) and the new `renderAddSheet()` (mobile). The sheet's own markup lives in a new `#addSheetContainer`, a sibling of `#toast` outside `#screen` entirely, since Add must be openable from every screen without any of them owning its lifecycle.
- **New state**: `state.addSheetOpen` (UI-only, not persisted). `hasLiveInputRisk()` (`sync.js`) gained a second trip condition for it, since the sheet doesn't touch `state.tab` and the generic "focused input inside `#screen`" fallback doesn't catch it either (the sheet's inputs live in `#addSheetContainer`, not `#screen`).

Live-verified: tapping Add opens the sheet with Home's tab still highlighted; saving closes the sheet and Home's balance/recent-list update immediately in place; editing a row opens the same sheet pre-filled; backdrop tap and Escape both dismiss and discard; desktop confirmed untouched. Zero console errors. `npm run build && npm test` (80/80) passed after every file change.

## Microinteraction audit pass (post-add-bottom-sheet)

Triggered by the second half of the same request that produced the Add bottom sheet above ("add some more microinteraction across all pages"), done separately afterward as a live audit against a checklist, same shape as the Tab bar polish and UI/UX fundamentals passes. Five real gaps found, all fixed directly on `main`.

- **A real bug, not a microinteraction, found while auditing**: Home's own "+เพิ่ม" quick-add button and its empty-state "+ Add" button still called `resetForm(); setTab("add");` directly — never updated when the Add bottom sheet shipped, so on mobile they still navigated to the old full-page screen. Fixed with a shared `goAdd()` helper.
- ✅ Segmented toggle controls (`.tab-opt`, `.category-chip`, `.kind-toggle button`) now ease instead of snapping — one `transition` rule added to each, matching everything else stateful in the app.
- ✅ Bottom sheets' dark backdrop (`.filter-sheet-backdrop`, shared by Transactions Filters, Insights Filters, and the Add sheet) now fades in via a `backdrop-fade-in` keyframe (an `animation:`, not a `transition:`, since only `animation` reliably plays the moment an element goes from `display:none` to rendered).
- ✅ Toasts now fade+slide in via a `toast-fade-in` keyframe — care was needed to keep the existing `translateX(-50%)` horizontal-centering transform present in every keyframe step.
- ✅ Settings' collapsible section headers (`<summary>` rows) now show hover/tap feedback, matching the existing `.picker-year-heading:hover`/`.sidebar .nav-btn:hover` pattern.

Live-verified: Home's both Add shortcuts now open the sheet correctly; `getComputedStyle`/CSSOM checks confirmed all four CSS-only fixes are actually applied. Zero console errors. `npm run build && npm test` (80/80) passed after every file change.

## Timezone ("today" reads as UTC, not local) bug fix (post-microinteraction-audit)

Every "today"/"this month" computation in the app read `new Date().toISOString().slice(...)`, which converts to UTC before slicing — for any user east of UTC (e.g. Bangkok, UTC+7), this made the app think it was still yesterday/last month for several hours after local midnight. Invisible in CI, since CI runs in UTC where local time and UTC time are the same thing. Fixed directly on `main`.

- **Two canonical helpers added to `utils.js`**: `localIsoFromDate(date)` and the wrappers `localDateIso()`/`localMonthKey()`. `derived.js`'s pre-existing `monthKeyOf(date)` (already correct) moved into `utils.js` alongside them and is re-exported from `derived.js`. Every buggy call site across `derived.js`, `screens/add.js`, `screens/home.js`, `screens/transactions.js`, `screens/insights.js`, `screens/period-picker.js`, and `sheets-export.js` now goes through one of these instead.
- **`state.js` deliberately does NOT import these helpers** — `utils.js` itself imports `state` from `state.js`, so the reverse would be a genuine circular import. Fixed instead with a small self-contained local-date computation directly in `state.js`, a deliberate narrow exception since these only seed initial default field values.
- **Regression tests** use `node:test`'s mock timers *plus* a runtime `process.env.TZ = "Asia/Bangkok"` override — pinning the mocked instant alone isn't enough, since Date's local getters resolve against whatever timezone the test runner's process is actually in (UTC in CI).
- **Live-verified in a real browser** against the built `dist/`, unusually able to do this precisely since this sandbox's own OS timezone is already `Asia/Bangkok`: patched `window.Date`'s `now` to pin the instant to a moment that's already the next day in Bangkok while UTC still reads the prior day, and confirmed the Add screen's date field, Home's header month rollover, and the bill due-countdown all correctly used the local date, not the UTC one.

## Categories upsert onConflict investigation (post-timezone-fix)

A bug report claimed category edits weren't syncing, with a specific proposed root cause: `categories` is the one synced table with a composite primary key (`id, user_id`), but `pushRows()` in `sync.js` called `sb.from(table).upsert(chunk)` identically for all five tables with no `onConflict` specified, theorized to make the upsert's conflict target ambiguous for the update case specifically.

**This root cause did not reproduce, on thorough live testing against the real Supabase project (not assumption) — worth recording in detail since the fix that shipped is not the fix that was originally asked for having "solved" anything measurable:**

- Raw HTTP test against the live project (via a throwaway auth user created directly in `auth.users`, deleted after): inserted a category row, then re-`upsert`ed it with a changed name using the exact request shape `pushRows` sends — returned `200` and the DB row's name genuinely changed.
- Cross-account collision test — seeded the same built-in category id under two different throwaway accounts, edited one account's copy, confirmed via SQL that only that account's row changed.
- Real app UI test via a throwaway test user's session injected directly into `localStorage`: edited a category through the actual Settings → Categories UI, confirmed via Network tab and a direct SQL check that the edit persisted correctly.
- Simulated second device: cleared just the `categories` watermark and confirmed the real pull/`mergeRowsById` code path correctly picked up the newer server-side name.

All four passed with the *original*, `onConflict`-less code. Root cause: PostgREST already defaults an upsert's conflict target to a table's full primary key whenever every PK column is present in the payload — this is documented PostgREST behavior, not implementation-specific luck. Whatever produced the original report, it wasn't this.

**Shipped anyway, at the user's explicit call, as a defensive/explicitness change** — `pushRows()` now passes `{ onConflict: "id,user_id" }` only when `table === "categories"`. Not a confirmed bug fix; relying on an implicit PK-inferred default is one schema-cache-reload gap away from silently reverting, so naming the real conflict target explicitly is free insurance. Full reasoning and the verification steps are recorded as an inline comment on `pushRows()` itself in `src/sync.js`.

**Correction (found during the multi-account-support pass, via direct `pg_constraint` introspection)**: `transactions`/`budgets`/`bills`/`goals`/`categories`/`accounts`/`push_subscriptions` all **do** have a real foreign key to `auth.users(id)`, every one `ON DELETE CASCADE` — only `error_logs` is the deliberate exception. So deleting a throwaway `auth.users` test row genuinely does cascade-delete everything it touched automatically; a manual per-table delete is unnecessary (harmless, just extra steps). Also worth noting: this sandbox's Chrome profile persists `localStorage` across sessions, so a freshly-created throwaway account can inherit whatever local sample/dev data was already sitting in that browser tab profile and have it genuinely pushed to that throwaway account — not a bug in the app, just a hazard of reusing a long-lived browser profile for account-isolation testing.

## Small Settings/Home fixes (post-categories-upsert-investigation)

Three unrelated, small UI requests bundled into one pass, done directly on `main`.

- **`markPaidBtn`'s Thai string shortened** from "ทำเครื่องหมายว่าจ่ายแล้ว" to "จ่ายเลย".
- **Settings' sign-out button is icon-only when signed in** — renders as a `.btn.btn-icon` circle with a new `log-out` glyph and `aria-label`, matching the icon-only pattern used for row-level Edit/Delete elsewhere. Signed-out still gets the original text button.
- **Settings' three export options (CSV/JSON/Google Sheets) collapsed into one "Export" row that opens a bottom sheet**, reusing Transactions' filter-sheet structure exactly. New `state.exportSheetOpen` and an `exportBtn` i18n string.

Live-verified against `dist/` (desktop sidebar width, signed-out): shortened Thai string, unchanged sign-out text button while signed out, new Export row opens the sheet correctly with all three options working, zero console errors. **The icon-only signed-in button couldn't be exercised through a real Google sign-in in this sandbox** — verified narrowly by patching that one button's outerHTML client-side to the exact markup `renderSettings()` produces on that branch. `npm run build && npm test` (90/90) and `npm run test:e2e` (9/9) both passed — the e2e suite's existence was only found by grepping the repo directly after being told it exists, having been missed entirely on a first pass through this doc; see `CLAUDE.md`'s corrected "Running locally" section.

## Multi-account support (post-small-settings-home-fixes)

Full spec at `repo/docs/specs/multi-account-support.md`. Every transaction now belongs to exactly one account (cash, bank, credit card, etc.), each account shows its own running balance, and Home gained an account switcher. Reached through an interview that surfaced the real driver — **reconciling each account's balance against a real bank/card statement** — which is why accounts carry an opening balance, a requirement not in the original request. All 6 staged builds shipped and were live-verified; see the spec doc for full per-stage detail. Highlights:

- **New `accounts` table** (`supabase/migrations/20260830080000_accounts.sql`): plain single-column `id` primary key, **not** composite like `categories` — categories need that only because their built-ins intentionally share one fixed id across every user, which doesn't apply here (confirmed by direct introspection of the live schema before building).
- **`account_id` added to `transactions`**, backfilled once client-side against a default "Cash" account (fixed id `acc0`, not `uid()`-generated, so two independent devices backfilling before ever syncing land on the same account).
- **New `src/accounts.js` leaf module** — deliberately plural, since `account.js` was already taken by the unrelated signed-in-identity module. A same-name collision was caught by a Plan agent's cross-check before implementation started.
- **`wipeLocalAccountData()` re-seeds a default account on sign-out/account-switch**, rather than wiping to empty — zero accounts breaks a real invariant (the Add screen can't save a transaction without one), confirmed with the user before shipping.
- **`derived.js` gained `computeBalance(accountId)`** and `defaultAccountId()`, both pure and unit-tested.
- **Settings gained an "Accounts" management section** — **archive/unarchive instead of delete**, per the original request. Archiving is blocked if it would leave zero active accounts.
- **Add screen gained an account picker** (`state.formAccountId`), excluding archived accounts as a target for *new* transactions, except the one already selected.
- **Home gained an account switcher** — hero balance, income/expense stat cards, spent-today, sparkline, and recent-activity all scope to the selection; **the budgets-preview and upcoming-bills panels deliberately do not**, a decision reconciling a real tension between two separate interview answers (documented in the spec doc).
- **Transactions' Filters sheet gained an account checkbox section** — unlike categories, it deliberately includes archived accounts, so a closed account's history stays findable.
- Explicitly out of scope: transfers between the user's own accounts, per-account budgets/bills/goals, Insights account awareness, multi-currency, real bank/statement import.

Live-verified end to end against real seeded data in a real browser: account CRUD and the archive-blocking guard, a real Supabase round-trip via a throwaway test account, transaction creation/editing including the archived-account edge case, Home's switcher matching hand-verified arithmetic. `npm run build && npm test` (99/99) and `npm run test:e2e` (9/9) both pass.

**Follow-up requested right after shipping**: the Add/Edit form's account field was still a bare `<select>` while the category field beside it already had an icon-led chip row. `screens/add.js` gained `renderAccountChips()`, mirroring that pattern (every account gets its own chip directly, no ranked top-N/"more" overflow since account lists are always small), reusing Home's existing `.account-chip` classes. Live-verified in both light and dark mode. `npm test` (99/99) and `npm run test:e2e` (9/9) both pass.

## Transfers between accounts (post-multi-account-support)

Full spec at `repo/docs/specs/account-transfers.md` — a direct follow-up to multi-account-support, which explicitly deferred this. Interviewed to find the real goal: **pure balance correctness**, not transfer analytics.

- **One record, not two linked transactions**: `type: "transfer"`, reusing `account_id` as the source ("from") account, plus a new `to_account_id` column. Viewing the source account shows an outflow, the destination an inflow, "All accounts" hides it entirely.
- **Schema**: `supabase/migrations/20260830100000_account_transfers.sql` widened the `transactions_type_check` CHECK constraint (confirmed by direct introspection first) and added a nullable `to_account_id`. **A real, previously-undocumented `NOT NULL` constraint on `transactions.category` was found only by testing the actual push against the live project** — `sync.js`'s `txToRow` now defaults it to `""` for a transfer.
- **Two real correctness bugs in existing `derived.js` code, found and fixed as part of this spec**: `computeBalance()`'s combined branch used to treat *anything not literally "income"* as a subtraction, which would have silently subtracted a transfer's amount instead of netting it to zero; its per-account branch filtered only by `.accountId`, which a transfer never matches on its destination side. `filteredTxList()`'s account-filter clause had the identical blind spot. **General lesson, hit twice more in this same spec**: a two-way ternary that defaults to "not X" is a latent bug the moment a third case is introduced.
- **Third tab on the Add form** (Expense/Income/Transfer), swapping the category field for a From/To account-chip pair when selected. Validates `from !== to`; never calls `checkBudgetAlert`.
- **Display**: `tx-row.js` renders a transfer with an `arrow-right-left` icon and a neutral "Cash → Bank" label everywhere by default — Home is the one exception, passing an optional `viewingAccountId` so a transfer shows signed relative to whichever account Home is currently viewing.
- **A third instance of the same "two-way ternary defaults wrong on a third type" bug** was found live while verifying the Transactions filter: `renderActiveFilterChips()`'s type-chip label would have mislabeled a Transfer filter's chip as "Expense." Fixed with an explicit three-way `typeFilterLabel()` helper.

Live-verified end to end: two real transfers created through the actual Add form, hand-verified combined/per-account balances, correct hide/show/sign behavior across Home's switcher and the Transactions list, the same-account validation guard, editing a transfer, and the Transfer filter option — plus a real Supabase round-trip via a throwaway test account, fully cleaned up afterward. `npm run build && npm test` (103/103) and `npm run test:e2e` (9/9) both pass.

## Small transfers/picker fixes (post-account-transfers)

Three small, unrelated fixes, done directly on `main`.

1. ✅ The Add form's Transfer tab let the same account be picked as both From and To (previously only caught at submit time). `renderAccountChipPicker` gained an `excludeId` param plus a `refresh` callback so picking one side immediately updates the other side's disabled state.
2. ✅ The month/year picker popover got cropped on Insights' Categories tab on narrow screens — `.picker-popover` centers on its own `.picker-anchor` parent, which is only correct when the anchor spans the full row (true for Budgets' standalone pill, not for Breakdown's/Transactions' pills that share a row with a Filters button). Fixed with `clampPopoverToViewport()`, measuring the popover's actual rendered position after opening and nudging it back on-screen with a plain `margin-left` offset.
3. ✅ Transactions' "Filters" button was missing the filter icon Insights' equivalent already had.

**Reusable testing technique recorded here**: the browser automation `resize_window` tool has repeatedly proven unreliable in this environment (reports success but `window.innerWidth` doesn't actually change). Workaround that does work reliably: a tiny local HTML file with a fixed-width `<iframe src="http://127.0.0.1:8792/">` gets a genuinely independent viewport for `vw` units and `window.innerWidth`, regardless of the outer browser window's actual size — copy it into the served `dist/` folder after each `npm run build`.

Two further small, unrelated fixes landed directly on `main` shortly after: the browser's default `-webkit-tap-highlight-color` blue tap flash on mobile Chrome/Android was disabled app-wide; and this whole trio plus the tap-highlight fix were pushed to `main` together, confirmed live on the deployed GitHub Pages site (not just `dist/` locally).

## CSV import (post-small-transfers-picker-fixes)

Full spec at `repo/docs/specs/csv-import.md`. A plain-CSV counterpart to the existing CSV/JSON/Google Sheets export. Reached through an interview covering type detection (signed Amount column), dedupe scope (per-account), bad-row handling (skip + count), date format (explicit picker, not auto-detected), and header-row handling (always assumed). OFX/QIF, a Debit/Credit-column mode, auto-creating categories, and importing transfers are all explicitly out of scope.

- **New pure module `src/import.js`** (`parseCsv`, `parseAmountValue`, `parseDateWithFormat`, `buildImportPlan`) — no imports from `state.js`/`sync.js`/`categories.js`, every dependency passed in by the caller. `parseCsv` is a real RFC4180-ish parser, not a naive `split(",")`. 33 new unit tests in `tests/import.test.js`.
- **New leaf module `src/screens/import-sheet.js`** — Import is a real multi-step flow (pick file → map columns → review counts → commit) with its own internal state, unlike Export's one-click-each buttons.
- **Category resolution reuses existing infrastructure exactly**: a mapped Category column's text is looked up via `findCategoryId`; on no match, the raw text is kept as `.category` with `categoryId: null`, never auto-creating a new category. No Category column mapped falls through to `guessCategory(note, type)` instead.
- **Commit is batched, not per-row**: one `saveToStorage()` and one `pushRows("transactions", ...)` call for the whole import. `checkBudgetAlert` is deliberately never called for imported rows.
- **A real, pre-existing bug found and fixed while live-testing this feature, unrelated to import logic itself**: `wireAddForm` used to call `renderTransferAccountChips()` unconditionally at every render regardless of which type tab was active, which could permanently show one real account disabled on the plain Expense/Income tab with exactly two accounts. Fixed with a new `renderAccountFieldChips()` helper that picks the correct render function based on `state.formType`. Caught only because this feature's own live-testing happened to need a two-account setup exercising the Add form's plain picker.

Live-verified end to end: a hand-created seed plus a 4-row test CSV produced the exact expected `2 new · 1 duplicates · 1 unreadable` summary, including a row matching a *different account's* transaction correctly counted as new (proving per-account dedupe live, not just unit-tested). A second CSV confirmed both category-resolution paths for real. `npm run build && npm test` (136/136) and `npm run test:e2e` (9/9) both pass. **Not done this pass**: a Supabase round-trip via a throwaway test account — scoped out because `pushRows`/`txToRow` are pre-existing, already-proven code paths reused exactly as-is here.

## Transfer direction swap + account delete (post-csv-import)

Two small, directly-requested fixes done on `main`.

1. ✅ With exactly 2 accounts, the Add form's Transfer tab had no way to reverse "A → B" into "B → A" — the From/To pickers' same-account-exclusion logic always disabled the one other account in *both* pickers at once with only 2 accounts total. Fixed with a dedicated swap control (`#transferSwapBtn`) that exchanges `state.formAccountId`/`formToAccountId` directly. **A CSS specificity bug found live**: `.transfer-swap-row { display: flex; }` was defined later than `.form-field-hidden { display: none; }`, so on equal-specificity single-class selectors the later rule won regardless of which element also had `.form-field-hidden` — the swap button stayed visible on Expense/Income tabs. Fixed by scoping to `.transfer-swap-row:not(.form-field-hidden)`.
2. ✅ Settings' Accounts section gained an actual delete option (previously archive-only). `deleteAccount()` mirrors `deleteCategory()`'s exact shape. **A real bug found and fixed during live verification**: `wireInlineCrud` already wired the delete selector generically, and adding a *second*, manual listener for the same selector meant every delete click fired two handlers — the generic one threw `TypeError` (visible in console) while the manual one still completed the delete, so the feature looked like it worked while silently throwing on every use. Fixed by passing `deleteAccount` into the existing `wireInlineCrud` call instead of adding a parallel listener.

Live-verified: swap button reverses both directions; Expense/Income tabs never show the swap row; account delete correctly blocked when in-use, and a freshly-created unused account deleted cleanly with zero console errors after the double-listener fix (a stale service-worker cache had to be cleared to confirm a genuinely fresh bundle — a reminder that this app's own service worker can serve stale `main.js` across a plain reload during local testing). `npm test` (136/136) and `npm run test:e2e` (9/9) both pass.

## Settings Manage-section redesign: swipe rows + bottom-sheet forms (post-transfer-swap-account-delete)

Full spec at `repo/docs/specs/settings-manage-swipe-and-sheet.md`. Requested directly: "in settings make edit delete tool in swipe action like in transaction and all items in manage shall extends from bottom like add." **Mobile-only (below 1024px) — desktop's inline forms and always-visible row icons are completely untouched.**

- **New leaf module `src/screens/manage-row-swipe.js`** — a sibling implementation to `tx-row.js`'s swipe (not shared, since the drag surface and button count genuinely differ), using the identical proven technique: growing a real flex box's width, never an overlaying positioned layer.
- **Generalized to N action buttons**: reveal width is `20 + n×34` (2 buttons everywhere except Accounts' 3). **Whole row is the drag surface**, not just a trailing handle like `tx-row.js` — Categories rows have no trailing amount to grab.
- **`manageRowHtml()` itself branches on `isDesktopShell()`**, covering Budgets/Bills/Categories/Accounts in one place. Goals (a progress-bar card, not a `manage-row`) needed its own implementation.
- **One new shared `#manageSheetContainer` and a reactive `renderManageSheet()`** — called once at the end of `renderSettings()`, it scans six pre-existing edit-id-like fields and shows whichever is set as a sheet below 1024px. A real design refinement over the original planned imperative open/close pair: since every add/edit/cancel trigger already just sets state and calls `renderSettings()` unchanged from its desktop-only behavior, **`wireInlineCrud` needed zero changes**.
- **Two real bugs found and fixed during live verification, neither visible from reading the code**: (1) `.manage-row-wrap` was missing `display: flex` entirely, so a revealed action row rendered on its own line below the content — caught only by actually swiping a row live. (2) the whole-row drag surface needed `touch-action: pan-y; user-select: none;` or a mouse-drag selected text instead of swiping — caught by literally seeing highlighted text mid-drag.

Live-verified at mobile width (390px) across all 5 sections, desktop re-confirmed unchanged: swipe-reveal correctly reveals/hides actions with no clipping at both `n=2` and `n=3`; Edit opens the shared sheet pre-filled; Save/Delete/Archive/Contribute all fire their real logic correctly. `npm test` (136/136) and `npm run test:e2e` (9/9) both pass.

## Manage-section Add button repositioned into the section header (post-manage-swipe-and-sheet)

Reached through an interactive HTML design preview (three switchable options: icon button in header, full-width dashed row, reusing the global Add button) rather than a written spec. Research (Material Design's FAB-menu/speed-dial pattern, Nielsen Norman's consistency heuristic) surfaced that a silent context-switch on the same icon/position violates a documented usability principle unless signaled before the tap — demonstrated live in the preview before the user chose **Option A** (small icon button in the section header).

- Each of the 5 Manage sections' "+ Add X" control moved into the section's own `<summary>` header as a `.btn.btn-icon` circle — reusing the exact same `PLUS_ICON` constant and element `id`s `wireInlineCrud` already wires, so no new click-handling logic was needed.
- **A real bug this move surfaces that the previous placement never could, found and fixed proactively**: the button now lives inside a native `<details>`'s `<summary>`, where a click's default action toggles the disclosure. Without a fix, clicking "+" on an already-open section would snap it closed before the add flow's own render ran, hiding the inline form behind a collapsed panel on desktop. Fixed with `e.preventDefault()` in `wireInlineCrud`'s shared add-button handler. A second, desktop-only wrinkle: `pointer-events: none` on the disclosure summary (from the desktop-screen-layouts pass) would have swallowed clicks on the new button too — fixed with an additive `pointer-events: auto` override scoped to `.btn-icon`.

Live-verified: clicking "+" on an already-open mobile section correctly leaves it open (confirmed via `element.open` directly) while the sheet opens on top; clicking "+" on a closed section opens the sheet without forcing it open; a real budget was added end-to-end and confirmed persisting, then deleted to restore original data. `npm test` (136/136) and `npm run test:e2e` (9/9) both pass.

## Pill/tab text-overflow fixes (post-add-button-repositioning)

Three small, unrelated text-overflow bugs reported directly ("transfer in transaction filter is longer than the pill, today in date month pill also and full month name in category page are just too long") — all three the same underlying CSS bug class documented elsewhere in `CLAUDE.md` (the `minmax(0, Nfr)` grid-track fix): a flexbox child's `min-width` defaults to `auto`, not `0`, so `flex: 1` alone never lets it shrink below its content's natural width — `overflow: hidden`/`text-overflow: ellipsis` is a silent no-op without an explicit `min-width: 0` alongside it.

1. ✅ The Type filter's "Transfer" option overflowed its own pill — fixed by adding `min-width: 0; overflow: hidden; text-overflow: ellipsis;` to `.tab-opt`.
2. ✅ The period-picker pill's label span had the same missing `min-width: 0` — on a narrow pill, a long label could push the pill's own step/next arrow button partially outside its clipped bounds, confirmed via `getBoundingClientRect()`. Fixed with one `min-width: 0` addition.

Live-verified: "Transfer" now renders fully within its pill; paging Insights' Categories tab to "September 2026" no longer clips the next-arrow button; tapping "Today" renders cleanly either fully or ellipsis-truncated, never overflowing. `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass.

## Type-toggle spacing and period-pill label polish (post-pill-tab-overflow-fixes)

Three more small, directly-reported tweaks on the same UI: "the spacing in transfer feel a bit off... and today box next to all should just display 'Today', in categories should be shorter eg. AUG 26."

1. ✅ (later corrected — see the regression note below) `.tab-opt`'s uneven padding, the actual cause of "spacing feels off." Four options of very different lengths (All/Income/Expense/Transfer) under `flex: 1` meant the shortest label sat in a cell sized for the longest. Fixed by switching to `flex: 0 0 auto` (content-sized cells) plus `justify-content: space-between` on the row. Applies to every `.tabs.block` caller app-wide, not just the reported one (Insights' tabs, the Add form's type toggle) — both live-checked afterward.
2. ✅ The "Today" shortcut *button* inside the popover no longer appends the date — was `Today · 30/08/2026`, now plain `Today`, matching "All" alongside it (the date was redundant there since the pill's own trigger already shows it once active).
3. ✅ Insights' Breakdown pill label shortened to `"AUG 26"` instead of `"August 2026"` via a new `monthYearLabel(monthNum, year, short)`, gated by `opts.shortLabel` on Breakdown's call site only — Budgets' and Transactions' pills keep the full format. Goes through the existing `yearLabel()` so Thai's Buddhist-era year shortens correctly too.

**Real regression found on the user's actual phone, fixed the same day.** The verification above only checked ~390px+ widths. On a genuinely narrow viewport (~310-320px), `flex: 0 0 auto`'s `flex-shrink: 0` meant the four content-sized cells couldn't shrink at all — the row overflowed and "Transfer" (the last, widest cell) got silently clipped to "Trans" with no ellipsis, the exact same symptom as the original bug report from a different cause. Fixed by changing to `flex: 0 1 auto` — flex-grow stays 0, flex-shrink becomes 1, so cells compress proportionally (engaging the existing `min-width: 0` ellipsis path) instead of overflowing. **Lesson**: a "mobile-width" check needs to include something closer to the low end (~320px), not just one comfortable mobile width like 375-390px.

**A real gap, not a code bug, surfaced right after this pass**: the user reported the Transfer-spacing fix "isn't fixed yet" with a screenshot from the actual live site — `git status` showed the entire backlog since the tap-highlight commit (CSV import, the Manage-section swipe/sheet redesign, the header Add-button move, the transfer swap control, account delete, and every fix in this section) had only ever been verified locally against `dist/` and was never committed or pushed. Reconstructed into 5 commits matching the passes' natural boundaries, each independently built/tested before moving to the next, then pushed to `main` in one batch. **Lesson for future sessions**: "live-verified" in these pass writeups means verified against a local `dist/` build unless stated otherwise — it does not imply the change has been committed or deployed. If a user reports a documented fix isn't visible on the real site, check `git status`/`git log` for an uncommitted backlog before assuming the fix itself is wrong.

## Manage-section icon picker inert on mobile (post-narrow-phone-tab-fix)

Reported directly: "i cant change the icon in accouts, categories." Root cause: the Settings Manage-section swipe/sheet redesign moved Categories' and Accounts' add/edit forms into `#manageSheetContainer` below 1024px, populated by `renderManageSheet()` — but the icon-picker click wiring only ever ran earlier in `renderSettings()`'s own wiring pass, *before* `renderManageSheet()` runs and actually creates those buttons. The picker rendered correctly (icons visible, one pre-selected) and looked identical to the working desktop version, but every button was inert. Desktop was never affected: its inline form exists directly in `#screen` before that wiring pass runs.

Fixed by adding the identical wiring inside `renderManageSheet()` itself, scoped to the sheet's own container. Live-verified end-to-end, not just the click toggling `.selected`: opened Categories' add form, clicked a different icon, confirmed the ring moved; opened Accounts' add form, clicked a different icon, named it, saved, and confirmed the saved row actually rendered with the newly-chosen icon — both at mobile width and re-confirmed the desktop inline picker still worked unchanged. Zero console errors. `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass.

## Transfer tab silently failing to save or edit (post-icon-picker-fix)

Reported directly: "i cant save or edit transfer data." Reproduced live in a real browser (desktop sidebar width) before touching any code: filling out the Transfer tab correctly (From ≠ To, a valid amount) and clicking "Save transaction" did nothing at all — no navigation, no toast, no console output, not even a validation tooltip.

Root cause, found by inspecting `document.getElementById('addForm').checkValidity()` directly rather than guessing from the JS: `#txCategory` is a `required` `<select>`. On the Transfer tab it's hidden via `#categoryField`'s `.form-field-hidden` class (`display: none`), and `renderFormCategoryOptions()` populates it by filtering `categories` to `c.type === state.formType` — since no category has `type: "transfer"`, this always leaves the select with **zero `<option>`s** on that tab. Chrome does not exclude a `required` field from constraint validation just because an ancestor is `display:none` (`element.willValidate` was confirmed `true` empirically, contradicting the assumption carried over from this repo's own "remove `required`/`min` from the amount field" fix in the earlier UI/UX fundamentals pass — that fix worked only because the amount field is never hidden, not because hidden-required-fields get excluded). Because the browser blocks the native `submit` event itself before dispatch, `add.js`'s own `submit` handler (with its `e.preventDefault()` and all its own JS validation) never ran at all — hence zero console output. And because the blocking field is invisible, the browser's own validation-failure UI (the little tooltip bubble) has nothing to anchor to and never appeared either, making the failure completely silent.

This has been broken since the Transfer tab shipped (`required` was never toggled off for `#txCategory` in `updateFormTypeVisibility()`, confirmed via `git log -p`) — the account-transfers pass's "live-verified end to end" claims either used a different verification path than a genuine click, or this reproduced inconsistently; either way, it reproduced reliably here with a real click. Fixed with one line: `$("txCategory").required = !isTransfer;` inside `updateFormTypeVisibility()`, alongside the class it already toggles.

Live-verified end to end against a rebuilt `dist/` (service worker unregistered and caches cleared first, per this repo's own standing warning about stale bundles surviving a plain reload): a real Transfer save (เงินสด → Bank, ฿500) correctly created the row and navigated to Transactions; editing it to ฿750 correctly showed "Changes saved"; a plain Expense save was re-checked afterward and confirmed unaffected (`#txCategory` stays `required` and valid on that tab, since a category chip is always pre-selected there). Both test rows were deleted afterward to restore the original seed data. `npm test` (136/136) and `npm run test:e2e` (9/9) both pass.

## Bottom-sheet audit and sticky Save/Cancel on the Add sheet (post-transfer-save-fix)

Prompted by the user asking "how can I improve my bottom sheet" after a Mobbin glossary lookup on the pattern. Audited every sheet in the app (Add, Transactions/Insights Filters, Export, Import, Manage) against Mobbin's own bottom-sheet checklist and this app's existing conventions, verifying each candidate finding live rather than assuming from the CSS — several didn't reproduce or were already handled, so only confirmed ones are listed:

- **Confirmed live**: the background page scrolls behind an open sheet — neither `body` nor `html` gets scroll-locked while a sheet is open, reproduced by scrolling over the dimmed backdrop and watching Settings' own content scroll underneath a still-open Categories sheet. Documented as a follow-up, not fixed in this pass (scope grew before reaching it — see below).
- **Confirmed via code**: none of the six `role="dialog"` sheets set `aria-modal="true"` (checked via `element.getAttribute('aria-modal')` on each). Also not fixed in this pass.
- **Confirmed via code**: no drag handle/grabber and no swipe-down-to-dismiss gesture on the sheet itself (only backdrop-tap/×/Escape) — flagged as a bigger, more opinionated change (new gesture code) and deliberately not started without the user weighing in on scope.

**What actually shipped this pass, on direct user request** (a different, more specific ask than the audit's own findings): "moving save and cancel button to the top and always show too, it's easier on task that require mobile keypad" — a real, common failure mode where a bottom-anchored Save button sits behind the on-screen keyboard once a form takes over the lower half of a short viewport.

- **The Add/Edit bottom sheet's header is now sticky** (`position: sticky; top: 0`) and carries the Save/Cancel actions directly, mirroring the Cancel/Save convention from Apple's own Sheets HIG (the reference Mobbin's own glossary page cites) rather than this app's usual full-width `.btn` pattern. `addFormFieldsHtml()` gained an `opts.hideBottomButtons` flag so the sheet variant (`renderAddSheet`) omits the original bottom Save/Cancel entirely (no redundant second button pair) while desktop's full-page form (`renderAdd`) keeps them completely unchanged — same shared function, just a different flag per caller.
- **Save is a plain `<button type="submit" form="addForm">` living outside the `<form>` element**, in the header — the HTML5 `form` attribute lets a button anywhere in the document submit a specific form by id, so clicking it fires the exact same native `submit` event (and thus the exact same validation/save code in `wireAddForm`'s existing handler) as the old bottom button did. No parallel save logic to keep in sync.
- **Cancel reuses the existing generic `l.cancelBtn` string** ("Cancel"/"ยกเลิก", already used elsewhere in the app) rather than the edit-specific `l.cancelEditBtn` ("Cancel edit") — the header Cancel now covers both the add-new and editing cases identically, unlike the old bottom Cancel button which only ever rendered when editing.
- **A short `saveShortBtn` i18n string was added** ("Save"/"บันทึก") after the user asked to shorten the header button from the full "Save transaction"/"Save changes" text, which read as too long for a compact header action.
- **`.filter-sheet-header` was made sticky for every sheet, not just Add** (Filters, Export, Import, Manage too) — verified this is a strict improvement with zero layout regression to the other five sheets' existing title+× header, since it doesn't change their markup, only pins it in place while their body scrolls and adds a subtle `border-bottom` separator. `.filter-sheet-header h3` also gained `flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis` (this repo's own standing `min-width: 0` lesson) so a long title truncates instead of ever overflowing, confirmed via the Add sheet's own title ("Add transaction") wrapping to "Add transacti…" on a 390px viewport without disturbing the Cancel/Save buttons on either side.

Live-verified in a real browser (mobile-width iframe harness against a rebuilt `dist/`, service worker unregistered and caches cleared first): the sticky header stays pinned while the form scrolls underneath it on both the Add and Filters sheets; Save (top button) correctly creates a transaction and closes the sheet, Home updates immediately; Cancel correctly discards and closes with no state change; editing an existing transaction (via swipe-to-reveal → Edit) opens the sheet with "Edit transaction" / "Save changes"-then-shortened-to-"Save" and a pre-filled amount, and saving updates the row correctly; dark mode confirmed via the real Settings toggle, both header text and the border separator read correctly against the dark card background; desktop width (`renderAdd`, the full-page form) reconfirmed completely untouched — still the original full-width bottom "Save transaction" button, no header actions. Test transactions created during verification were deleted afterward to restore the original seed data. `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass.

**Left open for a future pass, not silently dropped**: background scroll-lock, `aria-modal="true"`, and a drag handle + swipe-to-dismiss gesture — all confirmed real gaps during the audit above, deliberately not bundled into this pass since it grew out of a specific, narrower request once the user gave direct implementation feedback.

## Fixing the rest of the bottom-sheet audit: scroll-lock, aria-modal, grabber, swipe-to-dismiss (post-sticky-save-cancel)

The user asked to fix the remaining four findings from the audit above. All four landed, across all six sheets (Add, Transactions Filters, Insights Filters, Settings' Manage sheet, Settings' Export sheet, Import).

- **Background scroll-lock piggybacks on `createFocusTrap`'s existing `activate()`/`deactivate()`** (`utils.js`) rather than being a separate call site. Every sheet already calls exactly those two methods at exactly the moments scroll should lock/unlock (confirmed by reading each sheet's own open/close wiring first), so bundling `lockPageScroll()`/`unlockPageScroll()` in there means zero new call sites anywhere and no sheet can forget to wire it. Reference-counted (not a plain boolean) in case two sheets are ever activated without the first deactivating first — doesn't happen today, but costs nothing to guard against. Sets `overflow: hidden` on both `body` and `documentElement` (this app has no separate scrolling container; the whole document scrolls) and restores whatever the previous inline value was, not a hardcoded default.
- **`aria-modal="true"` added to all six `role="dialog"` elements.**
- **A drag handle (`sheetGrabberHtml()`, `utils.js`) renders as the header's first child on every sheet** — a small pill (36×4px visible, 64×16px hit area) positioned `absolute` within the header's own `position: sticky` box (already a valid containing block for it, so no extra markup nesting needed), so it doesn't affect the title/buttons row's flex layout at all. Deliberately its own dedicated element rather than making the whole header row draggable, so dragging never has to be distinguished from a plain click on Cancel/Save/×.
- **Swipe-down-to-dismiss (`wireSheetDrag()`, `utils.js`) mirrors `tx-row.js`'s existing swipe mechanics** — pointer capture, a rubber-band `sqrt` clamp against dragging past the resting position, a distance-or-velocity decision on release (120px, or a fast-enough flick past 20px) — adapted from that file's horizontal reveal to one vertical dismiss gesture. A drag that doesn't clear the threshold snaps back via a `.snap-back` class (added right before the reset, removed on `transitionend`) rather than a permanent `transition` on `.filter-sheet`, which would otherwise fight the live 1:1 tracking during an active drag.
- **Two different wiring lifecycles had to be respected, not just copy-pasted everywhere**: Add, Transactions Filters, Settings' Export sheet, and Import wire the drag once (their markup persists in the DOM, only toggled by a `hidden` attribute or backdrop swap); Insights' Breakdown filter sheet and Settings' Manage sheet fully regenerate their markup on nearly every interaction, so their drag-wiring call sites had to move to those same re-render functions (`renderBreakdownFilterSheet()`, `renderManageSheet()`) rather than a one-time wire-up, matching exactly how each of those two already re-wires its own close button and focus trap for the same reason.

**A real caching pitfall hit during live verification, not an app bug**: after rebuilding `dist/`, the mobile-width iframe harness kept rendering the *previous* CSS (no grabber, no header padding) even after unregistering the service worker and clearing Cache Storage — both confirmed empty. Root cause: the plain browser HTTP disk cache for `styles.css` (a layer neither the SW nor the Cache Storage API touches), which `python -m http.server` doesn't send cache-control headers to prevent. A manual `fetch('/styles.css', { cache: 'no-store' })` confirmed the served file was correct all along; the loaded `<link>` stylesheet was just stale. Worked around for verification purposes by fetching the fresh CSS text and swapping it into a `<style>` tag in place of the `<link>` — not a fix to anything in the app itself, just a gap in the local test harness worth remembering next time a CSS-only change doesn't seem to show up after a rebuild.

Live-verified in a real browser (mobile-width iframe harness, dark mode via the real Settings toggle, desktop width reconfirmed separately): the grabber renders identically across all six sheets in both themes; a swipe-down past the threshold dismisses the Add sheet, the Transactions Filters sheet, and Settings' Manage (Budgets) sheet, each confirmed by screenshot showing the underlying screen fully restored; a short drag below the threshold correctly snaps back with the sheet still open; `document.body`/`documentElement` computed `overflow` read `hidden` while any sheet was open and `visible` immediately after close; `aria-modal` read `"true"` on the open dialog; Cancel/Save button clicks on the Add sheet's header were unaffected by the new pointer listeners on the (separate) grabber element, confirmed by actually saving and canceling, not just clicking without checking the result; desktop width (mouse-driven, sidebar shown) reconfirmed the Filters sheet renders and functions identically to before, the grabber present but inert since desktop has no drag-dismiss use case. Zero console errors throughout. `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass.

## On-screen keyboard pushing the whole sheet off-screen (post-bottom-sheet-audit-fixes)

Reported directly, immediately after the audit fixes above: "keypad push entire bottom page up, can u make it push only items in bottom page so the save always reachable, while typing box stay on top of keypad."

Root cause: most mobile browsers handle the on-screen keyboard by shrinking only the *visual* viewport, leaving the *layout* viewport (what `position: fixed`/`inset: 0` and plain `vh` units are relative to) exactly as tall as before. `.filter-sheet-backdrop`'s `inset: 0` therefore kept claiming the full pre-keyboard height even once the keyboard was up, so the browser's own "scroll the focused input into view" behavior had no choice but to scroll the *entire* fixed-position sheet — sticky header, Save button, and all — up and off the top of the screen to bring a bottom-of-form field above the keyboard, instead of just scrolling that one field within the sheet's own remaining visible space.

Fixed with the `visualViewport` API (`syncSheetToViewport()`, `utils.js`), which reports the real, keyboard-adjusted visible height directly (broad support: Safari 13+, Chrome 62+ — no new dependency). It sets the open backdrop's `height`/`top` to match `window.visualViewport.height`/`offsetTop` (overriding `inset: 0`'s stale full-height claim; per spec, an explicit `top`+`height` on a fixed element correctly overrides a conflicting stylesheet `bottom: 0`) and the sheet panel's own `max-height` to 80% of that — the same ratio `styles.css`'s static `80vh` already used, so behavior is unchanged whenever the keyboard is closed (`visualViewport.height` then just equals the full layout viewport height). Two hookups, both piggybacked onto existing call sites rather than new ones: `createFocusTrap()`'s `activate()` calls it once on every sheet open (so a stale size from a previous open can never linger — the same reasoning already used for scroll-lock in the previous pass), and a single module-level `visualViewport` `resize`/`scroll` listener re-syncs whichever sheet is currently open for the live keyboard-open/close transition itself. No per-sheet wiring needed — every sheet gets this automatically through the same shared `createFocusTrap` instance it already uses.

**Verification method, since no automated browser tool can trigger a real on-screen keyboard**: mocked `window.visualViewport.height`/`offsetTop` via `Object.defineProperty` (the same technique the timezone-fix pass used for `window.Date`) and dispatched a synthetic `resize` event, simulating a keyboard covering half the screen (700px → 350px). Confirmed live: the backdrop's `style.height`/sheet's `style.maxHeight` updated to `350px`/`280px` respectively on the mocked shrink, and a screenshot confirmed the sticky header (Cancel/Add transaction/Save) stayed fully visible and reachable at the top of the now-shrunk sheet rather than being pushed off-screen; restoring the mocked height back to 700px correctly grew the sheet back to its original size; the same mechanism was confirmed firing identically on the Transactions Filters sheet (via the shared `createFocusTrap`) without any sheet-specific wiring. **Genuine on-device confirmation with a real keyboard is still the only way to fully close this out** — left to the repo owner, same as this project's other real-device-only verification gaps (Google OAuth consent, push notification permission grants). `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass.

## A selectable "Linear" theme in Settings (post-keyboard-sheet-fix)

Full spec at `repo/docs/specs/linear-theme.md`. Requested directly ("i want to add monochrome accent, find some inspiration on web eg. linear, then create prototype"), then reshaped substantially through the design-exploration process itself before any real-app code was touched.

- **Design exploration happened first, entirely outside the app**, as a standalone Artifact prototype (`monochrome-accent.html`) grounded in live inspection of linear.app rather than a from-memory guess: page background, body-text color, and font weight pulled from real computed styles; 159 real rendered icons sampled to find that 84% are filled solid shapes on a 14-16px grid (not outlines); a real product-screenshot UI panel inspected via `document.elementFromPoint` for its actual corner radius (12px, not the pill shape Linear's own buttons use), hairline border, and soft ambient shadow. Icon-set research separately identified Radix Icons (MIT, `radix-ui/icons`) as the closest free match — 330/330 icons on an identical 15×15 grid, 100% filled.
- **A first pass at the prototype (color + icons only, accent re-derived with real contrast math for mood/attention-guidance) was explicitly rejected by the user**: "good but it doesnt lools linear, you should find core design principle of linear first." This was a real course-correction, not a refinement request — it forced a second, deeper research pass into Linear's actual structural language (radius/border/shadow/weight) before the prototype was considered representative, and is the reason the spec's Reference section above cites specific measured pixel values rather than a general "Linear-inspired" impression.
- **Bringing the exploration into the real app was scoped via `/spec`** (interview, one question at a time) rather than built ad hoc, since it touches `state`/`theme.js`/multiple screens. Key decisions from that interview: a **bundled theme** (`Theme: Current / Linear`), not an independent accent-color picker layered on top — accent, radius, shadow, weight, and (eventually) nav icons all change together as one named choice; `state.themeStyle` stored as a string (`"current" | "linear"`) rather than a boolean, so a third preset can be added later without a data-shape change; **local-device-only** persistence (`localStorage`, like `state.dark`/`state.lang` — never synced via Supabase, never touched by `wipeLocalAccountData()`); fully independent of Dark Mode (all four Theme×Mode combinations are valid); the hero card and all "primary CTA" filled surfaces (`.btn-primary`, the tab bar's raised Add circle) drop their gradient/accent fill entirely under Linear in favor of a solid monochrome fill, reserving the tuned accent hue for text/links/focus states only under that theme.
- **Stage 1 (infrastructure, no visible change)**: `state.themeStyle` field, `localStorage` load/save, a new `applyThemeStyle()` in `theme.js` (initially just a marker attribute, no real tokens yet), and a new Settings toggle row (Display card, under Dark Mode) using the same `.tabs`/`.tab-opt` radiogroup shape as the Language row. Live-verified zero visual change anywhere with Linear selected, confirming nothing yet reads the new attribute.
- **Stage 2 (real visual tokens)**: `applyThemeStyle()` now sets real `--radius-lg`/`--shadow-sm`/`--shadow-lg`/`--shadow-accent`/`--weight-heading`/`--color-accent(-600/-700)`/`--color-primary-fill(-text/-hover)`/`--hero-fill` values per theme×mode (4 variants total — Linear's own accent differs between light and dark, so this isn't just 2). `styles.css` grew a `--hero-fill` token (`.hero-card`'s background rule, `.btn-primary`, and the tab bar's Add-button circle all read from it instead of a hardcoded gradient/accent) and applied `var(--weight-heading)` to `h1-h4`. Two corrections found while building, against the spec's own draft: the real app's heading weight is 800, not the 700 the Reference section assumed; and "the active period-pill" (named in the spec as a fill to convert) turns out to have no filled-accent state at all — it only ever colors text/icon, so there was nothing to convert there. Roughly 30 other accent-filled components (category/account chips, switches, the year/month picker's selected state, badges, filter chips) were deliberately left on the tuned accent color rather than converted to monochrome — only the 3 surfaces the spec's Decision 7 actually names as "primary CTA" convert.
- Live-verified all four Theme×Mode combinations via computed-style checks (not just screenshots) — `--radius-lg`, `--weight-heading`, `--color-accent`, `--color-primary-fill` all confirmed correct per combination — plus a real transaction save under the Linear theme (confirmed correct `localStorage` persistence). Confirmed the pre-existing `.hero-card-negative` red-gradient override for a negative balance correctly and intentionally survives regardless of theme (financial semantic color, not overridden by `--hero-fill`). `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass. Reset `state.themeStyle` back to `"current"` after verification.

- **Stage 3 (Radix icon swap for the 5 nav icons)**: 5 Radix Icons (`home`, `list-bullet`, `plus`, `pie-chart`, `gear`) fetched directly from `raw.githubusercontent.com/radix-ui/icons` and added to `icons/sprite.svg` as new symbols, re-verified with a real XML parser (59 symbols total, valid). Each of the 10 `.nav-btn` `<use>` elements in `index.html` (5 icons × 2 nav surfaces) gained a sibling `<use>` — Lucide and Radix side by side in the same `<svg>` — with one new global CSS rule near the base `.icon` rule toggling which is visible off `html[data-theme-style="linear"]`, defaulting to Lucide so a pre-JS first paint never shows the wrong set. Live-verified via computed-style checks (not just screenshots) that both nav surfaces swap correctly and simultaneously, that Current correctly restores the exact original Lucide icons with no leftover Radix symbol, and that the Add button's new Radix `plus` sits correctly inside Stage 2's existing monochrome-filled circle. `npm run build`, `npm test` (136/136), and `npm run test:e2e` (9/9) all pass.

All 3 stages of `docs/specs/linear-theme.md` are now done.

## Removed the Linear theme

Requested directly ("remove the linear theme"), no spec needed for a straight removal. Everything the 3-stage pass above added is gone: `state.themeStyle`, `theme.js`'s `applyThemeStyle()` (all four Theme×Mode variant objects), the Display section's Theme radio row, the `themeStyle` load/save in `storage.js`, and `i18n.js`'s `themeSection`/`themeCurrentOpt`/`themeLinearOpt` strings. The 5 Radix icon symbols added to `icons/sprite.svg` for Stage 3's nav-icon swap are deleted (re-verified with a real XML parser afterward, 56 symbols remaining, no `radix-` ids left), and each of the 10 `.nav-btn` `<use>` pairs in `index.html` collapsed back to a single Lucide `<use>`, matching every other icon in the app. `styles.css`'s `--color-primary-fill(-text/-hover)`/`--hero-fill`/`--weight-heading` indirection tokens — which only ever existed so `applyThemeStyle()` could override them — are inlined back to their literal Current-theme values (`var(--color-accent)`/`#ffffff`/the gradient/`800`) at their handful of consuming rules (`.btn-primary`, `.hero-card`, the tab bar's Add-button circle, `h1-h4`) rather than left as now-permanently-fixed indirection with nothing left to drive it. `docs/specs/linear-theme.md` deleted (a spec describes what's currently built; this entry is where the feature's history now lives). A pre-existing `localStorage` blob with a leftover `"themeStyle":"linear"` key from before this removal is harmless — nothing reads that key anymore. `npm test` (170/170), `npm run build`, and `npm run test:e2e` (9/9) all pass; live-verified in a browser that both nav surfaces render the plain Lucide icon set, the Theme row is gone from Settings' Display section with Dark Mode/Language/Hide financial status unaffected, and the hero card/primary buttons/Add-button circle all render pixel-identical to before the removal.

## Home screen polish pass (ui-ux-pro-max skill)

Requested directly ("redesign/polish [Home] using the ui-ux-pro-max skill"). Used the newly-installed `ui-ux-pro-max` plugin's `--design-system`/`--domain` search tool (finance-dashboard product profile, `ux`-domain queries on contrast/touch/animation) to steer the pass rather than freehand taste, then hand-verified every claim with a real relative-luminance contrast calc before touching code — the skill's product/UX guidance is a starting point, not a source of truth to apply blind.

- **Real WCAG AA contrast failure found and fixed**: `.stat-card .delta`'s income/expense percentage text and `tx-row.js`'s income transaction-amount text both used the raw `--color-income`/`--color-expense` brand hues directly as small (12-16px), non-large-text color — computed contrast against `--color-card` (white in light mode) is ~2.85:1 for income and ~3.66:1 for expense, both well under the 4.5:1 AA minimum for text that size. `--color-expense-700` already existed as a darker, AA-safe variant (used correctly elsewhere, e.g. `.manage-row-overdue .sub`, `badge-expense`) but had no income counterpart, and was itself a **second, pre-existing bug**: it was a static, non-theme-swapped hex (`#c22f22`) always applied even in dark mode, where it computes to only ~2.9:1 against the dark card (`#1e1f24`) — it happened to look fine in light mode and was never checked against dark. Fixed by moving both `-700` tokens into `theme.js`'s `applyTheme()` alongside the existing `--color-income`/`--color-expense` per-theme logic: light mode gets darkened text-safe hexes (`--color-income-700: #147a54`, 5.33:1 measured; `--color-expense-700: #c22f22` unchanged, 5.64:1), dark mode reuses the base `--color-income`/`--color-expense` values as-is for `-700` too, since those were already independently tuned to clear ~6-8:1 against the dark card — darkening them further (the light-mode direction) would have made dark mode worse, not better. `styles.css`'s `:root` keeps matching static fallback values for the pre-JS first paint. Swapped the three real Home-visible consumers of the raw color onto the new `-700` tokens: `home.js`'s two `.delta` inline styles and `tx-row.js`'s two `amountColor` assignments (the plain income-row case and the "transfer received into the viewed account" case). Live-verified via `getComputedStyle` + a hand-rolled relative-luminance contrast function in a real browser, both themes: light mode 5.33:1 (delta) / matches (tx amount), dark mode 7.73:1 (delta) / 7.73:1 (tx amount, confirmed same token) / 7.15:1 (`.manage-row-overdue .sub`, incidentally fixed by the same token change since it already consumed `--color-expense-700`).
- **Reduced-motion gap closed**: `.screen.screen-enter`'s fade-in keyframe (shared by every screen's tab-entry transition) had no `prefers-reduced-motion` handling at all — a real gap, since the rest of the codebase already respects it carefully in JS (`tx-row.js`'s swipe-peek demo checks `matchMedia` before running). Added `@media (prefers-reduced-motion: reduce) { .screen.screen-enter { animation: none; } }` right next to it.
- **Missing hover state closed**: `.account-chip` already declared a `background`/`border-color`/`color` `transition` (implying a hover state was intended) but had no `:hover` rule at all — confirmed by grep, not assumption. Added one, scoped to `@media (hover: hover)` so a touch tap never gets a stuck hover fill, and excluding `.active`/`:disabled`/`.account-chip-disabled` chips.
- **New one-shot entrance stagger**, opt-in only: `.hero-card`/`.stat-card` (×2)/`.today-spend-card` fade+slide in with a small stagger (0/40/80/120ms, 200ms each, existing `--duration-normal`/`--ease-standard` tokens) on a genuine tab entry only — piggybacked on the same `.screen-enter` trigger class as the existing screen fade, not on every re-render (sync pulls, local saves). Wrapped in `@media (prefers-reduced-motion: no-preference)` (opt-in, not an opt-out override) so a reduced-motion user gets zero animation here rather than relying on every rule remembering to check. `hero-card`/`stat-card`/`today-spend-card` are Home-only class names (confirmed via grep across `src/`), so this can't leak onto another screen's differently-purposed element.

Deliberately left alone despite being visible during the audit: `.account-chip`'s ~8px×34px effective tap target (padding: 8px 14px) is below the 44×44px touch-target guideline the skill's own priority table calls out, but changing chip height is a layout/density decision this pass wasn't asked to make and risks conflicting with the multi-account switcher's existing "many accounts, stay compact" design intent — flagged here rather than changed unilaterally. `badge-income`/`badge-expense`'s own raw-color-as-text pattern (the same bug class as the fix above) was left untouched since neither actually renders on Home (badge-income is Settings-only; the Home budgets-preview list never renders `badgeClass` at all) — out of this pass's scope.

Verification: `npm test` (172/172), `npm run build`, `npm run test:e2e` (9/9) all pass. Live-verified in a real browser against the built `dist/`: light and dark mode screenshots/zooms of the stat-card deltas and tx-row amounts, `getComputedStyle` contrast checks in both themes (see numbers above), the account-chip hover fill confirmed by hovering and zooming into the affected chip, and the entrance animation confirmed attached (`animationName: "home-card-in"`) on a real tab-switch back to Home.

## Supabase security/performance audit after accounts/transfers/category-nesting

Requested directly, two parts: run the Supabase advisors and rank real findings; separately, hand-verify RLS/FK correctness on the four migrations from that batch (`20260830080000_accounts.sql`, `20260830090000_account_id_column.sql`, `20260830100000_account_transfers.sql`, `20260902120000_category_parent_id.sql`) against three specific traps — cross-user transfer reads/writes via `accountId`/`toAccountId`, cross-user `parent_id` references given categories' composite `(id, user_id)` key, and unindexed FK filter columns. Findings reported and agreed on before any migration was written, per the request's own instruction.

- **Advisors surfaced nothing critical tied to this migration batch.** Both security-advisor findings (`pg_net` in the public schema, leaked-password protection disabled) predate it and are unrelated. No advisor flagged the new `accounts` table or the new columns at all — expected, since the linter checks RLS *presence*, not policy *correctness* for app-specific logic like "does this column reference another user's row." That's what the manual read was for.
- **RLS on the new table: confirmed correct.** Only one new table exists (`accounts`); it has RLS enabled with the same single `ALL` policy shape (`auth.uid() = user_id` on both `qual`/`with_check`) as every other table. The other three migrations only add columns to already-RLS-protected tables, which correctly needed no new policy (Postgres RLS applies per-row regardless of column).
- **Transfers: a real gap, but not the cross-user breach the framing worried about.** `transactions.account_id`/`to_account_id` had no FK at all (both migrations documented this as deliberate). Traced through carefully rather than assumed: `transactions`' RLS keys *all* visibility to the row's own `user_id`, never to `account_id`/`to_account_id` — so reading another user's data via the destination side was never actually possible. Writing a foreign `toAccountId` *was* possible, but since nothing ever joins that column against `accounts` for anyone else's queries, the only actual effect was a user corrupting their own client-side balance rendering, never another user's data. Verdict: a real, worth-fixing self-integrity gap, not a security breach — reported precisely as that rather than overstated.
- **`categories.parent_id`: confirmed correct, and it's the pattern the fix above now copies.** `categories.user_id` is `NOT NULL` (checked directly, not assumed from the migration's comment), and the FK is a genuine composite `(parent_id, user_id) → categories(id, user_id)`, enforced by Postgres itself. Because every user's built-in categories are seeded under their own `user_id`, this FK can only ever resolve to the calling user's own copy of a category — structurally impossible to point at a same-id row under a different `user_id`.
- **Indexes: confirmed via a direct `pg_indexes` query, not advisor inference alone.** `accounts.user_id` and `categories.user_id` were unindexed (every query on either table, always RLS-filtered by `user_id`, was a full scan); `categories.parent_id` was unindexed too. `transactions.account_id`/`to_account_id` were also unindexed, but not flagged as a real issue — sync pulls are always keyset-paginated by `updated_at`/`id`, never filtered server-side by account, so nothing currently issues that query.

**Fix, agreed via "you decide it"**: one migration, `20260903150000_transfer_account_fk_and_indexes.sql`. (1) `accounts` gets a separate `UNIQUE(id, user_id)` alongside its existing single-column PK (not replacing it, so `pushRows()`'s plain `"id"` onConflict target for this table is untouched), and `transactions.account_id`/`to_account_id` each get a composite FK to `accounts(id, user_id)` with `ON DELETE RESTRICT` — mirroring `category_parent_id`'s own already-correct shape. Confirmed zero existing rows would violate it before writing the migration (a live-data check: 0 orphaned `account_id`/`to_account_id`, 0 already pointing at another user's account), so it landed as a normal validated constraint, not `NOT VALID`. (2) Indexes added on `accounts.user_id`, `categories.user_id`, and — as composite indexes, not single-column — `categories.parent_id`/`transactions.account_id`/`transactions.to_account_id`. The composite shape mattered in practice, not just for the advisor: a first attempt with single-column indexes on just the leading column still left all three composite FKs flagged as unindexed on a advisor re-run, so it was corrected (applied live as a small follow-up migration, then folded back into this file so the repo's copy reflects the correct final shape directly rather than the intermediate misstep). Deliberately left alone as out of scope: the `auth_rls_initplan` pattern, `pg_net` schema placement, and leaked-password protection all predate this migration batch.

**Verification**: a live-data check before writing the migration confirmed the FK would apply cleanly (see above). After applying, the FK was proven to actually reject a cross-account write, not just assumed to exist — a real `INSERT` inside a rolled-back transaction, reusing a real account's id paired with a mismatched `user_id`, correctly raised `violates foreign key constraint "transactions_account_id_fkey"`; confirmed no test row persisted afterward. The performance advisor was re-run after the fix and confirmed clean for every finding this pass touched (the three composite FKs no longer flagged as unindexed); only the pre-existing, out-of-scope `error_logs`/`push_subscriptions` unindexed FKs remain, left alone as decided. `CLAUDE.md` (both the committed `repo/` copy and the outer workspace copy) updated to record the new constraints/indexes in its Supabase schema section.

## Dev-process scaffolding: workflows/, tools/, and a real sprite.svg guard

Prompted by a video on Claude Code's "Workflows/Agent/Tools" pattern for agentic dev processes. That video's own example (an API-orchestration pipeline scraping competitors and generating branded PDFs) doesn't map onto this repo — a client-side PWA with no such pipeline — so rather than build a matching pipeline, the applicable piece was pulled out after asking the user to scope it: turn this repo's own already-documented, already-repeated dev process into explicit files instead of re-deriving it from `CLAUDE.md` prose each session.

- **`repo/workflows/`**: two markdown SOPs. `ship-feature.md` is the existing spec → build → test → manual-check → doc-update → commit cycle already described piecemeal across `CLAUDE.md` and the outer global working rules, now as one checklist. `sync-claude-md.md` makes the "mirror both `CLAUDE.md` copies in the same pass" rule (already stated at the top of both files) into an explicit diff-and-apply procedure.
- **`repo/tools/check-sprite-svg.mjs`**: a real, previously-missing automated guard for the documented `icons/sprite.svg` failure mode ("a comment containing `--` silently truncates the file, breaks every icon, zero console error — this has broken the file more than once"). Regex-based comment scan (not a full XML parser — a `ponytail:` comment in the file marks that ceiling), checked against both the real `icons/sprite.svg` and a crafted bad-comment string to confirm actual detection, not just a trivial pass. Wired into `scripts/build.mjs` so it runs on every `npm run build`, plus exposed standalone as `npm run check:sprite`.
  - **Bug caught and fixed while writing this**: the script's CLI-entry-point check (`import.meta.url === file://${process.argv[1]}`) silently never matched on Windows, because `process.argv[1]` is a Windows path (backslashes, no `file://` scheme) while `import.meta.url` is always a proper `file://` URL — so running the script directly produced zero output and a false "it works" impression. Fixed with `pathToFileURL(process.argv[1]).href` from `node:url`. Worth remembering for any other script on this repo that does the same `import.meta.url` self-check pattern on Windows.
- Both `CLAUDE.md` copies (root and `repo/`) got a one-line pointer to `workflows/`/`tools/` under Repository layout, explicit that these exist for processes/checks that have actually recurred, not as a speculative general framework — deliberately not scaffolding beyond what was asked.

**Verification**: `node tools/check-sprite-svg.mjs` run directly (confirmed the Windows entry-point bug, then confirmed the fix); a separate crafted self-test (`findBadComments` against a string with a deliberate `-- ` inside a comment, and against a clean one) confirmed the detection logic itself, not just that the real file happens to pass; `npm run build` re-run after wiring the check into `scripts/build.mjs` to confirm the build still succeeds with the guard in place.

**Follow-up, requested directly**: a third workflow, `release-check.md` — the gate for "about to push to `main`" through "confirmed live," picking up exactly where `ship-feature.md`'s last step (commit, ask before pushing) leaves off rather than duplicating it. Covers: clean `git status` (an uncommitted backlog has been the actual cause of a "documented fix isn't live" report before, not the fix itself — see this file's "Type-toggle spacing" entry), the same `npm test`/`npm run test:e2e`/`npm run build` gate CI runs, docs-current, `gh run list --workflow=deploy.yml --limit 1` to confirm the deploy workflow actually succeeded rather than assuming a green push means deployed, and a final check against the real GitHub Pages URL — since this repo's own "live-verified" convention means checked against a local `dist/` build, not the deployed site, those are two different claims and the workflow says so explicitly. `ship-feature.md`'s step 7 now points to it. Both `CLAUDE.md` copies' `workflows/` pointer updated to list all three files.

## Claude + Codex ticket workflow

Added the small, sequential workflow described in
`docs/specs/dual-agent-engineering-workflow.md`: Claude Code clarifies and
specifies work, Markdown tickets provide the handoff, Codex implements one
ready ticket, Claude performs a read-only independent review, Codex verifies
and fixes confirmed findings, and the maintainer decides whether to merge.
`docs/WORKFLOW.md` contains copyable prompts and explains when to use the full
flow versus a tiny-fix or difficult-bug path. Added active/completed ticket
folders and `docs/tickets/TICKET_TEMPLATE.md`. Updated both `CLAUDE.md` copies
and both `AGENTS.md` copies; this also repaired the previously documented but
missing committed `repo/AGENTS.md`. Deliberately did not install third-party
skills or introduce GitHub Issues, worktrees, parallel agents, or automation.

## Workflow defaults, requested directly (no application code touched)

`docs/WORKFLOW.md` got a new "Standing defaults" section so the maintainer
doesn't have to restate the same instructions every cycle: the minimum
`/spec` starting prompt, that Claude clarifies one question at a time then
stops after writing the spec and creating `Ready` tickets (no auto-delegation
to Codex without an explicit ask), that the first Claude review always stays
read-only with confirmed defects kept separate from optional suggestions,
and a proportional verification table (`npm test` for logic;
`+ npm run build` for state/storage/sync; `+ npm run test:e2e` for
screens/UI). The step-3 Codex task prompt now says to read only the ticket,
its spec, relevant source, and relevant tests — `docs/CHANGELOG.md` is
skipped by default, since it's history, not something a scoped ticket needs.
Step 5 now says explicitly to resume the same Codex task for review-fix
rounds rather than starting a new one.

Also corrected a stale "Known limitations" claim that Codex can never run
Playwright/open a real browser in its sandbox. Traced during WI-002: the
actual failure was `browserType.launch: spawn EPERM` (a missing
browser-launch permission), not a hard sandbox restriction — once granted,
the same Codex task ran all 15 E2E tests successfully. The doc now says to
grant browser-launch permission and rerun, reserving delegation elsewhere
for environments that genuinely cannot launch Chromium.

`CLAUDE.md` and `AGENTS.md` (both copies of each) got short pointers to
`docs/WORKFLOW.md`'s "Standing defaults" rather than duplicating it — this
was a deliberate choice to keep `docs/WORKFLOW.md` the single source of
truth. `docs/tickets/TICKET_TEMPLATE.md` was left unchanged; its generic
verification checklist already composes fine with the new proportional
matrix.

## WI-002: move the Add-sheet commit preview to the top

First ticket run through the dual-agent workflow end to end (spec → ticket →
Codex implementation → independent Claude review → maintainer merge). In the
mobile Add/Edit bottom sheet only, the live commit preview
(`#addCommitPreview` — icon + category/route + account + signed amount)
moved from the last field (just above the sticky Save button) to the first
field, above Amount, per `docs/specs/add-sheet-preview-position.md`: the
point of a preview is to confirm choices as they're made, which the old
"final check before Save" position couldn't do once Amount scrolled out of
view.

Since the preview is now the first thing visible on opening the sheet,
`renderCommitPreview()` (`src/screens/add.js`) gained an empty-state guard:
it hides itself (and clears its children, so the pre-existing
`.commit-preview:empty { display: none; }` CSS rule wins over
`.commit-preview { display: flex; }` — a bare `hidden` attribute alone would
lose that specificity tie, since `[hidden]` is a UA-stylesheet rule) whenever
`amount <= 0`, rather than showing a meaningless `฿0.00` default. Editing an
existing transaction shows the preview immediately, since its amount is
already prefilled and positive. Desktop's full-page Add/Edit form never
renders this element and is untouched.

Independent review found no confirmed functional defects; one out-of-scope
edit (an update to `docs/WORKFLOW.md`'s Playwright/EPERM note, made correctly
but outside this ticket) was reverted from the diff before merge, and folded
instead into the dedicated workflow-defaults pass above. `npm test` (172/172)
and `npm run build` re-run independently by the reviewer; live-verified
against built `dist/` (DOM order, hide/show on amount changes, the Transfer
from→to branch, desktop unaffected).

## Agent-workflow audit: standalone-clone paths and CLAUDE.md/AGENTS.md duplication

An audit (requested directly, no application code touched) found that
`CLAUDE.md` and `AGENTS.md` referred to their own repository's files with a
`repo/` prefix throughout (`repo/src/`, `repo/docs/WORKFLOW.md`,
`repo/workflows/`, etc.), and one line hardcoded this machine's absolute
path (`E:/project/incomeexpenses/repo/dist`) into the documented `python -m
http.server` command. Since both files are committed at this repo's own
root, those paths silently break for anyone cloning `whereisit` standalone —
`repo/src/` resolves nowhere when `src/` is already at the clone's root.
Root cause: both files were kept byte-identical to a second, outer copy one
directory above (`E:\project\incomeexpenses\CLAUDE.md`/`AGENTS.md`, outside
this git repo, auto-loaded for a session rooted at that wider local
workspace) — a single path scheme can't be simultaneously correct for a
session rooted at the repo root and one rooted a level above it, so "keep
them identical" and "make the committed copy standalone-correct" were
mutually exclusive as designed.

Fixed by ending the byte-identical-mirror model: `repo/CLAUDE.md` and
`repo/AGENTS.md` are now fully self-contained and repo-root-relative (every
`repo/` prefix dropped, the `http.server` example made relative), and the
outer copies became short pointer files ("the real guidance is in
`repo/CLAUDE.md`/`repo/AGENTS.md`, read that instead") rather than
duplicates — see `workflows/sync-agent-entry-docs.md` (replacing
`sync-claude-md.md`, which only ever covered the `CLAUDE.md` half of this
even though `AGENTS.md` carried the identical mirroring instruction).
`docs/specs/dual-agent-engineering-workflow.md`'s verification criteria,
which had asked to confirm the two copies "match," were updated to match
the new model instead.

Also fixed while auditing: `AGENTS.md` cited a `sync-Codex-md.md` file that
never existed (the real file was `sync-claude-md.md`) — a leftover from an
incomplete Claude→Codex find/replace when `AGENTS.md` was first derived from
`CLAUDE.md`; `docs/specs/landing-page.md`'s three `repo/landing/index.html`
references (that page isn't built yet, so zero runtime risk); and
`.claude/commands/maintain.md` scoping its ponytail-audit to `repo/src/`
instead of `src/`.

Also cut the ~80%-duplicated content between `CLAUDE.md` and `AGENTS.md`:
`AGENTS.md` previously repeated the entire Architecture section, Standing
CSS/layout lessons, and Supabase schema section verbatim (differing only by
a "Claude Code"/"Codex" swap). `AGENTS.md` is now a short pointer — required
reading order (`AGENTS.md` → `CLAUDE.md` → `docs/WORKFLOW.md` → assigned
ticket → originating spec → relevant code/tests) plus Codex's concrete
constraints (one ticket at a time, don't invent requirements, don't expand
scope, don't weaken tests, don't refactor unrelated code, inspect the
complete diff, report verification performed and unresolved risks) — instead
of a duplicate of `CLAUDE.md`. `CLAUDE.md` gained an explicit "Claude Code's
role" framing (clarify → investigate → spec → tickets → independent
read-only review; stop after `Ready` tickets unless asked to implement)
consolidating language that was previously split across both files.
`docs/WORKFLOW.md` needed no path fixes (it was already repo-relative
throughout) — only a step-3 heading tweak ("Implement and verify one ticket
with Codex") to make the verify stage explicit in the lifecycle text.

Verified: `npm test` (172/172) and `npm run build` re-run after every edit;
grepped the whole repo (excluding this changelog, which stays historical
narrative and was left untouched) for any remaining `` `repo/ `` reference
in a doc or `.claude/commands/*` file — none found.

## WI-004: Apple-style swipe actions on transaction rows

Requested directly: make transaction rows' swipe-to-reveal actions look and
feel more like iOS's native swipe actions. Went through eleven live-checked
revisions in one continuous pass before landing — see
`docs/specs/swipe-to-reveal-transaction-actions.md`'s Revisions 4-11 for the
full blow-by-blow; this entry summarizes the shipped result and the notable
defects caught along the way.

**Shipped design**: Edit and Delete are 40×40px solid-color circles
(`var(--color-expense)`/white for Delete, `var(--color-border)`/
`var(--color-text)` for Edit) matching the category icon avatar's own
sizing, draggable from anywhere on the row's content — `.tx-row-inner`
(icon + category + note + amount) translates as one rigid block via
`transform: translateX()`, clipping at the row's own edge rather than
squeezing text, with `.tx-row-actions` repositioned as an independent
sibling behind it. Dragging past the normal-open point (`REVEAL = 108`)
grows Delete from its resting circle into a pill then a full-row bar as the
drag approaches a 65%-of-row-width commit threshold, where releasing fires
the existing `deleteTx`/Undo-toast flow immediately (no new confirm
dialog). Both circles pop in independently as the row first opens (each
gated by its own position, not a shared progress value) with a
"never-render-more-than-actually-revealed" scaling rule applied
consistently through every phase of the drag, including the full-bar
growth — plus a small `var(--space-xs)` resting margin so the fully-
expanded bar never sits flush against the row's edges or leaves a sliver
of leftover content peeking out.

**Two real defects caught and fixed during this pass, worth remembering**:
1. A first-pass e2e test used `page.mouse.move()`/`down()`/`up()` to
   simulate a touch drag. Playwright's synthetic mouse events carry
   `pointerType: "mouse"`, which fired the row's pre-existing (unrelated)
   desktop hover-to-reveal handler before the drag even started, silently
   pre-opening the row and pushing the test's own drag past the delete
   threshold — deleting the row and breaking every assertion after it. Any
   e2e test simulating a touch gesture on this component must dispatch
   synthetic `pointerType: "touch"` `PointerEvent`s directly, never
   `page.mouse.*`.
2. Reintroducing a "content slides to reveal a panel behind it" shape (this
   app tried and abandoned that exact shape once before, per this file's
   earlier swipe-to-reveal history) needed care to avoid repeating the
   original click-swallowing/icon-clipping bugs: the fix was making the
   *entire* sliding content box (`.tx-row-inner`) the thing that
   transforms, as one unit — a CSS transform moves an element's hit-testing
   region together with its paint, so there's no leftover untransformed
   parent to swallow clicks the way a narrower child sliding under a wider
   static parent once did.

Verified live in a real browser at essentially every revision (Playwright
against a served `dist/` build, not just visual screenshots — including a
real `.click()` after a real drag to prove the click-swallowing regression
class didn't return, and zoomed-in screenshots at fine-grained drag offsets
to catch two separate "renders larger than actually-revealed space" defects
that were invisible at a glance but showed up plainly once inspected
closely). `npm test` (172/172) and `npm run test:e2e` (17/17, including a
new test covering the whole-row touch drag, click-through, and full-swipe
commit) both green throughout.

## Type-selector icon/color spec, and confirming the Add-sheet keyboard-open ghosting bug

Two things reported together in one message: "why type selector doesnt use
chips ui like categories and account" (a question, investigated and
answered directly) and a screenshot showing stray "Expense/Income/Transfer"
text rendering above the Add sheet's drag handle. Followed the clarify →
spec → ticket workflow, one question at a time, before touching anything.

**Type selector stays a segmented control, not chips** (WI-006,
`docs/specs/type-selector-icon-color.md`): confirmed this matches how
comparable apps (Money Lover, Wallet, Monefy) handle a fixed 2-3-value
enum — chips are for Category/Account's open-ended, growing lists. The
real, fixable mismatch is that Type has no icon/color while Category/
Account do. Fix: add icons reusing this app's *own* existing conventions
(`arrow-down-left`/`arrow-up-right` already used for income/expense on
Home's stat cards, `arrow-right-left` already used for transfer rows) and
extend `rowTone()` (`categories.js`) to a genuine three-way split instead
of its current income-vs-everything-else shape — a real, separate latent
bug this surfaced: `rowTone("transfer")` has always silently fallen into
the same branch as `rowTone("expense")`, the exact "three-way type
branching" mistake `CLAUDE.md` already warns about, just never visible
until something needed to render all three side by side.

**The ghosting bug required a real device to confirm, not just code
reading** (WI-007, `docs/specs/add-sheet-keyboard-open-ghosting.md`).
First attempt: manually replicating `syncSheetToViewport()`'s exact effect
in a desktop Chrome devtools session (setting the same backdrop/sheet
inline styles it would compute for a shrunk `visualViewport`) did **not**
reproduce anything — the sticky header stayed correctly positioned. That
ruled out the resize math as the culprit, but desktop Chrome has no real
on-screen keyboard to test the actual trigger. The user recorded their
phone reproducing it (`/watch` skill, frame-extracted at 2fps/1024px);
frames confirmed the Type field's segmented-control content (text, then
just its background pill) paints above the sheet's own rounded top edge
and above the sticky header for roughly 1-1.5 seconds while the keyboard
is opening after the Note field is focused, self-correcting once the
keyboard settles. Root cause is narrowed to the interaction between
`syncSheetToViewport()`'s synchronous inline-style resize on
`visualViewport resize` and the browser's own native scroll-focused-
input-into-view happening at the same moment (the exact interaction
`syncSheetToViewport()` was originally written to tame) — not yet pinned
to the precise paint/compositor mechanism, left for implementation with
real on-device inspection. **Lesson for future sessions**: any bug tied to
`visualViewport`/on-screen-keyboard behavior cannot be verified by
resizing a desktop browser window or devtools device-mode — it needs a
real device or an emulator with a genuine virtual keyboard.

No code changed this pass — both items are `Ready` tickets
(`docs/tickets/active/WI-006.md`, `WI-007.md`) awaiting Codex
implementation.

## WI-006 implemented: Type-selector icons/colors, and a dark-mode contrast trap the spec walked into

Codex (GPT-5.6 Terra, medium — the ticket's `terra-medium` profile)
implemented WI-006 (`docs/tickets/completed/WI-006.md`); Claude reviewed read-only in
a real browser. Icons landed as specced (`arrow-up-right`/
`arrow-down-left`/`arrow-right-left`, reusing Home's and `tx-row.js`'s own
existing conventions) and `rowTone()` became a genuine three-way branch.

**The spec's own acceptance criterion contained the bug.** It called for
`--color-chart-5` as the transfer foreground on a `--color-chart-5-tint`
background. Measured on the rendered control, the active segment came out
at expense 4.89:1, income 4.86:1, transfer **1.66:1** in dark mode (and
4.24:1 in light, also under AA). Cause: `theme.js:67` brightens
`--color-chart-5` to `#4fd6c4` for dark mode, while every `*-tint` token
here mixes toward *white* in both themes — so the foreground got lighter
while its background stayed near-white. `styles.css`'s
`--color-income-tint-fg` comment documents this exact trap and the exact
fix, and the spec still walked into it. Resolved with a fixed,
theme-invariant `--color-chart-5-tint-fg: #17665c` (5.78:1 light / 6.32:1
dark), the same pattern income already used.

**Lesson: a screenshot is not a contrast check.** All three segments
looked fine at a glance in both themes; the failure only appeared once
`getComputedStyle` values were run through a real WCAG ratio. Any new
`tint`/`tint-fg` pairing in this repo should be measured, not eyeballed —
`e2e/type-selector-icon-color.spec.js` now does exactly that, in both
themes, as a standing regression.

**Two smaller findings from the same review.** `add.js`'s
`renderCommitPreview()` turned out to be a third `rowTone()` caller the
pre-spec grep missed, so the mobile Add sheet's commit-preview avatar goes
teal for transfers too (expected, no code change of its own — reported
rather than folded in, per the ticket's Out of scope). And the maintainer
flagged that the three segments sat too far apart on the desktop form:
`.tabs.block`'s `justify-content: space-between` with `flex: 0 1 auto`
cells spread three content-sized pills across the full row. Fixed with
equal-width cells scoped by `.tabs.block:has(.type-tab-opt)` so no other
tab row changes — the `styles.css` comment arguing for content-sized cells
is about rows with uneven labels ("All" beside "Transfer"), which this row
doesn't have.

**Process note:** the ticket's ~310-320px narrow-width check could not be
done by hand — browser window resizing wouldn't take in the review
environment (the window stayed maximized), so only full width was ever
observed. Rather than keep retrying it manually, it became a Playwright
viewport test alongside the contrast assertions. Also worth knowing for
future browser-driven review here: this app blurs itself via
`applock-ui.js`'s `visibilitychange` handler whenever the tab isn't
visible, which makes automated screenshots of a background tab useless
until the `app-blurred` class is neutralized.

`npm test` (173/173), `npm run test:e2e` (18/18), and `npm run build` all
green, re-run independently of Codex's own reported run.

## WI-007: the Add-sheet keyboard-open ghosting, and what two failed clips taught

**Fixed, device-confirmed.** The symptom: for ~1-1.5s while the on-screen
keyboard animated open, the Add sheet's Type content painted *above* the
sheet's own rounded top edge and above its sticky header, over the dimmed
backdrop. It self-corrected once the keyboard settled.

**Attempt 1 (`contain: paint`, `81cb197`) failed — and the failure is the
most useful thing in this entry.** The theory was that content from a
previous layout was escaping the sheet's overflow clip during the resize.
Paint containment was scoped to the Add sheet, shipped, and the maintainer
reproduced the ghosting completely unchanged. That is a *strong* negative
result rather than a wasted round: with paint containment active it is
spec-impossible for a descendant to paint outside its box, so the artifact
could not be content escaping a clip. It had to be **a stale composited
frame of the sheet from an earlier moment** — which no clipping CSS can
touch. Every fact fit that: no desktop repro, self-corrects at the next
full repaint, survives several extracted frames, immune to containment.

**Attempt 2 (`cc5005f`) fixed it by splitting one element's three jobs.**
`.filter-sheet` was simultaneously the `overflow-y: auto` scrollport, the
box `syncSheetToViewport()` mutates inline during the `visualViewport`
resize, and the box Chrome runs native scroll-into-view on when a field is
focused — all three at the same instant. Now the sheet is a non-scrolling
shell, an inner `.sheet-body` is the only scrollport, and the header is a
plain non-scrolling sibling (`position: relative`, still the containing
block for `.sheet-grabber`). The inline `max-height` deliberately stays on
the outer shell: **if it moved to the body, the resized box and the
scrolled box would be the same element again and the whole change would be
cosmetic.** Applied to all six sheets, which needed markup — only Add
(`#addForm`) and Import (`#importSheetBody`) already had a single body
element; Export, Insights, Settings/Manage and Transactions rendered loose
sibling `.field` blocks directly under `.filter-sheet`.

**Then attempt 2's own regression (`3fa3c56`), reported with a phone
photo.** Making `.sheet-body` the scrollport made it the clip box, and it
had no padding of its own where the old scroller had 20px. Anything
painting outside a child's border box got sliced: `.input-wrap:focus-within`'s
`outline: 2px solid` + `outline-offset: 1px` lost its left/right segments,
and chip rows were cut mid-pill at the body's top edge — 16px below the
header divider, with bare card background above, where the old sticky
header used to hide that cut behind its opaque background. Fixed with
matched negative margins and padding on `.sheet-body`, extending its clip
box to the shell's edges without moving any content.

**Lesson: a failed fix that rules out a whole class of cause is worth
shipping.** Three rounds of static code reading never distinguished "content
escaping a clip" from "stale composited frame"; one deployed no-op did it in
minutes. When a bug only reproduces on real hardware, an experiment that can
*falsify* a mechanism beats more reasoning about the code.

**Second lesson: check that a check can fail.** Round 1's review caught an
e2e assertion (`type.bottom <= header.top || type.top >= header.bottom`)
that the buggy state itself satisfied — content painting above the header
meets the first disjunct — so it could never have failed for this bug.
`getBoundingClientRect()` reports layout geometry and never paint clipping,
so no DOM assertion can observe this symptom at all; the spec now says so
plainly instead of implying coverage. The final clipping fix was verified
the opposite way: measured in a real browser at phone width, *and* confirmed
falsifiable by zeroing the new margin/padding to reproduce the clip.

Two dead ends recorded in `docs/specs/add-sheet-keyboard-open-ghosting.md`
so nobody burns a round on them again: desktop resize simulation does not
reproduce this bug, and `contain: paint` does nothing for it.

`npm test` (173/173), `npm run test:e2e` (24/24 — the ghosting spec grew
from 1 test to 6, one per sheet), and `npm run build` all green, re-run
independently of Codex's own reported runs.

## WI-005: Apple-style swipe actions on Settings' Manage rows, and a ticket that specified a design that never shipped

Carried WI-004's transaction-row swipe language over to Settings' Manage
rows (Budgets/Bills/Goals/Categories/Accounts): 40px circular Edit/
Delete(/Archive) matching the category icon avatar, a whole-row drag
surface, and full-swipe-to-delete with the pop-in/grow animation.

**The ticket was stale before it was ever dispatched, and that cost a
full Codex run.** WI-005 was written before WI-004 landed, so its
acceptance criteria encoded an early *draft* of WI-004 — full-height
rounded rectangles at `actionCount * 64` reveal width. WI-004 then went
through eleven live-checked revisions and shipped the opposite: 40px
circles at a `12 + n*40 + (n-1)*4` reveal (96px at n=2, matching
`tx-row.js`'s `REVEAL = 96`). The first Codex run faithfully implemented
`border-radius: var(--radius-md)` full-height rectangles, exactly as
specified and exactly wrong. Codex even noticed mid-run — "the ticket and
the currently checked-in spec conflict" — and proceeded on the ticket's
authority anyway. That run was cancelled and reverted, the ticket was
re-derived from the shipped source, and it now carries a standing rule:
`tx-row.js` is the reference, and where the ticket prose and that code
disagree, the code is right.

**Standing lesson: when a ticket's job is "carry over what another ticket
established," the dependency's shipped code is the specification and the
ticket text is a stale summary of it.** A ticket that says "reuse the
finalized colors and sizing from X" while also hardcoding its own guesses
at those colors and sizing is self-contradictory, and the implementation
agent will follow the hardcoded guesses. Re-derive before dispatching.

The same staleness had already propagated into the code. `manage-row-swipe.js`'s
leading comment claimed the reveal worked "the same proven way tx-row.js
already validated: growing a real flex box's width, never an overlaying
positioned layer" — untrue of `tx-row.js` since WI-004, which absolutely
positions the actions *behind* an opaque content layer that translates
over them. The module had faithfully implemented a stale description of
its own reference, which is why Manage rows *squeezed* their text while
transaction rows *slid*. Fixed, and the comment now describes the real
mechanism.

Three defects found by independent review, all caught live rather than by
reading the diff:

1. **Full-swipe left Accounts' Archive button stranded.** The CSS rule
   named `.manage-swipe-edit` specifically, but Accounts has three
   actions. Measured mid-swipe: Edit `opacity: 0`, Archive `opacity: 1`
   as a 40x40 circle sitting on top of the row, Delete grown to 118px.
   Generalized to `:not(.manage-swipe-delete)` so a fourth action would
   be handled too. `tx-row.js` still carries the same Edit-specific
   selector; harmless at two actions, would resurface at three.
2. **The row squeezed instead of sliding** (the mechanism bug above),
   reported by the maintainer against the shipped transaction behavior.
3. **The Delete pill could never reach full width.** `pointermove`
   applied square-root rubber-band damping past the reveal point —
   leftover from the original swipe-to-reveal, where past-reveal was
   meaningless over-drag slop. Once past-reveal became the full-swipe
   *grow* regime, that resistance throttled the animation. Measured on a
   314px Accounts row against a 298px target: dragging to the left screen
   edge, the most a real finger can do, reached only 154px; reaching 298px
   needed ~2342px of travel, six screen widths. Mathematically
   unreachable. `tx-row.js` damps only the negative direction
   (`raw < 0 ? -Math.sqrt(-raw) * 2 : raw`), leaving leftward drag linear;
   deleting the extra branch fixed it. After: 298/298px on both the 2- and
   3-action cases.

**Lesson: for motion work, verify the magnitude, not the direction.** The
review that missed defect 3 had confirmed live that the pill *grew* and
stopped there — an assertion the broken state satisfies. The whole e2e
suite passed throughout, because `endDrag` tests the raw un-damped offset
while only the visual was damped: the delete committed correctly while
looking unfinished. The new regression test asserts the pill reaches
within 20px of the row's full width, and deliberately bounds the drag to
65% of the row from a 0.9 start fraction, since a synthetic pointer event
can dispatch a multi-screen drag no finger could produce and fake a pass.

`npm test` (173/173), `npm run test:e2e` (26/26), and `npm run build` all
green, re-run independently of Codex's own reported runs. Live-verified at
390px across all three row shapes — list rows (2 actions), Accounts
(3 actions), and Goals' card variant: content width unchanged during drag,
`translateX(-offset)` applied, opaque background, every non-Delete action
hidden during full swipe, and the pill reaching its full target width.


## Settings: ChatGPT-style sub-page navigation and visual language (WI-008, WI-009)

The first two tickets of `docs/specs/settings-chatgpt-style-navigation.md`,
shipped together. This reverses the "drill-down sub-pages explicitly not
chosen" decision recorded in `settings-redesign-concept-b.md` — reversed
deliberately by the maintainer during the spec interview, with a reference
screenshot.

**WI-008 — navigation model.** Settings' five Manage sections and Security
stopped being inline `<details>` accordions and became real sub-pages with a
back arrow. `state.settingsActiveSection` was replaced by a single
responsive field, `state.settingsSubPage` (default `null`), and
`state.settingsGroupOpen` was deleted along with its `toggle` listeners.
Below 1024px `null` renders the root list and a section id renders one
sub-page; at 1024px+ the identical field selects the desktop master–detail
pane, with `null` selecting Display. This is the app's first
`pushState`/`popstate` handling, deliberately scoped to Settings sub-pages:
opening one pushes `{ settingsSubPage: id }` with **no URL argument**, so the
URL never changes, and the `popstate` handler is the single place that clears
the field and re-renders. Both the back arrow and a main-tab switch away only
call `history.back()`. Desktop never pushes history and never shows a back
arrow.

The ordering race between the back arrow, the hardware Back button and a
main-tab switch was the reason this ticket carried the `sol-high` profile,
and it was verified live rather than reasoned about: opening a sub-page,
switching to Home, then pressing Back leaves the app on Home with
`history.state` already `null` and no jump back into Settings.

**WI-009 — visual language.** A centered 72px profile header replaced the
screen title and the left-aligned profile row; sign-out moved out of the
header into a red Log out row at the bottom, rendered only when signed in.
The root list is grouped into separate rounded cards in a deliberate
hierarchy — Display, then Sync & Data, then Manage, then an unlabeled
App lock + Privacy policy card, then Log out — on the reasoning that
everyday appearance settings come first, data and device settings next, the
record types the user manages after that, and rarely-touched account, legal
and exit rows last. The privacy policy stopped being a footer text link and
became a real row. Settings' own chrome rows dropped `iconAvatar()`'s tinted
circle for a flat `icon()` glyph, while the Budget/Bill/Goal/Category/Account
*data* rows inside each sub-page kept their avatars, where the tint encodes
real category data rather than decoration.

**A contrast defect the implementing agent's own measurement missed.** WI-009
requires 4.5:1 for text, and the agent reported "4.66" as passing. That figure
was the row *icon* measured against the white card — but the section labels
sit **above** the cards, on the page background (`--color-bg`, `#f6f6f8`),
which is darker. Measured against the surface they actually render on, the
labels came to **4.32:1**, below the threshold. Fixed by darkening only that
label toward the text color, `color-mix(in srgb, var(--color-muted) 92%,
var(--color-text))`, which adds no new hardcoded color: the palette has no
intermediate step, since `--color-tertiary` is lighter and worse and
`--color-text` is far too heavy for a small uppercase label. Light went
4.32 → 4.82, dark 6.98 → 7.56.

**Lesson: measure a color against the surface it actually renders on, not
the nearest card.** `settings-spacing-and-contrast.md` already recorded one
shipped contrast bug from pairing an inverting token with a non-inverting
background; this is the same family, caught only because the verification
walked up the DOM for the first opaque ancestor instead of assuming the card.
A second trap: `color-mix` computes to CSS `color(srgb …)` whose components
are 0–1, not 0–255, so a contrast script that assumes `rgb()` silently
produces nonsense for this label.

`npm test` (173/173), `npm run test:e2e` (27/27) and `npm run build` all
green, re-run independently of the implementing agent's own reported runs —
which mattered, because those runs did not complete: one died on a provider
usage limit before verifying anything, and the others reported e2e as failed
when the suite in fact passed. See `WI-012` for that.

## A UX/design-system documentation layer (docs/UX.md)

Requested directly: add a durable UX/design reference so future
Claude → Codex UI work stays visually and behaviorally consistent, with the
governing rule **existing canonical pattern > new pattern**. Explicitly an
audit + documentation + workflow pass — no application code, CSS, or theme
values were touched, and the pass was required to report its audit and stop
for approval before editing anything.

The important constraint was the second half of the brief: **do not assume
every existing pattern is correct.** The job was to separate the real reusable
design language from accidental drift, and to refuse to tokenize the drift.

**What the audit found.** The color layer is already coherent and worth
protecting: `styles.css`'s `:root` holds only the pre-JS first-paint fallback,
`theme.js`'s `applyTheme()` is the runtime owner of everything that varies by
theme or accent, and JS modules reference colors as `var(--token)` strings
rather than hex. That split, plus the `-tint-fg` theme-invariance rule WI-006
paid for, is now written down as a rule instead of surviving only as CSS
comments. The interaction layer is similarly consistent — one sheet anatomy,
one row anatomy, one swipe pattern, no `confirm()` dialogs anywhere.

The *dimensional* layer is where the drift is. `--space-lg: 20px` is specified
in `docs/specs/home-spacing-scale.md`'s Decision 1 and **was never actually
defined in `:root`** — so the scale has a hole exactly where the most-repeated
large value sits (20px appears 13 times as a raw literal). Spacing tokens are
used in roughly a tenth of the rules, and the comment claiming they are
"Home-only for now" is stale, since Transactions and Settings now use them too.
There are no typography tokens at all across sixteen distinct font sizes,
including three unexplained fractional ones. Three rule bodies are
**byte-identical**: the two chip families, their two row wrappers, and — the
risky one — the transaction and Manage swipe-action rules, which WI-005
declared must never differ.

**Two real accessibility defects surfaced and were deliberately left
unfixed**, since this pass was documentation-only. The mobile tab bar's five
buttons have no accessible name at all: they went icon-only in the tab bar
polish pass, their SVGs are `aria-hidden`, `renderChrome()` only fills
`span[data-l]` elements the mobile bar no longer has, and no `aria-label` was
added in their place — so a screen reader gets five unlabeled buttons. Second,
`.tab-opt`'s real radio input is `opacity:0; width:0; height:0` with no
`:focus-visible` rule on the visible label, so all six segmented controls are
keyboard-focusable with no indicator; the same is true of `.switch`,
`button.toggle-row`, and `.nav-btn`. Both are recorded under Known UI debt and
ranked **above** cosmetic token normalization.

**Eight decisions were left open on purpose.** The spacing scale's shape (the
heavily used 6/10/14px values fit neither the current linear scale nor a
doubling one), card interior padding, icon-button sizes, the duplicate chip
families, the fractional font sizes, the sheet's untokenized corner radius,
whether the accent should keep doubling as the expense hue, and whether
"no confirm dialogs, Undo instead" is inviolable. Each is subjective or
identity-changing rather than architectural, so `docs/UX.md` names the tension
and stops. **The standing lesson this pass is built around: the correct order
is audit → identify canonical → approve decisions → document → tokenize →
refactor. Tokenizing first would have permanently encoded the inconsistency
as the system.**

**Workflow integration** left the Claude → spec/tickets → Codex → Claude review
loop untouched and added only pointers: read-order entries in `CLAUDE.md` and
`AGENTS.md`, a `## UX constraints` requirement for UI specs, a UX comparison in
the review step, and an optional `## UX / design references` section in
`docs/tickets/TICKET_TEMPLATE.md` whose load-bearing line is
`New design primitives required by this ticket: none` — an explicit `none`
turns any new primitive appearing in the diff into a reviewable defect. The
review step also gained an explicit classification rule: **a violation of a
documented `docs/UX.md` rule is a defect; an undocumented subjective preference
is a suggestion and never a blocker; a finding that turns on one of the open
decisions is neither, and goes to the maintainer.** That rule exists so a
reviewer can't promote personal taste into a merge blocker.

`docs/UX.md` landed at 309 lines against a requested 150–250. It was compressed
twice and three restatements of `docs/ARCHITECTURE.md` content were converted
to pointers; going lower would have meant deleting canonical rules or the
one-clause reasons that make them followable, so the overshoot was flagged
rather than absorbed silently.

Verification for a documentation-only change: `npm test` (173/173) and
`npm run build` both green, and an empty `git diff` across `src/`,
`styles.css`, `index.html`, `e2e/`, `tests/`, `docs/SOT.md`, and this file's
existing entries. `npm run test:e2e` was not run — no screen changed.

## WI-010: expand-in-place Appearance / Accent color / Language rows

The third ticket of `docs/specs/settings-chatgpt-style-navigation.md`. The
Display group's Appearance, Accent color, and Language rows turned into
disclosure rows: a collapsed row shows the current value as a subtitle plus
a `chevron-right` icon rotated 90°/-90° via CSS (down when collapsed, up
when expanded) rather than adding a new `chevron-down` sprite symbol, and
tapping it reveals the existing `.tabs`/`.tab-opt` radio control in place.
Row order now matches the spec's own mockup exactly — Appearance, Accent
color, Language, Hide amounts — which is a visible reorder from the
previous Language-first layout. Appearance is Light/Dark radio options
layered over the existing `state.dark` boolean; no new persisted field, and
expansion state is transient DOM state that resets on re-render by design
(not a revival of the deleted `state.settingsGroupOpen`).

**Two defects the implementing pass's own build+test run did not catch,
both found by checking real computed styles in a live browser rather than
reading the CSS.** First, `.settings-disclosure:has(+ .toggle-row) {
border-bottom: none; }` strips a divider from whichever disclosure row
sits immediately before a `.toggle-row` sibling — with the new row order
that's the **Language** row, not the actual last row (Hide amounts, which
the pre-existing `.toggle-row:last-child` rule already handles correctly).
The divider between Language and Hide amounts silently vanished. Second,
the accent-color dot hardcoded `#cd4805`/`#6247ea` per option, duplicating
`theme.js`'s `ACCENT.coral.base`/`purple.base` — the same values already
live in `--color-accent` at runtime. Since the dot only ever needs to show
the *currently selected* accent, it was simplified to
`background: var(--color-accent)` with no per-name classes at all, which
both fixes the duplication and removes a future drift risk if the theme's
base hex is ever retuned. Both fixes verified: `npm test` (173/173),
`npm run build`, and `npm run test:e2e` (28/28) green, plus the divider's
computed `border-bottom` re-checked live.

**Lesson worth carrying forward:** a CSS selector that reads as "remove the
divider before the next `.toggle-row`" is easy to misjudge as "remove the
divider from the last row" when the two coincide in an earlier row order —
they stopped coinciding the moment this ticket reordered the rows. Neither
`npm test` nor `npm run test:e2e` caught it because no test asserted divider
presence; only reading real computed style in the browser did.

## WI-012: make `npm run test:e2e` fail honestly when its browser is unavailable

Raised during WI-008/WI-009 review, where an implementing agent reported
the e2e suite as failed three times when it had in fact passed 27/27 from
the same tree — the agent's sandbox couldn't see the installed Playwright
Chromium, `python`, or write to `docs/tickets/active/`, three unrelated
capabilities failing together pointing at the sandbox rather than at
Playwright or this repository. `npm run test:e2e` now runs
`scripts/check-playwright-browser.mjs` after the build and before
Playwright starts: it launches Chromium through Playwright's own
resolution (honoring `PLAYWRIGHT_BROWSERS_PATH`) and, on failure, exits
non-zero with a message that states plainly that no tests were run, names
the expected browser path, and gives the exact `npx playwright install
chromium` command — without ever auto-installing anything itself.
`AGENTS.md` gained an "E2E sandbox limitation" subsection, cross-referenced
from `docs/TESTING.md`, recording that an agent which cannot launch the
browser must report e2e as **not run**, not failed.

**A defect the implementing pass's own verification did not surface.** The
preflight script imported `chromium` from `"playwright"` — a package this
repository never declares as a dependency (only `@playwright/test` is, in
`package.json`). It resolved only because npm hoists `playwright` into
`node_modules` as `@playwright/test`'s own transitive dependency; had that
dependency tree ever shifted, the script would have failed with a
confusing `MODULE_NOT_FOUND` instead of the clean message it exists to
produce — and it sidestepped the ticket's own "don't add a dependency"
constraint by leaning on an undeclared one instead. Fixed to import from
`"@playwright/test"` instead, confirmed to re-export the identical
`chromium` object with both `.launch()` and `.executablePath()` working —
a one-line change, no dependency added. Reverified with a real browser:
`npm test` (173/173), `npm run build`, and `npm run test:e2e` (28/28) all
green with the corrected import.

**Lesson worth carrying forward:** an import that resolves today isn't
proof it's declared — a flat `node_modules` will happily hoist a
transitive dependency into something that imports cleanly, right up until
the dependency tree that put it there changes.
