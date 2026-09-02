# Note: hide-amounts and chart shapes

Status: **built and live-verified.** Not a full staged spec — the request explicitly said no spec doc was needed if `fmtMoney()`'s chokepoint held up cleanly, with one exception called out in advance: stop and write a short note if masking the SVG chart values turned out to need real rework rather than a simple label swap. This is that note, plus the actual build summary.

## What shipped

- `state.hideAmounts` (boolean, default off), persisted through the same `saveSettings()`/`storage.js` path as `state.dark` — device-local, never synced, never touched by `wipeLocalAccountData()`.
- `fmtMoney()` (`utils.js`) is genuinely the single chokepoint every screen already went through (`home.js`, `transactions.js`, `insights.js`, `tx-row.js`, `settings.js`'s budget/bill/goal rows, and `derived.js`'s own `*Fmt` fields, which are themselves built by calling it) — one `if (state.hideAmounts) return "฿•••••";` at the top masks every one of them. No call site needed touching.
- One thing genuinely outside that chokepoint, caught live rather than by reading the code: Insights' category donut also prints each row's exact share-of-total (`Math.round(d.sharePct)}%` in `screens/insights.js`), computed with plain arithmetic, not through `fmtMoney`. Live-testing the masked donut surfaced it still showing real numbers like "69% · 10% · 8%" next to masked `฿•••••` totals — a precise, quantitative figure the user's own framing ("the Insights donut ... figures") clearly meant to include. Masked with a one-line `state.hideAmounts ? "••" : ...` at that same call site.
- Two toggles, both bound to the same `state.hideAmounts`: an icon button (eye/eye-off) on the Home hero card next to the Balance label, and a switch row in Settings' Display section. Verified live that flipping either one updates the other's icon/state on next render.
- New `eye`/`eye-off` symbols added to `icons/sprite.svg`, sourced from lucide-static's actual published SVGs (fetched directly, not recalled from memory) rather than approximated, following the file's existing `<symbol>` formatting convention exactly. Re-verified with a real XML parser after editing, per this repo's standing lesson about that file silently truncating on a bad edit.
- New unit tests in `tests/utils.test.js` covering both the on and off paths, including that the masked output is a fixed placeholder regardless of the underlying value (not, say, a same-length run of digits that would leak digit count).

## The chart-shape gap (the thing worth a note)

`fmtMoney()` masks every *numeric label* in the app. It does **not** — and structurally can't, without separate work — mask the *visual proportions* baked directly into three SVG-based charts, none of which embed `fmtMoney()`-formatted text in their own markup:

- **Insights' category donut** (`derived.js`'s `pieChartSvg`): each slice's arc length is `(category total / grand total) * circumference`. With labels masked, the pie still visually shows relative spend share between categories.
- **Insights' Trend bars** (`derived.js`'s `computeTrend`): each month's income/expense bar height is a pixel value scaled directly from the real total (`(monthTotal / max) * 130`). No number is ever rendered on these bars at all, masked or not — they're pure shape.
- **Home hero card's sparkline** (`derived.js`'s `computeSparklinePoints`, rendered via `sparklineSvg`): the line's up/down shape traces the account's real balance history point-to-point.

Budget/goal progress-bar *fill widths and their own "N%"/"Over budget" status badges* (`home.js`, `settings.js`, `insights.js`'s Budgets tab; `derived.js`'s `statusLabel`/`pct`) are a related but deliberately different case from the donut's share-of-total above — a percentage of that one budget's own limit, not a figure compared across categories or against any other user's numbers the way the donut's breakdown is, and not explicitly named in the request the way "the Insights donut ... figures" was. Left unmasked here, alongside the balance card's negative/positive background-color tint (also derived from the real number, also left as-is) — this is a judgment call, not settled by the same reasoning that decided the donut's percentage, so worth a second look if it turns out to matter in practice.

**Why this wasn't fixed in this pass**: doing so is real rework, not a label swap, exactly as flagged in advance —

- Hiding a pie slice's *shape* means either replacing real proportions with equal-sized slices (changes what the chart communicates, arguably makes it pointless while masked) or hiding the whole donut and showing a placeholder in its place.
- The Trend bars have no text to swap in the first place — masking them can only mean flattening every bar to the same height (same objection) or hiding the chart entirely.
- The sparkline is the same shape-only problem as Trend.

**Decision for this pass**: ship the label-masking (fully working, verified) and leave chart shapes as a known, documented gap rather than block the whole feature on redesigning three charts. The threat model this feature targets — a glance at a phone screen in public — is already mostly defeated by numbers being gone; a stranger reading "this month's spending trended up" from bar heights alone, with no dollar figure attached, is a meaningfully smaller leak than what shipped today. If this gap turns out to matter in practice, the two real options are (a) hide the whole chart (donut/trend/sparkline) behind a placeholder while `state.hideAmounts` is on, or (b) flatten shapes to a uniform baseline — worth a real decision (and probably a one-question check-in) if it comes up, not a default to bake in speculatively now.
