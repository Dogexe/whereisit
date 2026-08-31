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
// Stage 2 of docs/specs/linear-theme.md. Four variants, not two -- the
// Linear theme's own tokens differ by light/dark (its accent is deepened
// for light, brightened for dark, per the prototype's own contrast-checked
// values), so this keys off state.themeStyle AND state.dark together, the
// same way applyTheme() above only needs state.dark. Every token is set
// explicitly on every call (never conditionally skipped) so switching
// Linear -> Current can't leave a stale Linear value behind as an inline
// override -- the "Current" branch re-asserts the exact literal values
// styles.css's own :root block already authors, which is what makes this
// theme toggle a true no-op when themeStyle is "current".
export function applyThemeStyle() {
  document.documentElement.setAttribute("data-theme-style", state.themeStyle);
  const root = document.documentElement.style;
  // Values here match styles.css's own :root defaults exactly -- this
  // *is* "no theme," just asserted explicitly via JS instead of left to
  // the stylesheet, so the two can never drift apart silently.
  const current = {
    radiusLg: "18px",
    shadowSm: "0 2px 6px rgba(15,15,20,0.06)",
    shadowLg: "0 16px 40px rgba(15,15,20,0.14)",
    shadowAccent: "0 12px 28px color-mix(in srgb, var(--color-accent) 30%, transparent)",
    weightHeading: "800",
    accent: "#6247ea", accent600: "#4f34d6", accent700: "#3f28ab",
    primaryFill: "var(--color-accent)", primaryFillText: "#ffffff", primaryFillHover: "var(--color-accent-600)",
    heroFill: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-700) 100%)",
  };
  // Linear-light: accent deepened from the prototype's own #6247ea baseline
  // to #5333d6 (7.5:1 on white vs. the original's 5.6:1) -- checked, not
  // eyeballed, per the prototype's own contrast pass; -600/-700 steps
  // follow the same relative darkening ratio the Current accent's own
  // three steps already use. Radius/shadow/weight values are the ones
  // measured directly off a real Linear UI panel earlier in this project's
  // design exploration (see docs/specs/linear-theme.md's Reference section).
  const linearLight = {
    radiusLg: "12px",
    shadowSm: "0 2px 20px rgba(19,19,22,0.07)",
    shadowLg: "0 8px 32px rgba(19,19,22,0.10)",
    shadowAccent: "0 8px 24px rgba(19,19,22,0.12)",
    weightHeading: "600",
    accent: "#5333d6", accent600: "#4526b8", accent700: "#361d92",
    primaryFill: "#131316", primaryFillText: "#fafafa", primaryFillHover: "#26262b",
    heroFill: "#131316",
  };
  // Linear-dark: accent brightened to #9a8dff (7.1:1 on the dark card),
  // same reasoning as light -- a color this rare has to have enough
  // presence to actually pull the eye, not just clear the AA floor.
  const linearDark = {
    radiusLg: "12px",
    shadowSm: "0 2px 28px rgba(0,0,0,0.40)",
    shadowLg: "0 8px 40px rgba(0,0,0,0.45)",
    shadowAccent: "0 8px 28px rgba(0,0,0,0.50)",
    weightHeading: "600",
    accent: "#9a8dff", accent600: "#7d6dff", accent700: "#6350e0",
    primaryFill: "#f4f4f5", primaryFillText: "#0b0b0d", primaryFillHover: "#e4e4e6",
    heroFill: "#f4f4f5",
  };
  const t = state.themeStyle === "linear" ? (state.dark ? linearDark : linearLight) : current;
  root.setProperty("--radius-lg", t.radiusLg);
  root.setProperty("--shadow-sm", t.shadowSm);
  root.setProperty("--shadow-lg", t.shadowLg);
  root.setProperty("--shadow-accent", t.shadowAccent);
  root.setProperty("--weight-heading", t.weightHeading);
  root.setProperty("--color-accent", t.accent);
  root.setProperty("--color-accent-600", t.accent600);
  root.setProperty("--color-accent-700", t.accent700);
  root.setProperty("--color-primary-fill", t.primaryFill);
  root.setProperty("--color-primary-fill-text", t.primaryFillText);
  root.setProperty("--color-primary-fill-hover", t.primaryFillHover);
  root.setProperty("--hero-fill", t.heroFill);
}
