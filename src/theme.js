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
// heroStart/heroEnd feed the Home hero (balance) card's gradient
// specifically. Indigo keeps its pre-existing dedicated pair
// (#7b68ee -> #4f7df3) unchanged through every round -- both reference
// images' own hero-style gradients sampled close to it (start ~hue 250deg,
// end ~hue 210-220deg), so it was never actually the problem. Coral's pair
// is base/c700 again (same "unchanged look" convention as before,
// unchanged mechanism through all three rounds per the maintainer's
// explicit "leave gradient for WI-018" -- only the two hex values moved).
const ACCENT = {
  coral: { base: "#D97757", c600: "#B74D2A", c700: "#74311A", heroStart: "#D97757", heroEnd: "#74311A" },
  purple: { base: "#6247ea", c600: "#4f34d6", c700: "#3f28ab", heroStart: "#7b68ee", heroEnd: "#4f7df3" },
};

export function applyTheme() {
  // tabbarInactive is its own token (not tertiary) because tertiary is
  // shared by 11+ mostly-static-text spots, while the tab bar is an
  // interactive component subject to WCAG's stricter 3:1 minimum -- light
  // tertiary (#9497a3) only computes to ~2.7:1 against this bg; #7d808c
  // clears 3:1 with margin (~3.65:1). Dark tertiary already passes (~3.86:1)
  // so it's reused as-is.
  const light = { bg: "#f6f6f8", card: "#ffffff", surface: "#eeeef1", divider: "#e4e4e9", border: "#d9dae0", muted: "#71747f", tertiary: "#9497a3", tabbarInactive: "#7d808c", text: "#15161a" };
  const dark = { bg: "#141519", card: "#1e1f24", surface: "#26272d", divider: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.16)", muted: "rgba(245,245,247,0.62)", tertiary: "rgba(245,245,247,0.42)", tabbarInactive: "rgba(245,245,247,0.42)", text: "#f5f5f7" };
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
  // relative-luminance calc (not eyeballed) at ~9.4:1 (income) / ~6.0:1
  // (expense) against --color-card (#1e1f24), both comfortably clearing
  // the 4.5:1 floor.
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
