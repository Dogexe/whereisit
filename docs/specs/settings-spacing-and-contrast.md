# Settings screen: contrast + spacing scale

Status: **built and live-verified.** Third screen in the same audit-then-spec-then-build pass as `home-spacing-scale.md` and `transactions-spacing-scale.md`. Unlike Transactions, Settings' audit found real contrast bugs again (like Home did) plus one bug that reaches outside Settings entirely.

## Audit

### Contrast (same method as Home: relative-luminance calc, then live `getComputedStyle` confirmation)

All in the same bug class as Home's original fix — raw `--color-income`/`--color-expense` used directly as text/icon/fill color instead of the AA-safe `-700` variant:

| Spot | Screen | Usage | Measured |
|---|---|---|---|
| `.badge-income` | Settings (Goals "complete" badge) | text on `--color-income-tint` | ~2.5:1 (computed, same formula as Home's original bug) |
| `#syncStatus.ok`/`.err` + `.sync-dot` | Settings (Sync panel) | text + small dot, both raw hues | same failure class as Home's delta text |
| Goal "complete" progress-bar fill (`settings.js:623`) | Settings (Goals) | `background` fill vs `--color-surface` track (3:1 non-text minimum, not 4.5:1) | 2.46:1 (computed) — fails even the lower bar |
| `categories.js`'s `GOAL_TONES[1]` | Settings (Goals icon avatars) | icon foreground on `--color-income-tint` | same pattern as the next row |
| `categories.js`'s `rowTone("income")` | **Home + Transactions** (category icon avatars on every income transaction row) | icon foreground on `--color-income-tint` | **live-measured 1.94:1** (dark mode) — fails even 3:1 non-text minimum, and visually confirmed: a freelance-income row's laptop icon is nearly invisible against its own tint circle |

The last row is the one that reaches outside this screen — `rowTone()` lives in `categories.js` and is consumed by `tx-row.js`, so this bug has been live on Home and Transactions since before this session's Home pass (missed then because that audit only checked inline `color:` text styles, not `iconAvatar()`'s bg/fg tone functions). Confirmed in scope for this pass directly by the user.

### Spacing

