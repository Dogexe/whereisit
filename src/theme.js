import { state } from "./state.js";
import { $ } from "./utils.js";

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
  root.setProperty("--color-expense", state.dark ? "#ff7a68" : "#ef4b3a");
  root.setProperty("--color-warning", state.dark ? "#f5b95a" : "#ec9f2e");
  const themeColorMeta = $("themeColorMeta");
  if (themeColorMeta) themeColorMeta.setAttribute("content", t.bg);
}
// Stage 1 of docs/specs/linear-theme.md: infrastructure only, no visible
// change yet. Sets a data attribute for Stage 2's CSS/JS to key off of --
// nothing reads it yet, so toggling state.themeStyle today is a no-op
// visually, verified by checking there's genuinely no rule anywhere
// selecting on [data-theme-style]. Stage 2 will add the actual token
// overrides (radius/shadow/weight/accent) here, following the exact same
// light/dark object pattern applyTheme() already uses above, just with two
// more variants (linear-light/linear-dark) selected by state.themeStyle
// as well as state.dark.
export function applyThemeStyle() {
  document.documentElement.setAttribute("data-theme-style", state.themeStyle);
}
