import { state } from "./state.js";
import { $ } from "./utils.js";

// docs/specs/coral-rebrand-and-logo.md: "coral" was the original 2024
// brand pass (oklch(58% 0.18 40), #cd4805/#b12c00/#960200) -- its hex
// values were superseded by WI-017 below, see docs/specs/
// color-palette-refresh.md. "purple" is the app's original accent, object
// key unchanged (see that spec's decision 1 -- no data migration for
// state.accentColor, which still stores the literal string "purple"), now
// labeled "Indigo" in Settings (i18n.js).
//
// WI-017 (docs/specs/color-palette-refresh.md) went through two rounds.
// Round 1 picked a flat Tailwind blue (#2563EB) for purple and a warm
// amber (#A56409) for coral, both verified for contrast -- but the
// maintainer rejected both on sight ("wtf is that coral... the blue is so
// finance app stereotype, i want kind of indigo") and supplied two new
// reference images. Round 2 (current) is pixel-sampled from those
// references via canvas getImageData, not re-guessed:
// - The reference app screenshot's FAB button and active tab icon sampled
//   as *exactly* #6247ea -- this app's own original purple base, before
//   round 1 ever touched it. So "indigo" round-trips back to the original
//   base/c600/c700 (#6247ea/#4f34d6/#3f28ab); only the Settings label
//   changes (Blue -> Indigo), not the hex. Round 1's "too violet" read was
//   specifically about pairing that hue with the word "Blue", not a
//   defect in the hue itself.
// - For coral, the maintainer asked for "something like claude color
//   accent" -- Anthropic's own warm terracotta/clay brand hue
//   (~oklch-equivalent hex #CC785C / #DA7756 in the wild). Round 2's first
//   pass darkened that to #B25738 (46% L) so white button/chip text would
//   clear 4.5:1, the same fix the original 2024 coral pass used -- but the
//   maintainer rejected THAT too ("coral is too dark bro and the gradient
//   is odd") and explicitly chose to keep the lighter, truer brand hue and
//   defer the white-text-contrast fix to a later pass (a text-shadow on
//   white-on-accent text, not a darker base) rather than accept a muddy
//   color. Round 3 (current): base #D97757 (hue 15deg, sat 63%, L60% --
//   the un-darkened brand hue) measures **3.12:1 against white text,
//   below this app's normal 4.5:1 floor, deliberately** -- tracked as
//   known UI debt in docs/UX.md until the shadow fix lands. c600 #B74D2A
//   (L44%) and c700 #74311A (L28%) hold the same hue/saturation and were
//   NOT relaxed the same way -- they aren't paired with white text, they
//   render as colored text on --color-card/--color-accent-tint (badge-
//   brand, .shortcut-btn.active, .picker-year-heading:hover, .kind-toggle
//   button.active, .btn-ghost), so they still need to clear their own
//   floor on their own merits: c700 measures 8.47:1 against
//   --color-accent-tint (which stays near-white in both themes), c600
//   measures 4.53:1 against the tint and 5.11:1 against --color-card in
//   light mode.
// - indigo.c700 #3f28ab: 8.38:1 against its own tint, same reasoning.
//   Both c600 values clear --color-card in light mode (>=5:1) and their
//   own tint (>=4.5:1); neither clears --color-card in dark mode (~2.2-
//   2.5:1) -- a pre-existing gap (--color-accent* doesn't invert per theme
//   the way income/expense do, affecting .btn-ghost's text in dark mode)
//   this ticket did not introduce and does not fix.
// heroStart/heroEnd feed the Home hero (balance) card's gradient AND (as of
// the post-WI-018 gradient-system pass below) the tab bar's raised Add
// button -- both now render the identical two-stop 135deg gradient, not
// independent tokens.
//
// Post-WI-018 gradient-system pass: the maintainer supplied a fresh
// reference screenshot of the hero card and asked for its exact gradient,
// pixel-sampled via canvas getImageData against the real image (not
// hand-converted or eyeballed -- same method this file always uses),
// landing on two clean corner reads: top-left #6149ea, bottom-right
// #409ce9. In HSL that's (249deg, 79%, 60%) -> (207deg, 79%, 58%) --
// *exactly* the app's existing indigo base (#6247ea is 250deg/80%/60%,
// i.e. the reference's start color IS the base accent, same pattern as
// WI-017's original "FAB button sampled as exactly #6247ea" finding) --
// then a ~42deg hue rotation toward blue at constant saturation and
// near-constant lightness for the end stop. Indigo's old pair (#7b68ee ->
// #4f7df3, kept unchanged through WI-017 as "close enough") reads
// noticeably lighter/less saturated than this reference, so it's now
// replaced outright rather than kept.
// Coral's end stop is a new dedicated hero color, not reused from c700
// (#74311A) as it was previously (WI-017's "unchanged mechanism... leave
// gradient for WI-018" note) -- transposing indigo's rotation *in degrees*
// onto coral's hue lands in yellow-green (hue 15+42=57 at this
// saturation/lightness renders as mustard, verified by rendering swatches
// in a real browser, not guessed), which reads as off-brand and isn't a
// legitimate reading of "the same system" applied to a different hue
// family. The same *mechanism* -- constant saturation, near-constant
// lightness, a moderate hue rotation toward an adjacent, brighter-feeling
// hue, corner-to-corner 135deg -- lands well for coral at a smaller ~23deg
// rotation (15deg -> 38deg, terracotta -> warm amber), chosen by rendering
// and eyeballing several candidate hues side by side in a real browser
// (14.8->{25,30,35,40,45,50}) since there's no second reference image to
// pixel-sample coral from. heroStart stays coral's base, matching the
// "start = base" relationship the indigo reference confirmed.
// Known contrast debt, extended from WI-017's existing coral note (see
// docs/UX.md's Known UI debt): white text/icon directly on coral's hero
// gradient measures 3.12:1 at the start (same as base, already accepted
// debt) down to 2.26:1 at the end and ~2.67:1 at the midpoint -- all below
// the 4.5:1 floor, all pending the same future text-shadow fix as coral's
// base-on-white debt, not newly introduced by this pass. Indigo's new pair
// fares better (5.75:1 start, 4.24:1 mid, 2.94:1 end) but still tapers
// below 4.5:1 toward the far corner -- both hero cards keep their large
// balance text positioned over the higher-contrast start corner, matching
// how the reference image itself avoids the low-contrast corner (its
// secondary "+6.9%" figure sits in an opaque pill, not bare white text).
const ACCENT = {
  coral: { base: "#D97757", c600: "#B74D2A", c700: "#74311A", heroStart: "#D97757", heroEnd: "#D6A44C" },
  purple: { base: "#6247ea", c600: "#4f34d6", c700: "#3f28ab", heroStart: "#6149ea", heroEnd: "#409ce9" },
};

