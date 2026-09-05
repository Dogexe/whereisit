# Spec: Marketing landing page

Status: **built and verified live in the browser**
(`landing/index.html`, `scripts/build.mjs`). Scoped via `/spec`
before building ad hoc, per this project's working rules — a landing
page isn't part of any existing roadmap item (module split, sync
passes, UI/UX pass are all in-app work; this is the first
outward-facing marketing surface for the project).

## Goal

Drive installs/signups: convince a visitor to open the app and start
using it. Not a portfolio piece, not a plain about-page — the copy and
layout should be conversion-oriented (clear value prop, one obvious
CTA), scaled to a minimal single-screen page rather than a full
multi-section marketing site.

## Key decisions

1. **Audience & language**: bilingual (Thai + English), both on one
   page via a manual TH/EN toggle switch — no browser-locale detection,
   no separate `/en/` and `/th/` URLs. Mirrors the app's own toggle
   pattern conceptually, but this is an independent, hand-rolled
   toggle in the landing page's own script — it does not import or
   depend on the app's `i18n.js` (different module, different bundle,
   see "Build integration" below).
2. **Placement**: new route at `dogexe.github.io/whereisit/landing/`.
   The existing app stays exactly as-is at the site root — nothing in
   `index.html`, `main.js`, routing, the manifest, or the service
   worker changes. This keeps the change zero-risk to the shipped PWA.
3. **Scope — minimal single-screen**:
   - Hero: headline, subhead, one primary CTA button ("Open the app" /
     Thai equivalent) linking to `../` (the app root).
   - Feature bullets: 3-4 short items (icon + one line each) —
     candidates: offline-first / works without internet, budgets &
     bills tracking, cross-device sync, CSV/JSON/Google Sheets export.
     Exact wording finalized during copywriting, not fixed here.
   - Footer: link to `privacy.html` (already exists at the site root,
     reachable as `../privacy.html` from `/landing/`), and a link to
     the GitHub repo.
   - Explicitly **not** included: screenshots/mockups, a "how it
     works" step-by-step section, testimonials, pricing — out of scope
     for this minimal pass.
4. **Hero visual**: text-only. No screenshot or phone-mockup image, so
   nothing needs to be captured from the live app first.
5. **Visual design**: a fresh, distinct marketing aesthetic — not a
   reuse of the app's in-app `styles.css` tokens/theme. This page gets
   its own typography scale, spacing, and color treatment, built using
   the `landing-page-design` skill's rules (hero layout, type/spacing/
   corner-radius/background rules, icon and motion restraint) rather
   than inheriting the app's existing dark/light CSS variables.
   Consequence: this page does **not** need to support the app's
   dark/light toggle — it's a standalone design, though it should still
   respect `prefers-color-scheme` reasonably rather than looking broken
   in a dark browser (exact treatment decided during the design pass).
6. **Build integration**: standalone static file, no esbuild bundling.
   New `landing/index.html` (self-contained: its own `<style>`
   block and a small inline `<script>` for the TH/EN toggle — no
   separate `.css`/`.js` files needed given the minimal scope). Added
   to `scripts/build.mjs` as one more `cpSync` call:
   ```js
   cpSync("landing", "dist/landing", { recursive: true });
   ```
   right alongside the existing `cpSync("privacy.html", ...)` line.
   Nothing else in the build script changes.
7. **CTA target**: primary button/link points to `../` (relative path
   from `/landing/` to the app root) — resolves correctly both on
   `localhost:8792/landing/` during local testing and on
   `dogexe.github.io/whereisit/landing/` once deployed, with no
   hardcoded absolute URL.

## Out of scope

- Any change to `index.html`, `src/`, `manifest.json`, `sw.js`, or the
  PWA install-prompt flow — this page is not installable itself and
  doesn't need its own manifest/service-worker entry.
- SEO/meta-tag work beyond basic `<title>`/`<meta description>` — no
  structured data, no sitemap changes, unless requested later.
- Analytics/conversion tracking — not requested; would need its own
  privacy-policy disclosure if added later (see the existing
  `privacy.html` and `error_logs` precedent in the main `CLAUDE.md` for
  how this project treats data-handling disclosures).
- Reusing or importing anything from `src/i18n.js` — the landing page's
  TH/EN toggle is copy-only content local to `landing/index.html`, not
  wired into the app's string table.

## Verification plan

After implementing:

1. `npm run build`, confirm `dist/landing/index.html` exists and the
   rest of `dist/` (app root) is byte-for-byte the same as before this
   change (diff `dist/` contents excluding the new `landing/` folder).
