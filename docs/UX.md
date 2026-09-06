# UX / Design System

Reusable UX, visual, and interaction rules for whereisit. Read this before
building or reviewing anything that renders a screen.

**Core principle: existing canonical pattern > new pattern.** If a pattern
below satisfies a requirement, reuse it. A new visual primitive (spacing rule,
color treatment, typography treatment, radius, component style, or interaction
behavior) requires an explicit decision recorded in the feature's spec first.

**An inconsistent legacy pattern is not a canonical pattern.** The app contains
drift; "Known UI debt" names it. Never copy from that list just because it
exists in the codebase today.

This file owns *rules and their reasons*, stated semantically. Concrete values
live in `styles.css` and `theme.js`; implementation lessons live in
`docs/ARCHITECTURE.md`; current state lives in `docs/SOT.md`. See
`docs/WORKFLOW.md`'s ownership table.

## Design principles

- **Mobile-first; desktop is an additive layer** — desktop never gets a pattern
  mobile lacks an answer for.
- **Reuse before invention**, even when a new primitive would be tidier.
- **Measured, not eyeballed** — contrast, localized string widths, and animation
  end-states are verified in a real browser; a screenshot that "looks fine" is
  not evidence.
- **Undo over confirm**, and **one primary action per view**.

## Design-token ownership

Governs every color statement below.

- `styles.css`'s `:root` holds the **pre-JS first-paint fallback** only.
- `theme.js`'s `applyTheme()` is the **runtime owner** of every color that
  varies by theme or accent preference. Editing a themed color only in `:root`
  changes the first paint and nothing else.
- Derived tokens (`*-tint`, the accent shadow) are `color-mix()` over a base
  token, so they follow it automatically and must not be set from JS. JS
  references colors as `var(--token)` **strings**, never hex — see
  `rowTone()`/`GOAL_TONES` (`categories.js`) and `CHART_COLORS` (`derived.js`).
- **A foreground on a `*-tint` background must be theme-invariant.** Tints mix
  toward white in *both* themes, so a token that brightens for dark mode is
  wrong there — that is what the `-tint-fg` tokens are for. Getting this wrong
  once shipped a 1.66:1 label.

Theme-level changes (palette, font family, radius/spacing/type scales) are
token-level changes and need no edit here unless the UX rule itself changes.

## Layout and spacing

- One shared screen element, fully re-rendered per screen; no per-screen scroll
  container, the document scrolls. Content is a centered column that widens in
  stages — screens with real multi-column content opt into the wide cap, while
  form-shaped screens (Add, Settings) deliberately stay narrow.
- **Three breakpoints only**, and only the largest is visible to JS
  (`isDesktopShell()`). Don't add a fourth or branch JS on another width.
- **Fixed bottom chrome contract:** anything anchored above the tab bar adds
  the tab-bar height token *and* the bottom safe-area inset. A flat pixel
  offset is wrong on notched and installed-PWA devices.
- Use a `--space-*` token when one fits the value exactly; never invent a step.
  Adoption is partial — see Known UI debt.

## Typography hierarchy

Roles, descending emphasis: **numeric display** (hero balance, Add-sheet
amount) → **screen title** → **section heading** → **row title** → **body** →
**meta/caption** → **overline** (uppercase, letter-spaced section labels).

- The UI family is one token pairing a Latin face with a Thai face — the Latin
  face has no Thai glyphs at all. Never add a third UI family; the brand
  wordmark is the one documented exception.
- Headings are heavy-weight with negative letter-spacing; body text is not.
- Amounts use tabular numerals wherever edited or compared.
- **No type-scale tokens exist yet** (Known UI debt). Match an existing role's
  treatment rather than picking a new size.

## Color semantics

- **Accent** is the brand color *and* the "money going out" hue: primary
  action, active chip/tab, and the expense series in charts and row tones.
  User-switchable between two options.
- **Expense** is the danger/negative/destructive hue: destructive buttons,
  invalid fields, overdue rows, error status.
- **Income** is positive; **warning** is caution; the chart rotation colors are
  chosen to be unmistakable for either accent option.
- **Surfaces** and **text** are each a three-step ladder (page → card → inset;
  primary → muted → tertiary), plus divider/border and a separate tab-bar token
  — interactive components must clear a stricter contrast floor than static
  text.
- **Amount coloring:** income tinted positive; expense and transfer neutral
  primary text. A normal expense is never red — red means *error*, not
  *outgoing*.

## Buttons and action hierarchy

One base button (pill, fixed height, press-scale, disabled opacity, accent
focus ring) with variants: **primary** (accent fill + accent shadow, one per
view), **secondary** (card fill + border), **ghost** (text only),
**danger** (expense fill, destructive only), **icon** (circular, inset fill),
plus block/small as density modifiers rather than new variants.

