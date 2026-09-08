# Spec: Color the Income/Expense stat-card icons

Status: **proposed** (not built). Requested directly from an annotated
screenshot mark-up (`E:\design\UPmP7gus.jpg`): the Income and Expense
stat-card icons should be colored (green/red) instead of the current
muted gray.

## Current behavior

`.stat-card .head` (`home.js:136-145`, `styles.css:400-401`) renders an
icon + label pair for each of the two stat cards:

```html
<div class="head">${icon("arrow-down-left")}<span>Income</span></div>
...
<div class="head">${icon("arrow-up-right")}<span>Expense</span></div>
```

`.stat-card .head` sets `color: var(--color-muted)`, which both the SVG
icon (via `currentColor`/inherited stroke) and the label text inherit —
today both render in the same muted gray. The delta line below each value
already uses distinct tokens: `var(--color-income-700)` for Income's
delta, `var(--color-expense-700)` for Expense's (`home.js:139,144`).

## Key decisions (confirmed with the user before building)

1. **Icon glyph only, not the label text and not a tinted circular
   background** — per the user's explicit choice, this is the smallest
   version: recolor just the arrow icon, leave the "Income"/"Expense"
   label text in its current muted color, and do not introduce a new
   `iconAvatar()`-style tinted circle (that pattern exists elsewhere in
   this app — e.g. Spent Today's wallet icon, `home.js:149` — but is
   explicitly **not** requested here).
2. **Reuse the existing income/expense color tokens**, the same ones
   already driving the delta line directly below each icon
   (`--color-income-700` for Income, `--color-expense-700` for Expense) —
   no new color tokens. This keeps the icon and its own card's delta text
   visually consistent (same green, same red) rather than introducing a
   third shade.

## New behavior

- `.stat-card .head .icon` gets its color set explicitly per card,
  overriding the inherited `--color-muted`:
  - Income card's icon → `var(--color-income-700)`.
  - Expense card's icon → `var(--color-expense-700)`.
- Simplest implementation: a per-card modifier class on `.head` (e.g.
  `.head.head-income` / `.head.head-expense`) or a scoped selector
  keyed off each stat card's existing structure — Codex's call on the
  exact selector, as long as only the icon's color changes and the label
  span keeps inheriting `--color-muted` unchanged.
- No other visual change to `.stat-card`: padding, layout, value/delta
  typography, and the muted label text all stay exactly as they are
  today.

## Out of scope

- No `iconAvatar()`/circular tinted background (decision 1).
- No change to which icons are used (`arrow-down-left`/`arrow-up-right`
  stay as-is) or to any other screen's use of these same icons (e.g. the
  Type selector in `docs/specs/type-selector-icon-color.md` already colors
  its own copies of these icons independently — this spec only touches
  Home's stat cards).
- Not touching the header/greeting or the hero card carousel — see
  `docs/specs/home-header-greeting.md` and
  `docs/specs/home-hero-account-carousel.md`.

## UX constraints

- Follow `docs/UX.md`.
- Match existing: `.stat-card .head` (`home.js`, `styles.css:400-401`).
- Reuse: `--color-income-700` / `--color-expense-700` (already used one
  line below in the same component).
- New design primitives required by this spec: none.
- Mobile and desktop: identical — no viewport branching involved.

## Verification plan

Low risk, CSS/token-only:

1. No test run required beyond a quick visual check per
   `docs/WORKFLOW.md`'s Low-tier default (CSS/token-only change).
2. Real-browser spot check, light and dark mode: Income's icon renders
   green, Expense's renders red, both distinct from the still-muted label
   text next to them, and both readable against the card background in
   dark mode (measure contrast if either token's dark-mode value is close
   to the card background — `--color-income-700`/`--color-expense-700`
   are already used elsewhere in dark mode today, so this is a sanity
   check, not new risk).
