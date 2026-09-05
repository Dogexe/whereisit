# Architecture (`src/`)

Read this when touching `src/` code. For always-loaded invariants and
routing, see `CLAUDE.md`. For what's actually true about the product right
now, see `docs/SOT.md`. For sync/persistence/auth/schema, see
`docs/SYNC.md` instead — this file covers everything else.

The app is a hand-rolled SPA with no framework, fully split into modules
(this was a staged effort — see `docs/CHANGELOG.md`'s "Module-split status"
entry for the history, now complete). `main.js` is boot-only (~73 lines):
registers each screen's render function with the router, then kicks off
`loadFromStorage()`/`applyTheme()`/`renderScreen()`, wires the tabbar, sync
intervals, the Supabase auth listener, service worker registration, and PWA
install-prompt listeners. Everything else lives in `categories.js`,
`i18n.js`, `utils.js`, `state.js`, `storage.js`, `theme.js`, `derived.js`,
`sync.js`, `merge.js`, `pending.js`, `watermark.js`, `paginate.js`,
`account.js`, `accounts.js`, `import.js`, `toast.js`, `pwa-install.js`,
`error-report.js`, `push.js`, `sheets-export.js`, and `screens/`
(`router.js`, `tx-row.js`, `period-picker.js`, `manage-row-swipe.js`,
`import-sheet.js`, `home.js`, `transactions.js`, `add.js`, `insights.js`,
`settings.js`).

- **State ownership across modules**: `state.js` owns the `state` object and
  the mutable arrays `transactions`, `budgets`, `bills`, `goals`; `sync.js`
  owns `currentUser`; `pwa-install.js` owns `deferredInstallPrompt`. ES
  modules allow a consumer to *mutate* an imported binding but never to
  *reassign* it — every place that replaces one of these values wholesale
  calls a setter (`setTransactions`/`setBudgets`/`setBills`/`setGoals`/
  `setCurrentUser`/`setDeferredInstallPrompt`) instead of reassigning the
  imported binding directly, which would silently fail to propagate.