2. Serve `dist/` locally (existing `python -m http.server` command from
   `CLAUDE.md`), load `http://127.0.0.1:8792/landing/` in a real
   browser.
3. Confirm the TH/EN toggle actually switches all visible copy
   (headline, subhead, feature bullets, CTA label, footer links) with
   no leftover untranslated strings in either state.
4. Click the primary CTA and confirm it lands on the real app at the
   site root (`http://127.0.0.1:8792/`), not a 404.
5. Confirm the privacy and GitHub footer links resolve correctly from
   the `/landing/` path.
6. Quick responsive check (narrow mobile-width viewport and a wide
   desktop viewport) since this is a fresh layout with no existing
   breakpoints to inherit. **Not fully verified**: the browser
   automation tool available during the build couldn't actually resize
   its rendering viewport (window resize calls succeeded but
   `window.innerWidth` never changed), so the `max-width: 720px`
   breakpoint (feature grid to one column, smaller hero heading) was
   written and reviewed but not confirmed live at a real mobile width.
   Worth a manual check in a real mobile browser or devtools device
   toolbar before treating this as fully done.
7. Confirm nothing in the existing app (root `/`) regressed — this
   should be a no-op for the app itself, but worth a quick sanity load
   given `scripts/build.mjs` was touched. Done: `npm test` (36/36
   passing) and a live load of `/` after clicking the landing page's
   CTA both confirmed the app itself is unaffected.

## Developer handoff / QA package

There's no separate design file for this page — the implementation
*is* the design artifact — so this section documents the shipped
`landing/index.html` as the spec of record, plus the open items
from two follow-up review passes (a `visual-critique` pass and a
`heuristic-evaluation` pass) that should be resolved before this is
tagged as release-ready rather than draft.

### Visual spec (as implemented)

- **Type scale** (Manrope, weights 400/500/600/700 only): hero h1
  48px/line-height 1; section h2 30px/36px; card h3 and hero subhead
  18px/28px; body/caption text 14px with an explicit 20px line-height
  everywhere it's used (eyebrow, trust line, proof line, footer,
  language-toggle buttons, card body).
- **Spacing**: section vertical padding 64–80px; card padding 24px;
  grid gap 16px; header padding 16px. Button padding is 8px/12px
  (`.btn-primary`) and 8px/16px (eyebrow pill, language-toggle
  buttons), matching this project's spacing-scale and button-padding
  rules.
