# Home screen spacing scale

Status: **built and live-verified.** Requested directly ("adjust the spacing in home page, spec first"), following on from the "Home screen polish pass (ui-ux-pro-max skill)" changelog entry. Scope is deliberately narrow: fix the *rhythm* (gaps between elements) that a live-browser audit found inconsistent, not a general redesign.

## Motivation

User's own framing: "inconsistent rhythm" — not too cramped or too loose overall, but the *steps between* elements don't feel like they follow one intentional scale.

## Audit (measured live, `getBoundingClientRect`, desktop width — see reasoning below for why mobile is representative)

Main column, top → bottom:

| Gap | Current | Flag |
|---|---|---|
| Screen top padding | 20px | — |
| "September 2026" → "Overview" title | 0px | — |
| **Title → account switcher chips** | **0px** | outlier — every other gap on the screen is ≥6px |
| Switcher → hero balance card | 12px | — |
| Hero → income/expense stat cards | 12px | — |
| Stat cards → "Spent today" card | 12px | — |
| "Spent today" → "Recent activity" heading | **22px** | jumps to ~2x the established 12px rhythm |
| "Recent activity" heading → transaction list | **6px** | drops to half the smallest other value |

Side column: heading→card gaps are a consistent 22px there, but the two cards underneath use different interior rhythms — the bills list (`.list-card`/`.manage-row`) is divider-lines + 12px row padding, while the budgets card (`.budgets-list`) is a flat 16px padding + **14px** inter-item gap with no dividers. 14px doesn't match any other value used on the screen.

Raw values currently in play: `0, 6, 12, 14, 16, 20, 22`. Not a clean scale — reads as tuned ad hoc across past passes rather than off one set of steps.

**Why desktop measurements are representative of mobile too**: confirmed via source inspection that every rule audited above (`.account-switcher-row`, `.hero-card`, `.stat-row`, `.today-spend-card`, `.section-head`, `.budgets-list`) is Home-exclusive (grepped — no other screen references these classes) and mobile/desktop share the same values *except* `.hero-card`'s own `margin-top` (16px mobile, overridden to 0 by `.home-columns .hero-card` at ≥1024px, since the switcher's 12px margin-bottom already provides the desktop gap). That one exception is called out explicitly in the mapping below.

## Decision 1 — the scale itself

New tokens, added to `:root` in `styles.css` alongside the existing `--radius-*`/`--shadow-*` tokens (same naming convention: `xs`/`sm`/`md`/`lg`/`xl`, not numbered steps):

```css
--space-xs: 8px;
--space-sm: 12px;
--space-md: 16px;
--space-lg: 20px;
--space-xl: 24px;
```

Global tokens (visible to every screen), but **only Home's rules switch to using them in this pass** — other screens keep their current literal px values untouched. A future pass can migrate them onto the same scale.

### Design-skill review of Decision 1

