# Accessible names and focus indicators

Status: **specced, not built.** Two defects found during the `docs/UX.md`
design-system audit and deliberately left unfixed by that pass, which was
documentation-only. Both are recorded under that file's Known UI debt as
ranking above cosmetic token normalization.

Scope is narrow on purpose: make existing controls reachable and
identifiable by keyboard and screen reader. **Nothing may change visually
for a mouse or touch user**, and no control changes what it does.

## Motivation

`docs/UX.md` states two rules as canonical:

> Every interactive control needs an accessible name.
> Every interactive control needs a visible focus indicator.

The app violates both in specific, enumerable places. Because the rules are
now documented, every violation is a defect by this repo's own review
classification (`docs/WORKFLOW.md` §4), not a matter of taste.

## Defect 1 — the mobile tab bar has no accessible name

`index.html`'s `#tabbar` renders five `<button class="nav-btn">` elements
whose only content is an `aria-hidden="true"` `<svg>`. There is no
`aria-label`, and no visible text. A screen reader announces five unlabeled
buttons; the app's primary navigation is unusable non-visually.

How it got here: the tab bar went icon-only in the tab bar polish pass, and
its `<span data-l>` labels were removed. `renderChrome()`
(`screens/router.js`) localizes navigation by filling
`.nav-btn span[data-l]` — with the spans gone, nothing replaced them.
`#sidebar`'s buttons kept their spans and are unaffected.

The strings already exist: `tabHome`, `tabTx`, `tabAdd`, `tabInsights`,
`tabSettings` (`i18n.js`). No new `STRINGS` entries are needed.

### Decision 1.1 — label via a new `data-l-aria` attribute, resolved in `renderChrome()`

Add `data-l-aria="<key>"` to each of the five `#tabbar` buttons, and one
line to `renderChrome()` that sets `aria-label` from `L()` for every
`[data-l-aria]` element.

Two alternatives were rejected:

- **A static `aria-label` in `index.html`** would hardcode one language,
  violating `docs/UX.md`'s rule that all user-facing text — *including
  `aria-label` text* — goes through `STRINGS`, and would not follow a
  language switch.
- **Reusing the existing `data-l` attribute** would not work: `data-l`
  means "set this element's `textContent`", so reusing it would either
  render a visible label (reverting the deliberate icon-only design) or
  need a special case inside the existing loop.

`renderChrome()` is the correct home because it already re-runs on every
language switch, navigation, and auth-state change — the same reason the
existing `data-l` loop lives there. No new listener is required.

### Decision 1.2 — visible labels are not coming back

The icon-only tab bar is a deliberate design decision. This ticket adds a
name for assistive technology only. Any visual change to the tab bar is a
regression.

## Defect 2 — fourteen controls have no visible focus indicator

`docs/UX.md`'s canonical focus treatment is a 2px accent outline (offset 2px
in general, offset 1px where the ring sits inside an input box). Fourteen
interactive controls have no `:focus-visible` rule and therefore no visible
indicator when reached by keyboard:

| Control | Note |
|---|---|
| `.nav-btn` | one rule covers both the tab bar and the sidebar |
| `.tab-opt` | needs `:has(input:focus-visible)` — see Decision 2.2 |
| `.switch` | |
| `button.toggle-row` | `all: unset` caveat — see Decision 2.3 |
| `.home-profile-btn` | |
| `.toast-undo-btn` | |
| `.shortcut-btn` | |
| `.period-pill button` | covers both `.step` and `.trigger` |
| `.picker-year-row .step` | |
| `.picker-year-heading` | |
| `.picker-month-cell` | |
| `.filter-field-label button` | |
| `.kind-toggle button` | |

Two controls flagged by the initial audit sweep are **not** defects, and are
recorded here so a later pass does not re-raise them:

- **`.date-native-overlay`** is already `tabindex="-1" aria-hidden="true"`
  (`add.js`). It is an invisible duplicate affordance over the date field;
  it is correctly excluded from the tab order and must stay that way. The
  audit sweep flagged it only because its CSS sets `cursor: pointer`.
