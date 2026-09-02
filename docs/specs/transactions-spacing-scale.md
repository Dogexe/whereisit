# Transactions screen spacing scale

Status: **built and live-verified.** Follow-on from `docs/specs/home-spacing-scale.md`, which introduced the `--space-xs/sm/md/lg/xl` scale for Home and explicitly left every other screen for "a future pass." Requested directly ("do it", after I proposed auditing the next most-used screen the same way).

## Audit (live-measured, desktop width, same `getBoundingClientRect` method as the Home audit)

Contrast: **clean.** `transactions.js` itself has no inline color styles at all, and the shared `tx-row.js`/`.filter-chip`/`.filter-badge` components were already checked — the income amount in the transaction list measures 7.73:1 (dark mode) via the same `--color-income-700` token fixed for Home, `.filter-chip` (accent-tint bg + accent-600 text) measures ~6.31:1, `.filter-badge` (accent bg + white text) ~5.82:1. No contrast bug on this screen.

Spacing, top → bottom:

| Gap | Current | On the Home scale? |
|---|---|---|
| "All Transactions" title → search/filter toolbar row | 16px | ✅ already matches `--space-md` |
| Toolbar → active-filter-chips row (or straight to the list when no filters are active) | 10px | ❌ between `--space-sm` (12) and `--space-xs` (8) |
| Active-filter-chips row → transaction list card | 10px | ❌ same value, same gap |
| Gap *between* individual filter chips (inline, not vertical rhythm) | 6px | ❌ Home's equivalent (`.account-switcher-row`'s chip gap) is already 8px |

Unlike Home, Transactions' own values are already internally consistent with each other (both vertical gaps are the same 10px) — the actual gap here isn't "inconsistent rhythm," it's "consistent, but off Home's now-established scale." Touch targets and the desktop table layout were also checked: `.openTxFiltersBtn` (44px) and the search input (46px) both already clear the 44px minimum. `.filter-chip`'s own tap target is short (~27px, padding 5px 10px around 12px text) — flagged for the same reason Home's `.account-chip` was flagged and *not* changed: a density/layout call for a small removable tag, not something this pass should alter unilaterally.

## Decision — remap onto the existing scale (no new tokens)

| Rule | Property | Before | After | Token |
|---|---|---|---|---|
| `.tx-toolbar-row` | `margin-bottom` | `10px` | `12px` | `var(--space-sm)` |
| `.active-filter-chips` | `margin-bottom` | `10px` | `12px` | `var(--space-sm)` |
| `.active-filter-chips` | `gap` (between chips) | `6px` | `8px` | `var(--space-xs)`, matching `.account-switcher-row`'s chip gap |
| `.screen-title` (Transactions uses the shared base CSS rule, not an inline override like Home's) | `margin-bottom` | `16px` | `16px` | `var(--space-md)` *(unchanged value, now tokenized)* |

**The one real judgment call**: 10px is exactly equidistant between `--space-xs` (8) and `--space-sm` (12). Went with `--space-sm` (12px, slightly looser) because the toolbar and chips are both control-plane elements that already read as a cluster via their own tight 6-8px internal spacing — the *gap after* that cluster reads better as a small breathing-room step down to the content below, closer to Home's "distinct groups" spacing than its "tightly related" spacing. Flagging this explicitly since it could reasonably go the other way.

## Explicitly not touched

- `.filter-chip`'s own tap-target size (flagged above, same call as Home's `.account-chip`).
- The desktop-only table-row CSS (`.tx-list-card .tx-table-head`/`.tx-date-cell` etc., lines ~1024-1054 of `styles.css`) — a different, denser layout mode with its own internal spacing that wasn't part of this audit's scope.
- Any other screen (Add, Insights, Settings) — still open for a future pass, same as Home's spec already noted.

## Verification plan

Same as Home's: `npm test`, `npm run build`, `npm run test:e2e`, then live `getBoundingClientRect` re-measurement of the 3 changed gaps against the built `dist/`, in both light and dark mode.

## Result

`npm test` (172/172), `npm run build`, `npm run test:e2e` (9/9) all pass. Live-verified against the built `dist/` with a real active filter chip present (not just the empty-chips state): `toolbar→chips` and `chips→list` both landed exactly on 12px (was 10), the inter-chip gap landed on 8px (was 6), and `title→toolbar` stayed pixel-identical at 16px as expected. Dark mode confirmed via the same live session (no visual regression).