- **Cross-module callbacks and the registration pattern**: a genuine
  `import` cycle is avoided throughout this codebase on purpose. Two shapes
  handle "the callee needs something the caller module owns": a single
  callback (one function, registered once — e.g. `sync.js`'s old
  `setSyncRerenderCallback`) when exactly one function needs injecting, or a
  **registration pattern** (`router.js`'s `registerRenderers({ home,
  transactions, add, insights, settings })`, called once from `main.js`'s
  boot) when more than one function needs injecting and the dependency
  direction would otherwise have to go both ways. `router.js` itself has
  zero static imports of any `screens/*.js` file — it dispatches through the
  object it was handed at runtime — so it stays a true leaf every screen can
  safely import `setTab`/`renderScreen` from.
- **Screens** (`screens/home.js`, `transactions.js`, `add.js`, `insights.js`,
  `settings.js`): `renderScreen()` (`screens/router.js`) dispatches on
  `state.tab` to one `render<Screen>()` function per tab. Each fully
  replaces `$("screen").innerHTML` with a template string, then wires up
  event listeners on the fresh DOM and calls `refreshIcons()` at the end —
  no diffing, full re-render per screen change. `screens/tx-row.js` holds
  `txRowHtml`/`wireTxRowActions`, shared between Home's recent-activity list
  and the full Transactions list. Each row splits into `.tx-lead`
  (icon+category+note, fixed `flex:1`) and `.tx-trail-group` (amount +
  Edit/Delete, joined into one `flex-shrink:0` unit whose own `width` is
  animated directly — a deliberate exception to "animate transform only":
  expanding an actual layout `width` is what lets `.tx-lead` reclaim the
  row's full width at rest instead of always reserving room for buttons it
  isn't showing). Below `1024px`, Add/Edit opens as a bottom sheet
  (`#addSheetContainer`, `openAddSheet()`/`closeAddSheet()`) rather than
  navigating `state.tab`; at `≥1024px` (`isDesktopShell()`, `utils.js`) it's
  still the full-page form. Settings' Manage sections
  (Budgets/Bills/Goals/Categories/Accounts) use the same swipe-to-reveal-
  actions pattern as transaction rows below `1024px`
  (`screens/manage-row-swipe.js`, `manageRowHtml()` branches on
  `isDesktopShell()`), and their add/edit forms render into a shared,
  reactive `#manageSheetContainer` (`renderManageSheet()`, called at the end
  of every `renderSettings()`, scanning the relevant `*EditId`/
  `*ContributeId` state fields) rather than desktop's inline forms.
  Settings' `<details>` groups mirror open/closed state into
  `state.settingsGroupOpen` (not persisted) so a re-render from
  saving/deleting an item doesn't snap the group shut. **Reminder**: a
  closed `<details>` renders no non-summary content at all regardless of any
  CSS `display` override — `getComputedStyle` will even report `display:
  block` on the non-rendering child, which makes this easy to misdiagnose.
  To force one open programmatically, set the element's real `.open`
  property directly.
- **Bottom sheets** (six of them: Add/Edit, Transactions Filters, Insights
  Filters, Settings' Manage sheet, Settings' Export sheet, Import): all
  share `.filter-sheet-backdrop`/`.filter-sheet`/`.filter-sheet-header`
  (`styles.css`) and three `utils.js` helpers rather than each hand-rolling
  its own modal plumbing. `createFocusTrap()` handles Tab-cycling *and*,
  piggybacked into the same `activate()`/`deactivate()` calls, background
  scroll-lock (`overflow: hidden` on `body`+`documentElement` — this app has
  no separate scrolling container, the whole document scrolls) — every
  sheet already calls exactly those two methods at exactly the right
  open/close moments, so nothing else needs a second call site.
  `sheetGrabberHtml()` renders the drag-handle pill as the header's first
  child (`position: absolute` inside the header's own `position: sticky`
  box); `wireSheetDrag(handle, sheetEl, onDismiss)` wires an actual
  swipe-down-to-dismiss gesture to it, mirroring `tx-row.js`'s
  pointer-capture/rubber-band-clamp technique adapted to one vertical axis.
  Every `role="dialog"` sheet also carries `aria-modal="true"`. Two
  different wiring lifecycles exist and matter if you add a seventh sheet:
  most sheets' markup persists in the DOM (toggled by a `hidden` attribute)
  and wire their close/drag handlers once; Insights' Breakdown filter sheet
  and Settings' Manage sheet fully regenerate their markup on nearly every
  interaction, so *their* drag-wiring has to live inside the same re-render
  function that already re-wires their close button and focus trap, not a
  one-time setup call. `createFocusTrap()`'s `activate()` also calls
  `syncSheetToViewport()` (also piggybacked, same reasoning as
  scroll-lock), which sizes the open backdrop/sheet to
  `window.visualViewport` instead of the static `inset:0`/`80vh` CSS —
  without this, opening the on-screen keyboard (which shrinks only the
  *visual* viewport on most mobile browsers, not the *layout* viewport
  `vh`/`fixed` are relative to) made the browser's native "scroll focused
  input into view" behavior drag the sheet's own sticky header off-screen
  along with it. A module-level `visualViewport` `resize`/`scroll` listener
  keeps this synced live while a sheet stays open across an actual keyboard
  show/hide, not just at the moment it opens.
- **i18n** (`i18n.js`): `STRINGS` is `{ key: [th, en] }`; `LANGS.th`/
  `LANGS.en` are derived from it and `L()` returns the active language's
  dict. Add new user-facing text as a new `STRINGS` entry, not an inline
  literal.
- **Categorization** (`categories.js`): `CATEGORY_KEYWORDS` maps
  Thai/English substrings to a category id (resolved once against the fixed
  `DEFAULT_CATEGORIES` list at module load, never the live renamable
  `categories` array), checked against the note field as the user types
  (`guessCategory`). `state.categoryManual` stops re-guessing once the user
  has picked one manually. Categories are full user CRUD (rename/icon/
  delete, including built-ins), synced across devices, with a pre-delete
  "in use" guard — see `docs/specs/custom-categories.md`.
- **Accounts** (`accounts.js`, `derived.js`'s `computeBalance`/
  `defaultAccountId`): every transaction belongs to exactly one account
  (`account_id`), with an opening balance for real bank/card-statement
  reconciliation. Transfers between the user's own accounts are `type:
  "transfer"` transactions using `account_id` (from) + `to_account_id` (to)
  rather than two linked rows. **Any code branching on transaction type must
  handle all three types explicitly (income/expense/transfer)** — a
  two-way ternary that defaults to "not X" is a latent bug the moment
  transfer exists as a third case; this has bitten `computeBalance()`,
  `filteredTxList()`, and a filter-chip label function, all now fixed with
  explicit three-way handling. See `docs/specs/multi-account-support.md`
  and `docs/specs/account-transfers.md`.
- **CSV import** (`import.js`, `screens/import-sheet.js`): a pure,
  RFC4180-ish CSV parser plus a multi-step (file → column mapping → review →
  commit) sheet flow. Category resolution: an exact name match on a mapped
  Category column resolves via `findCategoryId`; no match keeps the raw text
  with `categoryId: null` (degrading like any stale/renamed category); no
  column mapped falls through to `guessCategory`. Dedupe is per-account,
  decided by the *caller*, not baked into `buildImportPlan`. Never
  auto-creates categories or imports transfers. See
  `docs/specs/csv-import.md`.
- **Derived data** (`derived.js`): all the pure computations screens read
  from — `computeBudgets`, `computeBreakdown`, `computeBalance`,
  bill-due-date math, sparkline/pie-chart SVG builders. Pure meaning no side
  effects; if a function needs to render, toast, save, or sync, it doesn't
  belong here (see `markBillPaid`, in `screens/home.js` for exactly this
  reason). `localDateIso()`/`localMonthKey()`/`localIsoFromDate()`
  (`utils.js`, re-exported as `monthKeyOf` from `derived.js`) are the
  canonical "today"/"this month" helpers — every "today" computation must
  go through one of these, never `new Date().toISOString().slice(...)`,
  which converts to UTC first and reads as yesterday for several hours
  after local midnight for any user east of UTC (e.g. Bangkok). `state.js`
  is a deliberate, narrow exception (it can't import `utils.js` without
  creating a circular import) — it computes its own local-date defaults
  inline.
- **Error reporting** (`error-report.js`): global `window` `error`/
  `unhandledrejection` handlers, fire-and-forget inserts into a Supabase
  `error_logs` table, capped at 20 per page session. Deliberately no read
  access from the app's own key — read via the Supabase dashboard.
- **Bill reminders** (`push.js`, a Supabase Edge Function + `pg_cron`):
  `enableBillReminders()`/`disableBillReminders()` only ever fire from a
  real click handler, never on load. `supabase/functions/send-bill-
  reminders/index.ts` ports `derived.js`'s `nextBillDueDate`/
  `daysUntilBillDue`/`billDueCycle` **verbatim**, kept in sync by hand — its
  own doc comment says so. VAPID keys live in Supabase Vault, never
  committed; the public key is a plain constant in `push.js` (not a secret,
  same treatment as `SUPABASE_ANON_KEY`).
- **PWA shell**: `manifest.json` + `sw.js`. Network-first for same-origin
  GET requests, explicitly ignores cross-origin requests (Supabase, the
  supabase-js CDN, Google Identity Services). Bump `CACHE_NAME` in `sw.js`
  when cached app-shell files should be invalidated on next deploy —
  currently `v3`. Icons are self-hosted (`icons/sprite.svg`, inline `<use>`
  symbols) and fonts are self-hosted (`fonts/inter-latin.woff2` +
  `fonts/notosansthai-thai.woff2` — Inter has no Thai glyphs at all,
  confirmed against Google Fonts' own served subsets, so Thai needs its own
  family) — both were previously CDN-loaded and unreachable offline before a
  first successful online load. Supabase JS stays CDN-only (sync can't work
  offline anyway). **`icons/sprite.svg` is a real XML document — a comment
  containing `--` silently truncates the file and stops every icon from
  rendering with zero console error.** This has broken the file more than
  once; always re-verify with a real XML parser after editing it, never
  just by eye.
- **Google Sheets export** (`sheets-export.js`): `GOOGLE_SHEETS_CLIENT_ID`
  (public, not a secret) + Google Identity Services for an OAuth token
  scoped to `drive.file` only, entirely separate from `sync.js`'s Supabase
  Google sign-in. GIS is loaded on demand (`loadGisScript()`), not eagerly.
  Always creates a brand-new spreadsheet via plain `fetch()` against the
  Sheets API v4 REST endpoints, each with an explicit `AbortController`
  timeout.

## Standing CSS/layout lessons

Worth remembering before touching swipe/reveal interactions or grid layouts
again — full incident narratives are in `docs/CHANGELOG.md`, these are just
the rules that came out of them:

- **Sliding revealed content into view (clipped by `overflow: hidden`) is
  more robust than sliding something else away to uncover a stationary
  layer underneath it.** A stationary panel uncovered by a sibling sliding
  away needs careful stacking-order (`pointer-events`/z-index) and
  reserved-width bookkeeping to avoid swallowed clicks and clipped icons;
  sliding the revealed content itself avoids both bug classes by
  construction.
- **`transform` never changes a sibling's reserved layout space.** If a
  reveal needs a flex sibling (like `.tx-lead`) to actually reclaim width
  when the revealed panel is closed, animate a real layout property
  (`width`) on the revealed panel instead of `translateX` — this is a
  deliberate, documented exception to "animate transform only."
- **Wrap every bare `Nfr` desktop grid column in `minmax(0, Nfr)`.** A bare
  `fr` track's minimum width defaults to `auto` (its content's min-content
  size), so one wide descendant anywhere inside that column pushes the
  whole grid track — and everything depending on it — wider instead of
  shrinking to fit. `transform`-based changes never trigger this (transform
  doesn't participate in min-content calculations), which is why this kind
  of layout blowout can hide behind animation testing that never surfaces
  it.
- **A flexbox child's `min-width` defaults to `auto`, not `0`.** `flex: 1`
  alone never lets a child shrink below its own content's natural width —
  `overflow: hidden`/`text-overflow: ellipsis` is a silent no-op without an
  explicit `min-width: 0` alongside it. Hit repeatedly across different
  pills/tabs; check for this first whenever text overflows a
  flex-shrinking container.
- **A closed `<details>` renders no non-summary content at all, regardless
  of CSS `display` overrides** — this is native element behavior, not an
  author-overridable style, and `getComputedStyle` will misleadingly report
  `display: block` on the non-rendering child. To force content visible,
  set the element's `.open` property directly.
- **When extracting/refactoring a module by slicing code, a clean build is
  not proof the extraction is complete.** Two real bugs (a missing
  `renderScreen`/`billToRow` import, a missing `escapeHtml` import) were
  valid syntax that only failed at runtime — neither `node --check` nor
  `esbuild` bundling catches "this name was never imported." Budget time
  for a manual full-file review pass after any mechanical extraction.
- **A `required` form control is NOT automatically excluded from native
  constraint validation just because a CSS class makes an ancestor
  `display:none`.** Empirically confirmed in Chrome: `element.willValidate`
  stayed `true` for a `required` `<select>` whose parent had `display:none`
  via a toggled class, so a click on `type="submit"` was silently blocked
  before the form's own `submit` handler ever ran — no console error, no
  toast, no visible validation bubble (it can't anchor to a hidden field).
  This bit the Add form's Transfer tab: `#txCategory` stayed `required`
  while hidden and populated with zero options (no category has `type:
  "transfer"`). Whenever a field's visibility is toggled per-tab/per-mode
  (the `updateFormTypeVisibility()` pattern in `add.js`), toggle its
  `required` attribute in the same place, don't assume hidden implies
  excluded — verify with `element.willValidate`/`form.checkValidity()` in
  the actual browser, not by reading the CSS.
