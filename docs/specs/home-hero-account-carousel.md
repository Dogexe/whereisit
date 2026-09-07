# Spec: Home hero card becomes a swipeable account carousel

Status: **proposed** (not built). Requested directly from an annotated
screenshot mark-up (`E:\design\UPmP7gus.jpg`): remove the account-chip row
above the hero balance card; make the hero card itself swipeable between
"All accounts" and each individual account, with hidden-until-interaction
page dots; the card's label changes per page ("Total balance" on the
all-accounts page, the account's own name on an account page).

## Current behavior

- `accountSwitcherHtml()` (`src/screens/home.js:62-67`) renders
  `.account-switcher-row`, a horizontal row of `.account-chip` buttons:
  `["All accounts", ...accounts]`. Clicking a chip sets
  `state.homeSelectedAccountId` (`null` for "All accounts", else the
  account's id) and calls `renderHome()` (`home.js:196-200`).
- `state.homeSelectedAccountId` (`state.js:83-86`, **UI-only, not
  persisted** — resets to "All accounts" on reload) is the single source
  of truth that already scopes *everything* on Home: the hero balance
  (`computeBalance(selectedId)`), income/expense totals and deltas,
  spent-today, the sparkline, and recent activity (`home.js:79-104`).
  Nothing else needs to change to make the rest of the screen follow the
  carousel — it already follows `state.homeSelectedAccountId`.
- The hero card itself (`.hero-card`, `home.js:124-134`) renders a
  `.kicker` label (currently always `l.balanceLabel`, "Balance"/"คงเหลือ"),
  the eye/hide-amounts button, the big amount, a sparkline, and a delta
  pill. It does not currently know which account is selected beyond
  reading `balance`.
- Accounts come from `accounts` (`state.js`, imported into `home.js`),
  which includes archived accounts (per
  `docs/specs/multi-account-support.md` stage 5 — archived accounts stay
  visible/selectable in the switcher, just not selectable as an add-
  transaction target).

## Key decisions (confirmed with the user before building)

1. **The account chip row is deleted outright** — `accountSwitcherHtml()`
   and its call site are removed, not hidden/repurposed. The hero card
   becomes the only account switcher on Home.
2. **Swiping the hero card changes `state.homeSelectedAccountId`**, same
   as clicking a chip does today — the whole screen (income/expense
   cards, spent-today, sparkline, recent activity) follows the carousel
   page, identical to today's existing scoping behavior. This is a
   swap of the *input mechanism* (swipe/click-arrow/click-dot instead of
   a chip click), not a change to what gets scoped or how.
3. **Page order**: "All accounts" first, then each account in `accounts`'
   existing array order (same order the chips used) — including archived
   accounts, unchanged from today. **No wraparound**: swiping past the
   last account or before "All accounts" is a no-op (rubber-band or just
   ignore past the edge — Codex's call on which feels right, consistent
   with how this app already treats other edge-of-range gestures if any
   exist, else default to a small rubber-band per `apple-design`
   conventions already informally followed elsewhere in this app's
   motion).
4. **Page-indicator dots**: one dot per page (1 + `accounts.length`),
   rendered at the bottom of the hero card (per the sketch). **Hidden by
   default** (`opacity: 0` at rest) — they fade in as soon as a drag/swipe
   gesture starts (pointerdown+move, or a tap), stay visible through the
   interaction, and **auto-fade back out ~1.5s after release/tap-away**,
   with no other UI depending on their visibility. This is new motion, not
   covered by an existing pattern in this app — tokenize using the
   existing fast/normal duration tokens per `docs/UX.md`'s Motion section
   rather than a new bespoke duration, and respect
   `prefers-reduced-motion` (skip the fade animation, dots can just
   toggle visibility instantly, per `docs/UX.md`).
5. **Desktop (no touch/swipe) gets explicit left/right arrow buttons on
   the hero card, always visible** (not hidden-until-hover) — this
   mirrors the existing precedent in `docs/UX.md`'s Chips section ("a chip
   row wraps instead of scrolling on desktop — a mouse has no swipe
   affordance"): removing the chip row removes desktop's *only* existing
   way to change account, so an explicit, permanent affordance is
   required, not an optional nicety. The dots remain their own
   hidden-until-interaction indicator on desktop too (arrows are always
   visible; dots still only appear while interacting, including hovering/
   clicking an arrow).
6. **Dots are themselves clickable** to jump directly to that page (both
   mobile and desktop) — they're real buttons, not decorative, so a user
   who has revealed them (by swiping) can also tap one to jump elsewhere
   without swiping further.
7. **Per-page label**: the `.kicker` text (top-left of the hero card,
   currently always `l.balanceLabel`) becomes page-dependent:
   - "All accounts" page → a **new** i18n string, "Total balance" /
     Thai equivalent (not the existing `l.balanceLabel`, which the sketch
     explicitly marks for change — reuse `l.balanceLabel`'s *key* only if
     its th/en pair is being changed everywhere it's used; if
     `l.balanceLabel` is referenced elsewhere with the old "Balance"
     wording, add a distinct new key instead of mutating a shared one).
   - Each account page → that account's own `name` (already available on
     the `Account` object — same field `accountSwitcherHtml()` used for
     chip labels), rendered exactly as-is (no truncation beyond whatever
     the `.kicker` box already does for overflow, if anything).
