# Spec: Color palette refresh (accent + base surfaces)

Status: proposed (WI-017, WI-018).

Requested directly, with a reference image (fintech card mockup: blue
gradient balance card, white cards on a light-gray page, red/green
amounts). Split from `docs/specs/amount-color-semantics.md` (the
red/green amount-coloring rule change) because this spec covers the
token-level palette itself — accent hues and base surface colors — a
separate, independently reviewable concern implemented as two tickets.

## Key decisions (confirmed with the user before building)

1. **"Purple" accent is relabeled** and its hue shifts away from reading
   as violet. The **stored preference value stays the literal string
   `"purple"`** (`state.accentColor`, `theme.js`'s `ACCENT` object key,
   `settings.js`'s radio `value="purple"`) — only its display label and
   hex values change. This avoids a data migration for any user who
   already has `"purple"` saved; per this project's standing rule,
   schema/data-format changes need an explicit ask, and none is needed
   here since the stored value is unchanged.
   - `i18n.js:52`: `accentColorPurpleOpt` → Thai "น้ำเงิน", English "Blue".
   - **Superseded (WI-017 round 2):** the maintainer rejected round 1's
     flat blue on sight and supplied concrete reference images. Pixel-
     sampled via canvas, those references' own accent matched the app's
     *original* `#6247ea` exactly — so the hex reverted to unchanged, and
     the label became "Indigo" (`คราม`), not "Blue". See WI-017's Review
     notes (Round 2) for the full measurement.
2. **"Coral" accent shifts warm — away from its current red-leaning
   hue.** Explicit reason: WI-016 makes expense amounts red
   (`docs/specs/amount-color-semantics.md`), and coral's current base
   (`#cd4805`) already reads close to that red — the shift keeps the
   brand accent visually distinct from the new "this is money leaving"
   signal at a glance.
   - **Superseded (WI-017 round 2):** round 1's amber (`#A56409`) was also
     rejected on sight. The maintainer asked for "something like claude
     color accent" instead — a warm terracotta/clay, landed on `#B25738`
     after darkening to clear 4.5:1 white-text contrast at a fixed hue/
     saturation (same method as the original 2024 coral pass). See
     WI-017's Review notes (Round 2).
3. **Base surface tokens (bg/card/surface/divider/border) get retuned in
   both light and dark themes**, not just dark. Light mode's current
   `bg`/`card` (`#f6f6f8`/`#ffffff`) already closely resembles the
   reference's light-gray-page-plus-white-card look, so this is a
   refinement pass, not a from-scratch redesign; dark mode should read as
   a natural dark counterpart of the same clean, high-contrast-card feel,
   not an independent design.
4. **No new token names** — this is retuning the existing eight per-theme
   keys `theme.js`'s `applyTheme()` already sets (`bg`, `card`, `surface`,
   `divider`, `border`, `muted`, `tertiary`, `tabbarInactive`, `text`), not
   adding a ninth.
5. **Every contrast ratio `theme.js`'s existing inline comments document as
   already-tuned must be re-verified, not assumed to still hold**, since
   several of those ratios (`tabbarInactive` vs `bg`, `muted`/`tertiary` vs
   `bg`/`card`, `-700` amount variants vs `card`) are computed against the
   *current* bg/card hex and could silently regress below their documented
   floor (3:1 for interactive tabbarInactive, 4.5:1 for small text) if bg
   or card moves without re-checking. This is exactly the failure mode
   `docs/UX.md`'s "Measured, not eyeballed" principle exists for, and why
   the surface-retune ticket carries a higher execution profile than the
   accent ticket (see its ticket file).
6. **Avatars/category icons are unaffected** — explicitly confirmed with
   the user as out of scope; this pass is about the palette, not the
   avatar/icon treatment.
7. **Exact new hex values are not decided in this spec.** Both tickets
   require the implementer to pick values and verify them against real
   computed contrast in a browser (the same method `theme.js`'s existing
   coral-tuning comment documents — "Resolved via canvas getImageData
   against real Chrome, not hand-converted") rather than eyeballing or
   hand-converting.

## New behavior

- Settings > Appearance > Accent color: two options remain, now labeled
  Coral (a Claude-brand-inspired terracotta) and Indigo (was Purple —
  same hex as the app's original violet-blue, relabeled per WI-017 round
  2). Selecting either updates `--color-accent`,
  `--color-accent-600`, `--color-accent-700`, `--hero-gradient-start`,
  `--hero-gradient-end` exactly as today's mechanism already does — no
  change to `applyTheme()`'s structure, only to the two hex sets inside
  `ACCENT`.
- Light and dark mode's `bg`/`card`/`surface`/`divider`/`border` shift to
  new values that read closer to the reference image's clean look, with
  every dependent contrast ratio re-verified at the new values.
- `docs/specs/coral-rebrand-and-logo.md` gets a short pointer note added
  (not rewritten) noting coral's hex values were superseded by this spec,
  per that document's own history-of-decisions convention.

## Out of scope

- Avatar/category icon colors (`rowTone()`, `iconAvatar()`) — unaffected.
- Amount-coloring semantics (red expense / green income) —
  `docs/specs/amount-color-semantics.md`'s concern, already a separate
  ticket (WI-016).
- Adding a third accent option, or any UI beyond the existing two-option
  Coral/Indigo picker.
- Any change to `state.accentColor`'s stored values, migrations, or the
  `"purple"` string key itself.

## Verification plan

Both tickets: `npm test` + `npm run test:e2e` + `npm run build`, then in a
real browser, both light and dark mode:

1. Toggle Accent color between Coral and Indigo; confirm the hero balance
   card gradient, primary buttons, active tab, and active chip all update
   together with no stale color left over from the other option.
2. Confirm Coral no longer reads as easily confusable with an expense-red
   amount when both are visible on the same screen (e.g. Add sheet with
   Coral accent showing a red expense preview amount) — side-by-side
   screenshot, not just a written hex comparison.
3. Measure and record actual contrast ratios (not eyeballed) for every
   pairing `theme.js`'s existing comments document a floor for, at the new
   bg/card/surface/divider/border/muted/tertiary/tabbarInactive values, in
   both themes: tabbarInactive vs bg (≥3:1), muted/tertiary vs bg and card,
   accent/coral/indigo base with white text (≥4.5:1), income-700/expense-700
   vs card (≥4.5:1, should be unaffected by this ticket but confirm no
   regression since card itself moves).
4. Visual pass across Home, Transactions, Add sheet, Insights, and
   Settings in both themes — confirm no card blends into its page
   background and no divider/border becomes invisible at the new values.
