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
  // -700 = the AA-safe text variant of income/expense, for small/bold text
  // sitting directly on --color-card (e.g. .stat-card .delta, tx amounts).
  // The base hues above measure ~2.85:1 (income) / ~3.66:1 (expense)
  // against white -- below the 4.5:1 small-text minimum -- so text uses
  // this darker pair instead, same pattern as .badge-expense already did.
  // In dark mode the base hues were already tuned to clear ~6-7:1 against
  // --color-card (#1e1f24), so -700 there is just the base color again --
  // darkening it further (as a light-mode-style mix toward black would)
  // moves the wrong direction on a dark surface.
  root.setProperty("--color-income-700", state.dark ? "#34c98a" : "#147a54");
  root.setProperty("--color-expense", state.dark ? "#ff7a68" : "#ef4b3a");
  root.setProperty("--color-expense-700", state.dark ? "#ff7a68" : "#c22f22");
  root.setProperty("--color-warning", state.dark ? "#f5b95a" : "#ec9f2e");
  const themeColorMeta = $("themeColorMeta");
  if (themeColorMeta) themeColorMeta.setAttribute("content", t.bg);
}
