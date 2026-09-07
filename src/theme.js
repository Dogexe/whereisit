import { state } from "./state.js";
import { $ } from "./utils.js";

// docs/specs/coral-rebrand-and-logo.md: "coral" is the new default brand
// (from the design's own oklch(58% 0.18 40) base -- nudged down from its
// literal oklch(62% 0.18 40) spec value specifically because the design
// only ever showed that hue as a small icon stroke/swatch, never as a
// large white-text button fill; at 62% L, white text measured 3.94:1,
// below the 4.5:1 small-text minimum this app has held to all session --
// 58% clears it at 4.64:1 while reading as the same coral). "purple" is
// the app's original accent, unchanged, kept as an opt-in preference.
// Resolved via canvas getImageData against real Chrome, not hand-converted.
// heroStart/heroEnd feed the Home hero (balance) card's gradient
// specifically -- Coral's pair is just base/c700 again (unchanged look),
// but Purple's plain base/c700 pair (#6247ea -> #3f28ab) reads as one
// fairly dark, low-blue violet on that large a card, not the brighter
// blue-to-violet look a reference design asked for -- so Purple gets its
// own dedicated, more vivid pair here. Every other Purple-themed element
// (buttons, the active tab, etc.) still uses plain base/c700 below,
// unaffected by this.
const ACCENT = {
  coral: { base: "#cd4805", c600: "#b12c00", c700: "#960200", heroStart: "#cd4805", heroEnd: "#960200" },
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
