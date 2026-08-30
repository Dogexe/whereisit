# Spec: CSV import

Status: **All 4 stages done and live-verified — this feature is complete.** Requested directly (not itemized in any prior roadmap) as the counterpart to the existing CSV/JSON/Google Sheets export in Settings, which has had no import path since it shipped. Stages 2-4 were built together (one cohesive `import-sheet.js` module) rather than as three separate PRs, but each layer (file pick, real mapping UI, commit) was verified independently before moving to the next, matching the spec's own staged discipline.

## Goal

whereisit can export transactions but has no way to bring existing history in — someone switching from a spreadsheet, another app, or a bank's own CSV export has to re-enter every row by hand. The goal is a plain-CSV import that a real bank/spreadsheet export can be pointed at directly, without requiring the file to already match this app's own export format. That's why the mapping step (letting the user tell the app which column is which) is the core of this feature, not an afterthought — a fixed-column importer would only ever work on whereisit's own CSV export, which defeats the purpose.

## Decisions (confirmed via interview)

1. **Type is derived from one signed Amount column** — the user maps a single Amount column; a negative value becomes an expense, positive becomes income. This matches the most common bank-export shape. A separate Debit/Credit-column mode, and a "manual type for the whole file" mode, were both considered and explicitly deferred — not built this pass, not silently unsupported forever.
2. **Dedupe is scoped to the target account only.** The "same date+amount+note = likely duplicate" check only compares against transactions already in the account being imported into, not the whole app — two different accounts can legitimately share a same-day, same-amount, same-note transaction (e.g. matching legs of a manual transfer someone recorded by hand before this app had real transfers) without one being wrongly flagged.
3. **Duplicates within the file itself are not deduped against each other** — only against what's already in the app. Two identical rows in the same CSV (same date, amount, and note) both import; a repeated charge on the same day for the same amount is assumed to be two real transactions, not an export glitch.
4. **Bad rows are skipped, not fatal.** A row with an unparseable date, non-numeric or zero amount, or a blank required field is excluded and counted separately from duplicates — the rest of an otherwise-clean file still imports. The commit-time summary is a three-way count: new / duplicate / unreadable.
5. **Date format is picked explicitly, not auto-detected.** Next to the Date column dropdown, a second dropdown picks the format (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`) applied to every row. Auto-detection was considered and rejected — a file where every day value happens to be ≤12 is genuinely ambiguous between `DD/MM` and `MM/DD`, and guessing wrong would silently import every date transposed.
6. **The first row is always treated as a header row**, used to label the mapping dropdowns with the file's own column names. No toggle for a headerless file — this matches effectively every real bank/spreadsheet export and keeps the mapping step to one control per field instead of two.

## Decisions made without a direct question (flagged for review before building)

- **Income/expense only — no transfers.** A CSV import produces `type: "income"` or `type: "expense"` rows exclusively. A transfer needs two of the user's own accounts (`accountId` + `toAccountId`, per `docs/specs/account-transfers.md`), which a single-account bank export has no way to express; a signed amount alone is not enough information to know a row is actually a transfer rather than ordinary income/expense. Listed explicitly under "out of scope" below rather than left as an unstated gap.
- **One account for the whole file, chosen once** — via the same account-chip picker component the Add form already uses (`renderAccountChipPicker` in `add.js`, generalized in the account-transfers pass), not a per-row account column. Multi-account support has already shipped (`docs/specs/multi-account-support.md`), so this has no unmet dependency.
- **Category resolution reuses existing infrastructure exactly, with no new matching logic:**
  - If the CSV has a mapped Category column and a given row's cell is non-blank: look it up against live categories by exact name using `findCategoryId(categories, rawText, type)` (`categories.js`, the same function `resolveCategoryId` already calls). On a match, store the real `categoryId`; either way, store the raw CSV text as `.category`. An unmatched category text is not silently discarded or auto-created as a new category — it degrades exactly the way a stale/renamed category already degrades everywhere else in this app (`categoryId: null`, original text preserved, shown as-is via the same "never worse than before" fallback `resolveCategoryId`/`categoryDisplayName` already provide).
  - If no Category column is mapped at all (or a given row's cell is blank), the row's category is auto-guessed via `guessCategory(note, type)`. **Correction to the original request**: `guessCategory` actually lives in `categories.js`, not `derived.js` — `derived.js` only re-exports pure computations that read the live `categories`/`transactions` arrays, and `guessCategory` is a `categories.js`-owned helper already imported directly by `add.js` for the same live-typing auto-suggest. This spec follows the real location.
- **No new category is ever auto-created during import.** An unmatched category name falls back to plain display text (previous bullet) rather than silently growing the user's category list from whatever text happened to be in a bank's own export.
- **Imported rows never trigger `checkBudgetAlert`.** That check exists to toast a same-moment "you're near/over budget" warning when a single transaction is added live; firing it per-row across a bulk historical backfill (potentially hundreds of rows, many from past months) would be meaningless noise, not a useful signal. This mirrors the existing precedent of transfers also skipping it.
- **Commit writes are batched, not per-row.** All new rows are pushed into the in-memory `transactions` array, `saveToStorage()` is called once, then a single `pushRows("transactions", newRows.map(t => txToRow(t, false)))` (already chunks internally at 500, per `sync.js`'s existing pass) followed by one `syncNow()` — not the Add form's one-row-at-a-time pattern, since that would mean up to hundreds of redundant `localStorage` writes and network calls for one import.
- **The Import sheet gets its own leaf module**, `src/screens/import-sheet.js`, rather than living inline in `settings.js` the way the three-button Export sheet does. Export's whole UI is one click each on three static buttons; Import is a real multi-step flow (pick file → map columns → review counts → commit) with its own internal state, and inlining that into `settings.js` (already one of the largest files in this codebase) would make it meaningfully harder to navigate. `settings.js` imports and calls into this module at exactly the point the Export button/sheet already sit, the same shape `home.js`/`transactions.js` already use to share `tx-row.js`.
- **Parsed file contents (headers, raw rows, per-row plan) live as module-level state inside `import-sheet.js`, never in the shared `state` object.** Every other sheet's open/step/selection flags do belong in `state` (matching `exportSheetOpen`, `addSheetOpen`, etc.) and this one does too for those flags — but a parsed CSV can be thousands of rows, and `state` has no general precedent for holding raw imported data; `storage.js`'s `saveSettings()` already explicitly enumerates which fields it persists (not a blanket dump of `state`), so this isn't a persistence risk either way, but keeping bulk parsed data out of the shared object entirely avoids ever needing to reason about it against that enumeration.
- **New `upload` sprite icon**, fetched from the same pinned `lucide-static@1.35.0` this repo already draws every icon from, alphabetically inserted into `icons/sprite.svg`, re-verified with a real XML parser per that file's own standing warning about silent breakage from a bad comment.
- **File reading uses `File.prototype.text()`** (a plain promise, already broadly supported) rather than the older `FileReader` callback API — no new dependency either way, just the more direct of two built-in options.
- **Amount parsing supports a leading minus sign and thousands-separator commas, not accounting-style parenthesized negatives** (e.g. `(1,234.56)` meaning `-1234.56`) — a real format some exports use, but out of scope for a first pass; a row using it will read as a non-numeric amount and land in the "unreadable" count rather than being silently misread as positive.

## New pure module: `src/import.js`

Mirrors `merge.js`/`pending.js`/`watermark.js` — no imports from `state.js`/`sync.js`, every dependency (existing transactions to dedupe against, a category-resolver function) passed in by the caller, so it's testable with plain fabricated data and stub functions, the same style as `merge.test.js`'s `toObj`.

```js
export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"];

// RFC4180-ish: handles quoted fields (including embedded commas/newlines),
// doubled-quote escaping, both \n and \r\n line endings, and strips a
// leading UTF-8 BOM (this app's own CSV export writes one, so re-importing
// whereisit's own export file must not choke on it). Returns the header
// row separately from the data rows -- the caller always treats row 1 as
// headers per decision 6, this function doesn't decide that on its own.
export function parseCsv(text) // -> { headers: string[], rows: string[][] }

// Strips whitespace and common currency symbols (฿, $, €, £) and
// thousands-separator commas, keeps an optional leading "-". Returns null
// (not 0) for anything that isn't a clean number after stripping, and null
// for exactly 0 -- a real transaction amount is always > 0 elsewhere in
// this app (add.js's own submit validation rejects amount <= 0), so an
// imported "0.00" row is exactly as invalid, not a legitimate zero-amount
// transaction.
export function parseAmountValue(raw) // -> number | null

// Validates the real calendar date (rejects e.g. day 30 in a month with
// 29 days, the same rigor utils.js's parseDateText already applies to the
// app's own date field) rather than just pattern-matching digits.
export function parseDateWithFormat(raw, format) // -> "YYYY-MM-DD" | null

// mapping: { dateCol, amountCol, noteCol: number|null, categoryCol: number|null, dateFormat }
// existingTx: already filtered by the caller to just the target account's
// own transactions (decision 2 -- this function has no concept of
// accounts at all, keeping it usable for the dedupe-scope decision without
// needing to know why that scope was chosen).
// resolveCategory(rawCategoryText, note, type) -> { categoryId, category }
// is supplied by the caller so this module never imports categories.js
// directly -- the caller wires it to the real findCategoryId/guessCategory
// pair (or, in a test, a stub).
export function buildImportPlan({ dataRows, mapping, existingTx, resolveCategory })
// -> { newRows: [{ date, type, amount, note, categoryId, category }],
//      newCount, duplicateCount, unreadableCount }
```

Dedupe match: `date` equal, `note` equal after trimming (empty-vs-empty counts as equal), and `amount` equal within a small epsilon (floating-point safe) against `Math.abs` of the existing row's own signed effect. A row failing to parse (bad date, bad/zero amount) is counted as unreadable and never reaches the dedupe check at all.

## Unit tests: `tests/import.test.js`

Same style as `tests/merge.test.js`/`tests/derived.test.js` (`node:test`, plain fabricated data, no DOM). Planned coverage:

- `parseCsv`: a simple 3-column file; a quoted field containing a comma; a quoted field containing an embedded newline; doubled-quote escaping (`""` inside a quoted field); CRLF line endings; a leading BOM stripped correctly; a trailing blank line ignored.
- `parseAmountValue`: a plain integer; a decimal; thousands-separator commas; a currency symbol prefix; a negative value; `"0"` returns null; empty string returns null; non-numeric garbage returns null.
- `parseDateWithFormat`: all three formats on a valid date; a genuinely invalid calendar date (Feb 30) rejected in every format; single-digit day/month accepted for the slash formats (`3/8/2026`); garbage input returns null.
- `buildImportPlan`: a clean file with no existing transactions (all new); a file where one row exactly matches an existing transaction in the target account (correctly skipped as duplicate, count reflected); a row matching an existing transaction in a *different* account is **not** skipped (proves the per-account dedupe scope from decision 2); two identical rows within the same file both import when neither matches an existing transaction (decision 3); a row with an unparseable date and a row with a zero amount are both counted as unreadable, not silently dropped from the count; a mapped Category column whose text matches a live category resolves the real id; a mapped Category column whose text matches nothing keeps the raw text with a null id; no Category column mapped falls through to the injected `resolveCategory` stub standing in for `guessCategory`.

## New sprite icon and i18n strings

- `icons/sprite.svg`: new `upload` symbol (Import button + sheet header), same pinned-CDN-fetch-and-XML-reverify process every prior icon addition in this repo has used.
- `i18n.js` (`STRINGS`, `[th, en]` pairs — exact Thai copy to be filled in at implementation time, English placeholders shown here): `importBtn` ("Import"), `importPickFileLabel`, `importChooseFileBtn`, `importMapStepTitle`, `importDateColumnLabel`, `importAmountColumnLabel`, `importNoteColumnLabel`, `importCategoryColumnLabel`, `importNoColumnOption` ("None" — for the optional Note/Category selects), `importDateFormatLabel`, `importAccountLabel` (or reuse the Add form's existing `accountLabel`), `importPreviewLabel`, `importBackBtn`, `importContinueBtn`, `importCommitBtn`, `importSummaryLine` (e.g. `"{new} new · {dup} duplicates · {bad} unreadable"`), `toastImportSuccess` (`"Imported {n} transactions"`), `toastImportParseError` (empty file / not a CSV / zero data rows after the header).

## Staged build plan

### Stage 1 — `src/import.js` + `tests/import.test.js` (no UI) — done
The pure parsing/dedupe module described above, fully unit tested. No screen, no state, no icon yet — this stage is verifiable entirely via `npm test`, matching how `merge.js`'s stage 1 in the sync-efficiency pass shipped logic-first, UI-later.

**Verify (done)**: `npm test` — 33 new tests (7 `parseCsv`, 10 `parseAmountValue`, 7 `parseDateWithFormat`, 9 `buildImportPlan`), all passing, 136/136 overall. `npm run build` confirmed unaffected (`dist/main.js` an identical 195.9kb before and after — nothing imports `src/import.js` yet, as expected for a logic-only stage).

### Stages 2-4 — built together as one module, verified as one end-to-end flow — done
Rather than shipping a stub "map" step in Stage 2 and replacing it in Stage 3, `src/screens/import-sheet.js` was written with all three real steps (pick → map → summary/commit) from the start, since they share one small file and one linear state machine — splitting it into a stub-then-replace sequence would have meant writing, testing, and then discarding throwaway UI. What stayed staged was the *verification*: each layer was checked before moving on to the next (file pick and parsing, then the real mapping controls, then the commit path), matching the spirit of the original plan even though the code landed in one pass.

- **Stage 2's shape**: `src/screens/import-sheet.js` exports `importSheetHtml()`/`wireImportSheet()`/`openImportSheet()`/`closeImportSheet()`, following `settings.js`'s own `exportSheetHtml`/`wireExportSheet`/`createFocusTrap`/Escape-close pattern exactly. `settings.js` gained an "Import" `toggle-row` button right next to "Export" in the Sync & Data card. New state: `state.importSheetOpen` (mirrors `exportSheetOpen`), `state.importStep` (`"pick" | "map" | "summary"`), `state.importAccountId`, `state.importMapping`. `txToRow` (`sync.js`) had to be exported (it wasn't before, unlike the other four `*ToRow` functions) so the batched commit could build one row array for a single `pushRows()` call.
- **Stage 3's shape**: four `<select>`s (Date/Amount required; Note/Category optional) populated from the parsed header row, a date-format `<select>` (the three `DATE_FORMATS`), and the account picker — a new exported `renderImportAccountChips()` in `add.js`, reusing the exact same underlying `renderAccountChipPicker` the Add form's own account picker uses. A live preview of the first 5 data rows, run through `parseDateWithFormat`/`parseAmountValue` with the current mapping, updates on every mapping change.
- **Stage 4's shape**: "Continue" calls `buildImportPlan()` (existing transactions pre-filtered to `state.importAccountId`, `resolveCategory` wired to the real `findCategoryId`/`guessCategory`) and shows the three-way N/M/K count. "Commit" (disabled when `newCount === 0`) pushes every new row into `transactions`, one `saveToStorage()`, one `pushRows("transactions", ...)`, one `syncNow()`. Backdrop/×/Escape at any step discard everything, matching every other sheet in this app.

**A real, pre-existing bug found and fixed while live-testing this feature, unrelated to the import logic itself**: `wireAddForm` (`add.js`) used to call `renderTransferAccountChips()` unconditionally at every render, regardless of which type tab (Expense/Income/Transfer) was active. Since `resetForm()`/`editTx()` always set `state.formToAccountId` to a real account id (`defaultToAccountId`) whether or not Transfer was the active tab, and `renderTransferAccountChips()` always excludes that id, the plain Expense/Income account picker could permanently show one real account disabled — reproduced with exactly two accounts (Cash + Bank), where Bank was wrongly unselectable on the ordinary Expense tab with no way to fix it by switching tabs (the type-radio handler never re-rendered the account chips at all). Fixed with a new `renderAccountFieldChips()` helper that picks the correct render function based on `state.formType`, called both at initial wire-up and on every type-tab switch. This was caught only because the import test scenario happened to need a two-account setup with the Add form's plain Expense picker — exactly the kind of thing that "the code reads correctly" would never have surfaced.

**Verify (done)**: `npm run build && npm test` (136/136) and `npm run test:e2e` (9/9) both pass after every change. Live-verified end to end in a real browser against the built `dist/` (English UI, then dark mode via the real Settings toggle): Import button renders next to Export with the new `upload` icon; opens/closes via ×, backdrop click, and Escape identically to the Export sheet in both themes; a real CSV upload parses and advances to the mapping step with real header names in every dropdown; the live preview correctly renders `2026-08-20 · -200` style parsed rows and `—` for the deliberately-malformed date row; two seed transactions were created by hand (Cash: 15/08 −500 "existing lunch"; Bank: 16/08 −300 "bank existing") and a 4-row test CSV (one genuinely new row, one exact duplicate of the Cash transaction, one row matching the *Bank* transaction's date/amount/note, one row with an unparseable date) produced the exact expected `2 new · 1 duplicates · 1 unreadable` summary — critically, the row matching Bank's transaction was correctly counted as **new** when importing into Cash, proving the per-account dedupe scope live, not just in the unit test. Committing added exactly the 2 new rows, correctly attributed to Cash (confirmed via Home's account switcher: Cash-only balance −฿1,000.00 = 200+300+500, "All accounts" −฿300.00 = 1,000 opening + 0 income − 1,300 expense, both hand-verified). A second CSV separately confirmed both category-resolution paths for real: a category column value that exactly matches a live category name resolved to that category's real id/icon, and a blank category column value fell through to `guessCategory` and correctly auto-matched "freelance payment" to the Business/Freelance category. Zero console errors throughout. **Not done this pass**: a Supabase round-trip via a throwaway test account (the technique used to verify prior sync-touching passes) — scoped out because `pushRows`/`txToRow` are pre-existing, already-proven code paths being reused exactly as-is, not new sync logic; the real risk surface for this feature is the client-side parse/dedupe/commit path, which was verified thoroughly above.

## Explicitly out of scope

- OFX/QIF or any non-CSV bank export format.
- Debit/Credit-column mode or a whole-file manual type override — only the signed-Amount mode from decision 1.
- Auto-creating new categories from unmatched CSV category text.
- Importing transfers (see the "no transfers" decision above).
- Accounting-style parenthesized negative amounts.
- A full per-row review/edit table before commit — the mapping step's live preview plus the aggregate N/M/K summary is the extent of pre-commit visibility this pass, matching the original request's own "show a count" framing.
- Undo-after-commit as a dedicated feature — an import is a batch of ordinary transactions once committed, so removing a bad import means deleting rows the normal way (or via a future bulk-delete, itself out of scope here), not a special one-click revert.
- Remembering a column mapping between separate import sessions (e.g. for a recurring monthly bank export) — every import starts the mapping step fresh.