8. **No change to persistence**: `state.homeSelectedAccountId` stays
   UI-only/not persisted, per its existing documented treatment — the
   carousel resets to the "All accounts" page on every fresh load/reload,
   same as today's chip default.

## New behavior

### Markup / state

- Remove `accountSwitcherHtml()` and its call in `renderHome()`
  (`home.js:123`).
- `.hero-card` gains: a horizontal swipeable track containing one page per
  account (All accounts + each `accounts[i]`), a dot row anchored at the
  bottom, and (desktop) two arrow buttons anchored at the card's left/
  right edges (over the card content, matching the sketch's positioning
  of the eye icon as an overlaid control).
- The **currently rendered page's content is exactly what `.hero-card`
  renders today** for that `selectedId` (kicker label, amount, sparkline,
  delta pill, eye/hide-amounts button) — this spec changes navigation and
  the kicker label source, not the balance/sparkline/delta computation
  logic itself.
- Swipe gesture mechanics (drag tracking, threshold-to-commit, snap-back)
  should follow this app's one existing drag pattern
  (`docs/UX.md`'s Motion section: "Swipe-to-reveal is one pattern... an
  absolutely positioned layer... translating over it" plus the drag
  math in `docs/specs/swipe-to-reveal-transaction-actions.md`'s Revision
  1/2 — 50%-of-width snap threshold, `transform`-only, no layout
  animation) as the closest existing reference for "drag with a snap
  threshold" in this codebase, even though this is a different component
  (full-page horizontal carousel vs. a row's reveal-panel) — reuse the
  *math and transform-only discipline*, not the literal CSS classes.
- Committing a swipe (past threshold, or arrow/dot click) updates
  `state.homeSelectedAccountId` and re-renders, exactly like today's chip
  click handler at `home.js:196-200` — remove that handler along with the
  chip markup and replace it with the new swipe/arrow/dot handlers doing
  the same assignment.

### Dots

- Container `.hero-dots` (or similar), one `<button class="hero-dot">`
  per page, `aria-label` naming the page (e.g. "All accounts", or the
  account's name) so screen readers get a real target even though the
  dots are visually hidden at rest.
- Active dot gets a distinct filled/solid treatment vs. inactive dots
  (per the sketch: solid white active dot, dimmer/outline inactive —
  exact opacity values are Codex's to pick against the hero card's
  existing gradient background, checked for contrast in review).
- Opacity-only fade in/out (`transform`/`opacity` per `docs/UX.md`'s
  Motion rule), timer-driven fade-out (~1.5s after last interaction),
  cleared/reset on each new interaction so rapid re-swiping doesn't cut
  the dots off mid-view.

### Desktop arrows

- Two icon buttons (reuse the app's existing `.btn-icon`/circular icon
  button treatment per `docs/UX.md`'s Buttons section — "icon: circular,
  inset fill" — not a new button variant), left/right chevrons, always
  visible at `>=1024px` (this app's existing desktop breakpoint per
  `docs/UX.md`'s Responsive section), disabled/dimmed (not hidden) at the
  first/last page since there's no wraparound (decision 3).
- Hidden on mobile widths (touch has the swipe gesture; showing both
  would be redundant chrome cluttering a small card).

## Out of scope

- No change to `computeBalance`, `monthTotal`, `pctDeltaLabel`,
  `sparklineSvg`, or any other derived-data function in `derived.js` —
  this spec only changes *how the existing `selectedId` gets set* and
  *what the card renders around* the existing computed values.
- No change to the Add screen's account picker, Settings' account
  management rows, or any other place `accounts` is rendered/selected
  outside Home.
- No persistence of the carousel's current page across reloads (decision
  8) — a future spec, not this one, if that's ever wanted.
- Not touching the greeting/date header (see
  `docs/specs/home-header-greeting.md`) or the income/expense icon color
  (see `docs/specs/home-income-expense-icon-color.md`).
- Zero-accounts edge case: if `accounts` is empty, the carousel has
  exactly one page ("All accounts") — dots/arrows should degrade
  gracefully (e.g. render zero dots, or one non-interactive dot, and
  disabled/absent arrows) rather than error; exact zero/one-account
  degenerate-case visuals are Codex's call, called out here so it isn't
  missed, not a blocking open decision.

## UX constraints

- Follow `docs/UX.md`.
- Match existing: `.hero-card` (`src/screens/home.js`, `styles.css`
  around line 395) for the card's own visual treatment (gradient,
  padding, negative-balance variant); the existing drag/snap-threshold
  math from `docs/specs/swipe-to-reveal-transaction-actions.md` Revisions
  1-2 for the gesture mechanics; `.btn-icon` for the desktop arrows;
  `docs/UX.md`'s Chips section precedent ("wraps... a mouse has no swipe
  affordance") as the direct justification for the always-visible desktop
  arrows.
- Reuse: `state.homeSelectedAccountId`, `computeBalance()`, `accounts`
  array order, `accountDisplayName`-adjacent `account.name` field access
  pattern already used by `accountSwitcherHtml()`.
- New design primitives required by this spec: **one** — the
  hidden-until-interaction dot indicator with auto-fade-out is new motion
  not covered by any existing pattern (justified by decision 4 above;
  tokenize its duration using existing fast/normal tokens rather than a
  bespoke value).
- Mobile (<1024px): swipe/drag gesture on the card is the primary input;
  dots visible only during/briefly after interaction; no arrow buttons.
- Desktop (>=1024px): always-visible left/right arrow buttons are the
  primary input (no swipe gesture available); dots still exist and follow
  the same hidden-until-interaction rule, revealed by interacting via
  click on an arrow or dot itself; clicking a dot directly still works on
  both mobile and desktop per decision 6.

## Verification plan

Medium-to-High risk (new gesture code, a UI-only-but-real state wiring
change, replaces the only existing account-switching UI on Home) — full
matrix likely warranted:

1. `npm test` — any unit coverage for `home.js`'s render/selection logic.
2. `npm run build`.
3. `npm run test:e2e` — this is exactly the kind of interaction (drag/
   swipe, threshold behavior, hidden-until-interaction UI) that's hard to
   cover cheaply any other way, per `docs/WORKFLOW.md`'s Medium/High tier
   guidance.
4. Real-browser check, both mobile-width (touch/pointer drag simulation)
   and desktop-width (arrow clicks), light and dark, `th` and `en`:
   - Swiping/dragging between pages updates the kicker label, balance,
     sparkline, delta pill, income/expense cards, spent-today, and recent
     activity together, in sync.
   - Dots are invisible at rest, appear during a drag, and confirm the
     **actual end-state opacity value** after the ~1.5s auto-fade timer
     fires (assert the end state, not just that opacity moved in the
     right direction, per `docs/UX.md`'s Motion rule and this project's
     standing lesson to verify animated end-states rather than direction
     of change only).
   - Desktop arrows are visible without hovering, work by click, and are
     disabled/dimmed (not hidden) at the first/last page.
   - Clicking a dot directly jumps to that page.
   - No wraparound past either edge.
   - Reload resets the carousel to "All accounts" (matches today's
     `homeSelectedAccountId` non-persistence).
   - Zero-account and single-account accounts (if feasible to set up in
     the test environment) don't error.
   - `prefers-reduced-motion` disables the dot fade animation (instant
     show/hide instead).

## Revision 1: sliding active-dot indicator + tighter spacing

Maintainer feedback after WI-021 shipped: the dots (`.hero-dot`, 24px hit
targets, no `gap` — see review) read as too far apart, and switching pages
only recolors/resizes the dot at the new index in place; nothing visually
connects the old and new positions. Requested reference: iOS-style page
indicators, which sit much tighter together and (in their modern
continuous-interaction form) move a single indicator between slots rather
than recoloring each dot independently.

- **Decision:** replace the per-dot recolor with one small sliding
  indicator element, absolutely positioned inside `.hero-dots`, that
  translates (`transform: translateX`, not `left`) from the previous
  active dot's slot to the new one whenever the selected page changes. The
  existing `.hero-dot` buttons remain the track/inactive marks and keep
  their click targets and `aria-label`s unchanged; the sliding indicator
  is purely a visual overlay layered on top, not a new interactive
  element.
- **Spacing:** tighten the dots' pitch so the visible marks sit close
  together — closer to the tight spacing of iOS's system page control
  (small dots with only a few px of visual gap) than the current ~16-18px
  of whitespace between them. Exact pixel values (dot size, pitch, hit
  target) are Codex's to pick against the hero card's actual rendered
  size, checked in review for both visual tightness and touch-target
  reasonableness — dots remain a secondary control (swipe/arrows are
  still primary input), so a smaller-than-44pt hit target here is
  acceptable, consistent with the original ticket treating this indicator
  as secondary, hidden-until-interaction affordance rather than primary
  navigation.
- **Motion:** reuse the fade in/out timing already shipped (opacity,
  ~1.5s auto-hide, `prefers-reduced-motion` disables it) unchanged. Add
  only a `transform` transition on the new sliding-indicator element,
  using an existing duration token (`--duration-fast` or
  `--duration-normal`, Codex's pick), guarded the same way —
  `prefers-reduced-motion: reduce` jumps straight to the new position
  instead of animating.
- **Out of scope:** no drag-following of the indicator mid-swipe (wiring
  it to the live drag offset is a materially bigger change than asked
  for) — the indicator only animates on commit (the page actually
  changing), matching how the dots' own active state already only updates
  on commit today.
- **Also fold in:** the review-confirmed leftover dead CSS from the
  original ticket — `.account-switcher-row` and its `::-webkit-scrollbar`
  rule in `styles.css` (~line 313) are unused now that
  `accountSwitcherHtml()` and its markup are gone; remove them while
  touching this area.

## Revision 2: dot visual style — filled, no outline, wider spacing

Maintainer feedback after Revision 1 shipped: the dots' hollow-outline
style (`border` on `::before`, transparent center) isn't wanted, and the
12px pitch from Revision 1 reads as too tight. Reference:
`E:\design\4df406d7a79e782db5d9cb4224ef1ddf.gif` — "this is perfect,
visual wise not animation," i.e. match this reference's dot fill/size/
spacing exactly, but keep Revision 1's sliding-indicator mechanism and
timing untouched.

- **Fill, not outline:** `.hero-dot::before` currently has
  `border: 1px solid rgba(255,255,255,0.72)` with a transparent center —
  remove the border, use a solid translucent fill instead (a lower-opacity
  white background, matching the reference's dimmer non-active dots).
  Every dot (`.hero-dot::before`) should render identically — same fill,
  same size — since Revision 1's `.hero-dot-indicator` overlay is now the
  only thing signaling which page is active; `.hero-dot.active::before`'s
  separate bigger/white-border treatment is redundant with the indicator
  sitting on top of it and should be removed rather than kept alongside.
- **Uniform size:** the reference's dots are all the same diameter,
  including whichever one the indicator sits over — size the indicator
  element itself to match the static dots' diameter (no longer bigger),
  so the only visual difference between an active and inactive slot is
  the indicator's opacity/color, not its size.
- **Spacing:** widen the pitch from Revision 1's 12px — the reference
  shows more breathing room between dots than that. Match the reference
  image's proportions (gap roughly on the order of the dot's own
  diameter, not tighter); exact pixel values are Codex's to pick against
  the hero card's actual rendered size and the reference image, checked
  in review.
- **Out of scope:** this revision is purely visual/CSS (dot fill, size,
  spacing) — no change to the sliding/FLIP mechanism, timing, tokens, or
  reduced-motion handling from Revision 1.
