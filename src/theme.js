import { state } from "./state.js";
import { $ } from "./utils.js";

// Selects a theme and an accent; it does not define them. Every color token
// is declared in styles.css -- the light/Coral defaults on :root, the
// overrides in :root[data-theme="dark"] and :root[data-accent="purple"] --
// and this function's whole job is to put the two attributes on <html> that
// pick between those blocks. See docs/UX.md's "Design-token ownership".
//
// This used to write all 22 themed tokens as inline styles from a pair of
// palette objects here, with styles.css's :root holding a hand-maintained
// copy as the pre-JS first-paint fallback. The two drifted (--hero-gradient-end
// sat at the pre-gradient-system #74311A in CSS while this file said #D6A44C,
// so every cold load flashed brown before repainting gold), which is what
// retired the two-owner arrangement -- see docs/CHANGELOG.md.
//
// The accent palette's provenance (pixel-sampled from the maintainer's own
// reference images) and its measured contrast ratios now live beside the
// values in styles.css; docs/specs/color-palette-refresh.md and
// docs/specs/coral-rebrand-and-logo.md hold the full narrative.
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.dark ? "dark" : "light";
  root.dataset.accent = state.accentColor;
  // The one thing CSS can't do: <meta name="theme-color"> drives the browser's
  // own UI chrome (address bar, task switcher), and its content attribute is
  // only settable from JS. Read back out of the stylesheet rather than
  // hardcoded here -- a second copy of #eef0f4/#111216 in this file would be
  // the exact two-owner drift this refactor exists to remove. getComputedStyle
  // forces the style recalc, so this sees the attributes set just above.
  const themeColorMeta = $("themeColorMeta");
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", getComputedStyle(root).getPropertyValue("--color-bg").trim());
  }
}