- **Color tokens** (CSS custom properties on `:root`, redefined under
  `prefers-color-scheme: dark`): `--bg`, `--bg-raised`, `--text`,
  `--text-dim`, `--text-faint`, `--border`, `--accent` (`#ffb020` in
  both themes), `--heading-grad-from`/`--heading-grad-to` (hero
  headline gradient, per the `landing-page-design` skill's hero rule).
  `--text-faint` is `#6b665c` in light mode (was `#8a8a80`, ~3.49:1
  against white — now ~5.7:1) and `--focus-ring` is `#a35d00` in light
  mode (was the same as `--accent`, ~1.83:1 against white — now
  ~5.09:1); dark mode kept its original values since both already
  passed contrast there.
- **Radius**: cards 16px, buttons/pills fully round (999px), icon
  avatars 12px.
- **Breakpoint**: single breakpoint at `max-width: 720px` — feature
  grid drops from 2 columns to 1, hero h1 steps down to 36px/40px.

### Interaction spec

- **States implemented**: `:hover`/`:active` on the primary CTA
  (translateY -1px / scale 0.98), `:hover`/`aria-pressed` on the
  language toggle, a global `:focus-visible` outline (2px, offset 2px,
  color `--focus-ring`).
- **States NOT applicable**: no loading/disabled/error states exist —
  this is a static page with no async operations or forms.
- **Animation**: feature cards fade/rise/unblur into view via
  `IntersectionObserver` (800ms, `cubic-bezier(0.32,0.72,0,1)`), with a
  synchronous fallback (`.in-view` applied immediately) if
  `IntersectionObserver` is unsupported. All transition durations
  collapse to 1ms under `prefers-reduced-motion: reduce`.
- **Language toggle**: click-driven, persists to `localStorage`
  (`landingLang`), falls back to `navigator.language` on first visit,
  defaults to Thai. Implemented via paired `<span lang="th">`/
  `<span lang="en">` elements shown/hidden with CSS — not a re-render.

### Asset list

None. No images, no external icon library — all 4 feature icons are
hand-drawn inline SVG (stroke-based, `stroke-width: 1.8`), no font
files bundled (Manrope loaded from Google Fonts via `<link>`), favicon
reuses the existing `../icons/icon-192.png` from the main app.

### QA checklist — must fix before tagging as release-ready

Carried over from the two review passes run against this page
(`visual-critique:critique-screen` and
`prototyping-testing:heuristic-evaluation`), most-severe first. All
code-fixable items are now done and live-verified; the one item that
isn't a code fix (manual zoom/breakpoint testing) remains open:

- [x] **Add a data-privacy/trust reassurance line to visible copy** —
  added as a new `.hero .trust` paragraph directly under the CTA
  ("Your data stays on your device first — it only reaches the cloud
  if you sign in to sync it yourself" / Thai equivalent), styled with
  `--text-dim` rather than the fainter `--text-faint` so it reads with
  real prominence, not as an afterthought.
- [x] **Sync `document.documentElement.lang` with the toggle** — done,
  but this **caused a real regression**, caught and fixed in the same
  pass: the existing base rule was a bare `[lang="en"] { display: none;
  }`, meant only for the inner toggle `<span>`s. Once the toggle script
  also started setting `lang="en"` on `<html>` itself, that same
  selector matched the root element too and hid the entire document —
  a fresh live check after the fix (not just a code read) turned up a
  blank white page. Fixed by scoping all three lang-cascade rules to
  `span[lang="..."]` instead of the bare attribute selector. Worth
  remembering generally: adding a `lang`/`data-*` attribute to `<html>`
  needs a check for any existing attribute-selector CSS that could
  unintentionally start matching the root element too.
- [x] **Fix light-mode `--text-faint` contrast** — now `#6b665c`
  (~5.7:1 against white, was ~3.49:1).
- [x] **Fix light-mode focus-ring contrast** — now `#a35d00` in light
  mode only (~5.09:1 against white, was ~1.83:1); dark mode is
  unchanged since it already passed at ~10.27:1. Verified live via
  `getComputedStyle` after programmatically focusing the CTA, not just
  by reading the CSS.
- [x] **Add a `forced-colors: active` fallback** for the gradient hero
  headline — added, sets a solid `color: CanvasText` and drops the
  gradient background under forced-colors mode. (Not independently
  verified in an actual Windows High Contrast session — no such
  environment available here — but the fix follows the standard,
  documented pattern for this known gradient-text pitfall.)
- [x] Added an "opens in a new tab" cue to the GitHub footer link via a
  visually-hidden (`.sr-only`) span, keeping `target="_blank"` rather
  than dropping it.
- [x] `.btn-primary` padding snapped to 8px/12px.
- [x] Eyebrow pill and language-toggle button padding snapped to
  8px/16px.
- [x] Explicit `line-height: 20px` added everywhere `font-size: 14px`
  is used outside `.feature-card p` (eyebrow, new trust line, proof
  line, footer, language-toggle buttons).
- [ ] Manually verify the 720px responsive breakpoint and 200%/400%
  browser zoom in a real browser or device toolbar — still not
  confirmed live; this session's browser-automation tooling still
  couldn't resize its own rendering viewport when re-checked.

Not blocking, lower priority, not addressed in this pass: swap the
hand-drawn SVG icons for a systemized set (Phosphor/Solar/Iconamoon)
for long-term consistency; differentiate the feature-icon tint from
the CTA's accent color so the "click me" signal stays unique to
actionable elements.

### Review gate status

Mapped to this project's review-gate framing (design and implementation
happened together here, so gates 2–4 collapse into one pass):

- **Design review**: informal — followed the `landing-page-design`
  skill's rules directly during implementation rather than a separate
  design-then-build step.
- **Pre-handoff review**: this section. States and edge cases are
  documented above; all accessibility items from the QA checklist are
  now fixed and live-verified except the manual zoom/breakpoint check.
- **Implementation QA**: build/tests verified (see "Verification plan"
  above, and re-verified after this fix pass — `npm run build` and
  `npm test`, 36/36, both clean), functional and accessibility browser
  checks done for every code-fixable item. Only the manual
  zoom/breakpoint check remains open.

### Version

Tagged **`landing-page v0.9.0`** — all must-fix QA items are resolved
and live-verified except the manual responsive/zoom check, so this is
one step short of a clean release tag. Still not committed (`git
status` shows `scripts/build.mjs` modified and `landing/`,
`docs/specs/landing-page.md` untracked). Recommend committing once the
remaining zoom/breakpoint check is done, then treating that commit as
`v1.0.0` — this project has no existing git-tag convention (`git log`
shows no tags), so that would be a version *label* in the commit
message or a new lightweight tag, not a continuation of an existing
practice; flagging rather than introducing one silently.