Documented exception: the Add sheet's header uses plain text Cancel/Save,
matching sheet convention rather than the app's full-width button style.

## Chips and filters

- Chips are bordered pills; active is an accent fill with white text. Selection
  chips (category, account) and removable filter chips are distinct roles.
- A chip row scrolls horizontally on touch with scrollbar chrome hidden, and
  **wraps instead of scrolling on desktop** — a mouse has no swipe affordance.
- Segmented controls are a real radio group wrapped in labels: the input is
  visually hidden, the label renders as the pill. Drive them by clicking the
  label, never the hidden input (as the e2e suite does).
- Collapsed filters sit behind a filter button with a count badge; only search
  stays permanently visible.

## Cards and list rows

- **All cards share one surface treatment** from a single base rule. A new card
  type joins that rule rather than declaring its own surface.
- **Row anatomy:** leading icon avatar → flexible info column → shrink-0
  trailing amount or control. The info column must set `min-width: 0` or its
  ellipsis silently does nothing (`docs/ARCHITECTURE.md`).
- Rows are divider-separated, last divider removed.
- Icon avatars are tinted by semantic role via `rowTone()`/`GOAL_TONES`, not
  ad hoc inline colors.
- Any branch on transaction type handles income, expense, **and** transfer
  explicitly (`docs/ARCHITECTURE.md`).

## Forms and validation

- Label-above-control with a bordered input box; focus is an accent outline on
  the wrapper.
- **Native constraint validation is the default.** Only where a native bubble
  cannot do the job does a field get an explicit error treatment (error border
  plus `aria-invalid`), with the message delivered as a toast.
- Toggling a field's visibility per mode must toggle its `required` attribute
  in the same place — a hidden `required` control still blocks submit
  (`docs/ARCHITECTURE.md`).
- Destructive form actions follow the Undo rule below, not a confirm step.

## Bottom sheets and dialogs

All sheets share one anatomy and one set of helpers; a seventh sheet copies
this rather than hand-rolling modal plumbing.

- **Anatomy:** backdrop → non-scrolling shell → non-scrolling header (grabber,
  title, close) → an inner body that is the *only* scrollport. That separation
  is load-bearing, not incidental — `docs/ARCHITECTURE.md` has the mechanism.
- **Plumbing:** the focus trap (which also carries scroll-lock and
  viewport-sizing), the grabber helper, and the drag-to-dismiss helper all come
  from `utils.js`. Sheets whose markup persists wire once; sheets that
  regenerate their markup re-wire drag/close/focus-trap inside the same
  re-render.
- Sheets are a **mobile pattern** — at desktop width the same content becomes a
  full-page form or an inline panel.
- A dialog not dismissible by gesture must not look like a bottom sheet; the
  app lock screen is deliberately a centered panel for this reason.

## Navigation

- Two mutually exclusive shells for the same destinations — mobile bottom tab
  bar, desktop left sidebar — sharing one nav button class so active state and
  click handling are wired once.
- The primary create action is broken out of the tab bar as a raised accent
  circle rather than a fifth equal tab, and opens a sheet rather than
  navigating; the active tab stays where it was.
- Mobile drill-in sub-pages push a **real same-URL history entry** and close
  only via browser Back. Desktop selects the same sections as detail panes
  without touching history.

## Feedback states

- **Toast is the single feedback channel** for success and error alike,
  anchored above the tab bar; longer when it carries an action.
- **Destructive actions execute immediately and offer Undo in a toast.** The
  app has no confirm dialogs anywhere; do not add one.
- **Empty states** are informational (plain centered note) or recoverable
  (icon, message, and an action such as Add or Clear filters). Pick by whether
  the user has an action to take.
- **Loading** is currently only "disable the pressed control, reflect progress
  in a nearby status line." There is no spinner or skeleton vocabulary; don't
  invent one in a ticket that doesn't call for it.

## Motion

- Two durations (fast, normal) and one standard easing are tokenized; use them
  for state changes, hovers, and screen entry.
- Gestural reveal/swipe motion uses a longer spring easing that is **not
  tokenized yet** (Known UI debt) — copy the existing swipe rule rather than
  inventing a curve.
- **Swipe-to-reveal is one pattern with two surfaces** (transaction rows,
  Settings manage rows) that are contractually identical: an absolutely
  positioned actions layer beneath an opaque content layer translating over it,
  circular actions that scale in, full-swipe-to-delete. Any visible difference
  between the two is a bug.
- **Animate `transform` and `opacity`.** The one documented exception is the
  transaction row's trailing group, which animates real layout `width` so a
  flex sibling can reclaim space (`docs/ARCHITECTURE.md`).
- **Assert motion end-state values, not just direction of change.** A damped
  reveal once passed every test while visually reaching half its target.