Ran the `ui-design:spacing-system` skill against this scale before building. Its canonical scale is a doubling progression (`2xs:2, xs:4, sm:8, md:16, lg:24, xl:32, 2xl:48, 3xl:64`), which conflicts with the scale above two ways: the token *names* collide with different values (its `sm` is 8px; this spec's `sm` is 12px), and its bigger steps would force the audited-as-fine 12px hero/stat/spend rhythm to round to either 8px or 16px — a real visual change the original audit never asked for. Presented both options directly; **decision: keep the linear scale above**, prioritizing "fit the values the audit already found correct" over matching that skill's specific naming/step convention. The skill's *application rule* ("related items get smaller spacing, distinct sections get larger") was checked independently and already holds for the remap below regardless of which numeric scale was chosen.

## Decision 2 — the full remap

| Rule | Property | Before | After | Token |
|---|---|---|---|---|
| `home.js` screen-title inline style | `margin` bottom | `0` | `8px` | `var(--space-xs)` |
| `.account-switcher-row` | `margin-bottom` | `12px` | `12px` | `var(--space-sm)` *(unchanged value, now tokenized)* |
| `.hero-card` | `margin-top` | `16px` | `16px` | `var(--space-md)` *(mobile only — desktop's `0` override is untouched, it's a deliberate different case)* |
| `.stat-row` | `margin-top` | `12px` | `12px` | `var(--space-sm)` *(unchanged value, now tokenized)* |
| `.today-spend-card` | `margin-top` | `12px` | `12px` | `var(--space-sm)` *(unchanged value, now tokenized)* |
| `.section-head` | `margin` (top) | `22px` | `24px` | `var(--space-xl)` |
| `.section-head` | `margin` (bottom) | `6px` | `8px` | `var(--space-xs)` |
| `.budgets-list` | `gap` | `14px` | `12px` | `var(--space-sm)` |

Net visual effect: three tiny nudges (+8px title gap where there was none, +2px heading-in, +2px heading-out, −2px budget-item gap) and everything else keeps its exact current pixel value, just expressed as a token instead of a literal. The 12px rhythm (switcher→hero→stats→spend) is preserved exactly as-is since it was already the one part of the screen that *was* consistent.

## Explicitly not touched (out of scope for this pass)

- **Interior card padding** (`.hero-card` 22px, `.stat-card` 14px/16px, `.today-spend-card` 12px/16px, `.list-card` 4px/14px, `.budgets-list` 16px, `.manage-row` 12px/4px) — a different dimension (padding, not inter-element gaps) that wasn't part of the "rhythm" complaint. Worth its own pass if it turns out to matter.
- **`.list-card`, `.manage-row`, `.tx-lead`/`.tx-row-inner`** — shared with Transactions and/or Settings (confirmed via grep), not Home-exclusive. Changing these would leak outside Home, so left alone.
- **Other screens** — the new `--space-*` tokens are added globally but not applied anywhere outside Home in this pass.
- **`.screen-title`'s own top margin** (`2px`, home.js inline) and `.today-label`'s margin — neither was flagged in the audit as an outlier, left as-is.

## Verification plan

- `npm test`, `npm run build`, `npm run test:e2e` all still pass (no logic touched, but the e2e suite renders Home so a CSS mistake that broke layout badly enough would likely still be visually obvious in a live check even if it didn't fail assertions).
- Live browser re-measurement of the same `getBoundingClientRect` gaps audited above, confirming each lands on its new target value, in both light and dark mode (spacing doesn't depend on theme but confirming nothing else regressed).
- Visual screenshot comparison, mobile-width and desktop-width, before/after.

## Result

`npm test` (172/172), `npm run build`, `npm run test:e2e` (9/9) all pass. Re-measured all 8 gaps live against the built `dist/`: every one landed exactly on its new target value (`title→switcher` 0→8, `switcher→hero`/`hero→stats`/`stats→spend` unchanged at 12, `spend→heading` 22→24, `heading→list` 6→8, side-column `heading→card` 22→24, `budgets-list` gap 14→12). Confirmed correct in dark mode via screenshot (spacing is theme-independent, but nothing else regressed).

## Follow-up: title↔switcher↔hero felt backwards (same session)

Reported directly after seeing it live: "switcher feel too far from hero card and too close to overview." Real feedback on the numbers above, not a new spec — a same-scale value swap, not a new decision.

Root cause: the account switcher is functionally a filter tied to "Overview" (selects which account's data the whole page shows), so it reads as *part of the header*, not part of the card stack below it. The original remap treated it as an isolated outlier fix (0px→`--space-xs`) without reconsidering whether `--space-sm` between switcher and hero was still right once the title gap existed at all.

Fix: swapped the two tokens, no new values introduced —
- `home.js` screen-title inline margin (bottom): `var(--space-xs)` (8px) → `var(--space-sm)` (12px)
- `.account-switcher-row` `margin-bottom`: `var(--space-sm)` (12px) → `var(--space-xs)` (8px)

Re-measured live: `title→switcher` now 12px (was 8), `switcher→hero` now 8px (was 12) — desktop width, where `.hero-card`'s own `margin-top` is zeroed by the `≥1024px` override so the switcher's `margin-bottom` is the entire gap. On mobile (where that override doesn't apply), the switcher-to-hero *visual* gap is `--space-xs` (8px, switcher) + `--space-md` (16px, hero's own mobile-only top margin) = 24px, down from 28px before this fix — not independently re-verified on a real mobile viewport in this follow-up (the browser tool's `resize_window` doesn't actually shrink this environment's viewport below its native size, a known limitation noted in this session), but the underlying token math is unambiguous. `npm test` (172/172) and `npm run build` re-confirmed passing after this change.