- **`.filter-checkbox-row`** is a `<label>` wrapping a real `<input
  type="checkbox">`, which receives the browser's own focus ring.
  Verify-only (Decision 2.4); expected to need no change.

### Decision 2.1 — reuse the canonical treatment exactly

Every added rule uses the same outline the eleven existing `:focus-visible`
rules use. No new color, width, offset, radius, or shadow is introduced.
This is a defect fix, not a design change — `docs/UX.md` already names the
treatment, so there is nothing to decide.

### Decision 2.2 — `.tab-opt` rings the visible label, not the hidden input

`.tab-opt`'s real `<input type="radio">` is `opacity: 0; width: 0; height:
0`, so a ring on the input itself would be invisible. The rule must target
the wrapping label via `:has(input:focus-visible)`. `:has()` is already used
three times in this stylesheet (including `.tab-opt:has(input:checked)`), so
this introduces no new browser-support question.

This matters for six `role="radiogroup"` controls: the Add form's Type
selector, the filter type selectors, Language, and Accent color.

### Decision 2.3 — verify `button.toggle-row` in a real browser

`button.toggle-row` declares `all: unset`, which also resets `outline` and
can suppress the browser's own focus ring. The added rule is expected to win
on specificity and source order, but **this must be confirmed against a real
browser**, not reasoned about — `all: unset` interacts with the UA
stylesheet in ways that are easy to get wrong on paper. This affects every
Settings drill-in row and every export row.

### Decision 2.4 — confirm the native checkbox ring is actually visible

Check `.filter-checkbox-row`'s checkbox in a real browser at both themes. If
the native ring is visible and meets the same standard, change nothing and
record that here. If it is not, give the label the canonical treatment via
`:has(input:focus-visible)`, the same as Decision 2.2.

## Verification plan

Both defects are invisible to the existing suite, which drives the app by
clicking. Verification must exercise the keyboard and the accessibility
tree.

**Defect 1**
- E2E: every `#tabbar` button exposes a non-empty accessible name; the five
  names match the active language's `STRINGS` values; switching language in
  Settings updates them. Assert the actual strings, not merely
  "non-empty" — a name that never re-localizes would otherwise pass.
- E2E regression: the tab bar renders no visible text, and the buttons'
  rendered geometry is unchanged.

**Defect 2**
- E2E: for each of the fourteen controls, focus it via real keyboard
  interaction and assert a painted outline. Reuse the existing geometry
  assertion pattern in `add-sheet-keyboard-ghosting.spec.js` (which already
  reads `outlineWidth`/`outlineOffset` from computed style) rather than
  inventing a new one.
- **Focus the control the way a keyboard user reaches it.** Calling
  `.focus()` on an element can paint a ring that real `Tab` navigation never
  produces, since `:focus-visible` depends on the interaction modality —
  this is the same class of trap as driving a hidden `<select>` instead of
  the visible chip row.
- Manual browser check for Decisions 2.3 and 2.4, in light and dark mode.
- Manual screen-reader pass over the tab bar is desirable but not required
  to close these tickets.

**Both**
- `npm test`, `npm run test:e2e`, `npm run build` per the proportional
  matrix (screen changes require all three).
- Visual diff check: no rendered change at rest, mobile and desktop, light
  and dark, Thai and English.

## Out of scope

- **`aria-current` on the active nav button.** Screen reader users get no
  "current page" indication today. Real, but a different requirement from
  "controls have names"; worth its own ticket.
- **Restoring visible tab bar labels** — deliberately not happening
  (Decision 1.2).
- **A full WCAG audit.** These two tickets close two enumerated defects; they
  do not claim the app is conformant.
- **Any token, spacing, color, or radius normalization.** All eight of
  `docs/UX.md`'s open design decisions stay open.
- **Contrast of the focus ring against every surface it can land on.** The
  accent outline is the documented treatment and is used unchanged; if a
  specific placement turns out to be low-contrast, that is a new finding,
  not part of this work.