- Entry animations fire on genuine navigation only, never on incidental
  re-renders (a sync pull, a local save). Respect `prefers-reduced-motion` —
  coverage is partial today (Known UI debt); new motion must honor it.

## Responsive behavior

- Every UI ticket states **both** mobile and desktop behavior. Several screens
  have genuinely different markup paths, so specifying one leaves the other
  undefined.
- Desktop-only affordances (dense table rows, detail panes, wrapped chip rows,
  wider charts) are added inside the widest breakpoint and must not disturb the
  mobile rules they build on.
- Wrap every desktop grid `fr` track in `minmax(0, …)` (`docs/ARCHITECTURE.md`).

## Localization

- All user-facing text goes through `STRINGS` (`docs/ARCHITECTURE.md`) —
  including every `aria-label`, which is easy to leave as a literal.
- Both languages are LTR; there is no RTL requirement.
- **Thai is the primary language and generally the longer string.** Any fixed
  width, truncation, or single-line control holding localized text is verified
  against the Thai rendering in a real browser, not estimated. Prefer
  content-sized cells with an ellipsis fallback over equal fixed cells.
- Dates render in the active language's calendar convention; don't assume a
  Gregorian-width year.

## Accessibility

- **Every interactive control needs an accessible name.** Icon-only controls
  need an `aria-label` from `STRINGS`; sprite icons are always `aria-hidden`.
- **Every interactive control needs a visible focus indicator** — the standard
  accent outline. A control whose real input is visually hidden still needs one
  on its visible proxy.
- Modal surfaces get `role="dialog"`, `aria-modal="true"`, and a focus trap.
- Contrast is verified by calculation against the surface the element actually
  sits on, in both themes; pointer targets clear the minimum target size.
- Rows that exist to be activated are real `<button>`/`<a>` elements styled as
  rows, not divs with click handlers.

## Icons

- One self-hosted sprite is the only icon source, drawn through the shared
  `icon()` helper. An icon name not in the sprite does not exist.
- Icons are decorative by default (`aria-hidden`) — meaning is carried by
  adjacent text or the control's `aria-label` — and inherit `currentColor`
  unless a semantic tone applies. Sizes are contextual.
- Editing the sprite file has its own documented failure mode and its own
  check — read `docs/ARCHITECTURE.md` before touching it.

## Known UI debt

Real drift. **Not canonical — do not copy.** Fixing these is separate ticketed
work.

- **Spacing scale incomplete and partly adopted:** one documented step was
  specified in a merged spec but never defined, the most common large spacing
  value is still a raw literal, and token adoption covers roughly a tenth of
  the rules.
- **No typography tokens**, plus a few one-off fractional font sizes with no
  stated reason.
- **Icon-button sizes have forked** across several near-identical values, and
  one in-file comment claims a match that is not true.
- **Some radii and one shadow pair are written raw** where a token exists or
  would obviously fit.
- **Duplicate rule bodies:** the two chip families and the two swipe-action
  families are byte-identical. The swipe pair is the risky one, since those two
  surfaces are required to stay identical.
- **`prefers-reduced-motion` coverage is partial** — screen and card entry
  honor it; sheets, backdrop, toast, shake, and swipe transitions do not.
- **Hover behavior is inconsistently guarded** for touch devices.
- **Static inline styles** in several templates, mostly patching the empty-state
  class into shapes it was not built for.
- **Card interior padding is ad hoc** across roughly eight distinct values.
- **A few in-file comments are stale** (spacing-token scope, icon-button
  sizing, empty-state class purpose).
- **No resize re-render:** crossing the desktop breakpoint by resizing a window
  leaves JS-branched markup stale until the next render.

## Open design decisions

Unresolved and **deliberately not decided here.** Each needs a maintainer
decision, recorded in a spec, before any related normalization pass.

1. **Shape of the spacing scale** — the current linear scale was chosen to fit
   values already judged correct, but several heavily used values fit neither
   it nor a doubling scale.
2. **Card interior padding** — normalizing changes visual density on every
   screen at once; explicitly deferred once already.
3. **Icon-button sizes** — collapsing the forked sizes visibly changes controls
   throughout the app.
4. **The two identical chip families** — merge to prevent drift, or keep them
   separate to preserve the ability to diverge.
5. **The one-off fractional font sizes** — almost certainly drift, but rounding
   them is a visible text-size change in several places.
6. **Whether the accent should keep doubling as the expense hue** — it works,
   but it means the brand color reads as "money going out." A product-identity
   decision, not an architectural one.
7. **The sheet corner radius**, which matches no radius token — snapping it
   either way is visible on every sheet.
8. **Whether "no confirm dialogs, Undo instead" is inviolable or a strong
   default** — Undo has no safety net for a destructive action taken offline
   and never synced.