| Gap/value | Current | On the established scale? |
|---|---|---|
| Settings title's own inline override (`style="margin-bottom:22px"`, distinct from the shared `.screen-title` rule Home/Transactions use) | 22px | ❌ nearest is `--space-xl` (24) |
| `.settings-block` gap (between profile row and the nav+panels block) | 22px | ❌ same value, same fix |
| `.settings-panels` gap (between Display/Sync/Manage sections when stacked) | 22px | ❌ same value, same fix |
| `.settings-group-body` bottom padding (space after a Manage group's content, e.g. after the budgets list, before the divider) | 14px | ❌ the exact same stray value already fixed once in Home's `.budgets-list` |
| Install-app-button wrapper (`settings.js:896`, inline `style="padding:10px 4px"`) | 10px | ❌ same tie-break already resolved once in Transactions (→ 12px) |
| `.settings-section-label` margin-bottom | 8px | ✅ already matches `--space-xs`, just needs tokenizing |

Confirmed Settings-exclusive via grep (`.settings-block`, `.settings-panels`, `.settings-section-label`, `.settings-group`, `.settings-group-body`, `.toggle-row`, `.profile-row`) — safe to change without touching other screens.

**Explicitly not touched**, same boundary as the last two specs: interior row padding (`.toggle-row`/`.settings-group summary`'s `12px 4px`, already on-scale anyway), `.profile-row`'s internal `gap: 14px` (icon-to-text component layout, not inter-block rhythm — same category as Home's untouched `.stat-card .head` gap), and the desktop `.settings-nav`/`.settings-nav-item` layout (a different, denser navigation pattern out of this audit's scope).

## Decision — the remap

**Contrast** (8 spots, all swap raw → `-700`, reusing tokens already built in `theme.js`):
1. `categories.js` `rowTone("income")`: `color: "var(--color-income)"` → `"var(--color-income-700)"`
2. `categories.js` `GOAL_TONES[1]`: same swap
3. `styles.css` `.badge-income`: `color: var(--color-income)` → `var(--color-income-700)`
4. `styles.css` `#syncStatus.ok`: same swap
5. `styles.css` `#syncStatus.err`: `var(--color-expense)` → `var(--color-expense-700)`
6. `styles.css` `#syncStatus.ok .sync-dot`: same swap as #4
7. `styles.css` `#syncStatus.err .sync-dot`: same swap as #5
8. `settings.js:623` goal bar-fill: `var(--color-income)` → `var(--color-income-700)`

**Spacing** (reusing the existing `--space-*` scale, no new tokens):
1. `settings.js` title inline margin: `22px` → `var(--space-xl)` (24px)
2. `.settings-block` gap: `22px` → `var(--space-xl)`
3. `.settings-panels` gap: `22px` → `var(--space-xl)`
4. `.settings-group-body` padding: `0 4px 14px` → `0 4px var(--space-sm)` (12px)
5. Install-app-button wrapper padding: `10px 4px` → `var(--space-sm) 4px` (12px)
6. `.settings-section-label` margin-bottom: `8px` → `var(--space-xs)` (unchanged value, now tokenized)

## Verification plan

Same as the last two: `npm test`, `npm run build`, `npm run test:e2e`, then live re-verification — contrast via `getComputedStyle` + the relative-luminance function (both themes, re-checking the specific freelance-income row that was visually broken), spacing via `getBoundingClientRect` on the 3 changed Settings gaps.

## Correction found during live verification: `-700` was the wrong token for icon-on-tint

The first build swapped `rowTone("income")`/`GOAL_TONES[1]`/`.badge-income` to `--color-income-700`, same as every other fix in this pass. Live re-measurement in dark mode still showed **1.94:1** — unchanged from before the fix. Root cause: `--color-income-700` is deliberately theme-aware (`theme.js`) and in dark mode equals the *base* `--color-income` (bright), because that pairing was tuned to pass against `--color-card`/`--color-surface`, both of which invert for dark mode. But `rowTone()`/`.badge-income`'s background is `--color-income-tint` — `color-mix(in srgb, var(--color-income) 12%, white)` — which **never inverts**: measured light-mode and dark-mode tints land within ~2 RGB points of each other, since a 12% mix is dominated by the white it's mixed into regardless of which green shade goes in. Pairing a theme-inverting foreground with a theme-invariant background meant the dark-mode fix silently did nothing.

Fixed with a new, deliberately **non**-theme-aware token, `--color-income-tint-fg: #147a54` (reuses `-700`'s light-mode hex, fixed, never touched by `theme.js`), used only by the three icon/badge-on-tint spots (`rowTone`, `GOAL_TONES[1]`, `.badge-income`). `#syncStatus`/the goal bar-fill correctly kept `-700`, since both of those sit on `--color-card`/`--color-surface`, which do invert.

Re-verified live after the correction: the icon avatar (dark mode) now measures **4.86:1** (was 1.94:1), confirmed visually — the freelance-income row's laptop icon is clearly legible instead of nearly invisible. `.badge-income` (simulated via a detached test element, since no goal in the current dataset is actually "complete") measures the same 4.86:1. `#syncStatus`'s `ok`/`err` states (forced via a temporary class swap, since the offline test environment has no real sync state) measure 7.73:1/6.45:1 in dark mode, confirming the `-700` tokens were correct for that spot all along. `npm test` (172/172), `npm run build`, `npm run test:e2e` (9/9) all pass after the correction.

## Result

Both the Settings-scoped fixes and the cross-screen icon-avatar fix are built, corrected, and live-verified as described above. Spacing: `title→block` 22→24px, `.settings-block`/`.settings-panels` gaps 22→24px, `.settings-group-body` padding 14→12px — all confirmed via live `getBoundingClientRect` measurement.