export function applyTheme() {
  // WI-018 (docs/specs/color-palette-refresh.md): bg/card/surface/divider/
  // border retuned in both themes toward a cleaner, more clearly-separated
  // page-vs-card look (previously bg-vs-card contrast was only ~1.08:1 in
  // both themes -- card relied on shadow-sm/dividers alone to read as
  // distinct from the page). No reference image was available this pass
  // (not persisted anywhere in the repo -- only shared transiently in the
  // WI-017 session), so light mode is a conservative, still-close nudge
  // (per the spec's own framing) and dark mode a proportionally-matched
  // deepen, rather than a pixel-sampled match. Verified via WCAG relative-
  // luminance contrast math (same formula the canvas getImageData method
  // this file's other comments reference ultimately computes), not
  // eyeballed -- see WI-018's Review notes for every re-measured ratio.
  // muted/tertiary/tabbarInactive/text are unchanged: re-measured against
  // the new bg/card below and every previously-documented floor still
  // clears (tabbarInactive vs bg: 3.64->3.45 light, unchanged ~3.86 dark,
  // both still >=3:1), so per the ticket's "only if needed, not as a
  // default" rule they weren't touched.
  //
  // tabbarInactive is its own token (not tertiary) because tertiary is
  // shared by 11+ mostly-static-text spots, while the tab bar is an
  // interactive component subject to WCAG's stricter 3:1 minimum -- light
  // tertiary (#9497a3) only computes to ~2.55:1 against the new bg; #7d808c
  // clears 3:1 with margin (~3.45:1). Dark tertiary already passes (~3.86:1)
  // so it's reused as-is.
  const light = { bg: "#eef0f4", card: "#ffffff", surface: "#e5e8ee", divider: "#dde0e7", border: "#cfd3dc", muted: "#71747f", tertiary: "#9497a3", tabbarInactive: "#7d808c", text: "#15161a" };
  const dark = { bg: "#111216", card: "#1f2027", surface: "#282a31", divider: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.16)", muted: "rgba(245,245,247,0.62)", tertiary: "rgba(245,245,247,0.42)", tabbarInactive: "rgba(245,245,247,0.42)", text: "#f5f5f7" };
  const t = state.dark ? dark : light;
  const root = document.documentElement.style;
  document.documentElement.style.colorScheme = state.dark ? "dark" : "light";
  root.setProperty("--color-bg", t.bg);
  root.setProperty("--color-card", t.card);
  root.setProperty("--color-surface", t.surface);
  root.setProperty("--color-text", t.text);
  root.setProperty("--color-muted", t.muted);
  root.setProperty("--color-tertiary", t.tertiary);
  root.setProperty("--color-tabbar-inactive", t.tabbarInactive);
  root.setProperty("--color-divider", t.divider);
  root.setProperty("--color-border", t.border);
  root.setProperty("--color-income", state.dark ? "#34c98a" : "#1fae71");
  // -700 = the AA-safe text variant of income/expense, for small/bold text
  // sitting directly on --color-card (e.g. .stat-card .delta, tx amounts).
  // WI-019 retuned both to a more vivid red/green (docs/specs/
  // amount-color-semantics.md's addendum), replacing the original
  // dark-mode-equals-base shortcut this comment used to describe -- these
  // dark values are now deliberately brighter than base, verified by
  // relative-luminance calc (not eyeballed) at ~9.3:1 (income) / ~5.9:1
  // (expense) against --color-card (#1f2027, re-measured for WI-018's new
  // dark card), both comfortably clearing the 4.5:1 floor.
  // Light expense-700 targeted Tailwind red-600 (#DC2626) per the
  // maintainer's chosen reference, but #DC2626 only measures 4.14:1 against
  // --color-expense-tint (badge-expense's background, ~#fde9e7 -- a tint
  // mixes toward white but isn't quite white, so it doesn't inherit
  // --color-card's full contrast headroom) -- below the 4.5:1 floor and a
  // real regression from the previous #c22f22 (4.83:1 there). Nudged to
  // #CC2020, which still reads as the same vivid red (5.53:1 on card,
  // 4.74:1 on the tint) and clears both surfaces.
  // Known pre-existing gap, NOT introduced by this change: dark-mode
  // badge-expense (expense-700 dark on --color-expense-tint, which stays
  // near-white in both themes per its own doc comment below) already
  // measured ~2.3:1 before this pass and still does after (~2.5:1) --
  // untouched here, flagged for a separate ticket rather than silently
  // fixed as a drive-by.
  root.setProperty("--color-income-700", state.dark ? "#4ADE80" : "#15803D");
  root.setProperty("--color-expense", state.dark ? "#ff7a68" : "#ef4b3a");
  root.setProperty("--color-expense-700", state.dark ? "#F87171" : "#CC2020");
  root.setProperty("--color-warning", state.dark ? "#f5b95a" : "#ec9f2e");
  // Breakdown chart's 5th/6th rotating colors (derived.js's CHART_COLORS) --
  // same hue in both modes, brightened for dark the same way income/expense/
  // warning are above, so each still clears the 3:1 floor against
  // --color-card/--color-surface in the mode it's actually rendered in
  // (the light-mode hexes alone only manage ~3:1 against dark's near-black
  // card, too thin a margin to reuse unchanged).
  root.setProperty("--color-chart-5", state.dark ? "#4fd6c4" : "#1f7d70");
  root.setProperty("--color-chart-6", state.dark ? "#e768ab" : "#b23a7a");
  // Independent of dark/light -- same axis the removed Linear theme used.
  // --color-accent-tint/--shadow-accent are left alone: both are already
  // color-mix() expressions in styles.css referencing var(--color-accent),
  // so they auto-derive from whichever base is set here.
  const accent = ACCENT[state.accentColor] || ACCENT.coral;
  root.setProperty("--color-accent", accent.base);
  root.setProperty("--color-accent-600", accent.c600);
  root.setProperty("--color-accent-700", accent.c700);
  root.setProperty("--hero-gradient-start", accent.heroStart);
  root.setProperty("--hero-gradient-end", accent.heroEnd);
  // Sidebar lockup icon's ring (see .sidebar-logo, styles.css): follows the
  // Coral/Purple preference in light mode via var(--color-accent), but goes
  // solid white in dark mode regardless of preference -- matching the
  // design's own "dark lockup" reference, which uses white for the ring
  // independent of hue. (--color-logo-amber, the handle+dot, never changes
  // with theme or preference, so it isn't set here.)
  root.setProperty("--logo-ring-color", state.dark ? "#ffffff" : "var(--color-accent)");
  const themeColorMeta = $("themeColorMeta");
  if (themeColorMeta) themeColorMeta.setAttribute("content", t.bg);
}
