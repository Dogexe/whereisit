import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression test for a real bug: .feature-card used to be opacity:0 in
// plain CSS, made visible only by a script-added .in-view class -- so the
// whole feature section was blank with JS disabled/blocked/erroring, or in
// any static render that never fires the scroll observer (some crawlers,
// link-preview generators). Playwright isn't a dependency and adding one
// for a single assertion would be disproportionate, so this parses the
// landing page's own inline <style> text instead of rendering it -- a
// lighter but still real guard against the base .feature-card rule ever
// hiding content again.
const html = readFileSync(fileURLToPath(new URL("../landing/index.html", import.meta.url)), "utf8");
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
assert.ok(styleMatch, "landing/index.html must have an inline <style> block");
const css = styleMatch[1];

function ruleBodyFor(selector) {
  // Matches the exact bare selector followed by "{", not a compound
  // selector like ".feature-card.pre-reveal {" or ".feature-card .icon {"
  // -- both have more non-whitespace between the selector and the brace.
  const re = new RegExp(selector.replace(/[.]/g, "\\.") + "\\s*\\{([^}]*)\\}");
  const m = css.match(re);
  assert.ok(m, `expected to find a bare "${selector} { ... }" rule in landing/index.html's <style> block`);
  return m[1];
}

test("the base .feature-card rule does not set opacity:0 (or hide it via transform/filter)", () => {
  const body = ruleBodyFor(".feature-card");
  assert.doesNotMatch(body, /opacity\s*:\s*0\b/, ".feature-card must be visible without any JS-added class");
});

test("the hidden state lives only on .feature-card.pre-reveal, a class the script adds", () => {
  const body = ruleBodyFor(".feature-card.pre-reveal");
  assert.match(body, /opacity\s*:\s*0\b/);
});

test("the reveal (opacity:1) is scoped to .pre-reveal.in-view, not the bare .in-view class", () => {
  assert.doesNotMatch(css, /(?<!\.pre-reveal)\.in-view\s*\{/, "a bare .in-view rule would imply .feature-card needs a JS class to become visible in the first place");
});

test("script only adds .pre-reveal (the hidden state) when it can also observe and reveal it, and skips it under prefers-reduced-motion", () => {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, "landing/index.html must have an inline <script> block");
  const script = scriptMatch[1];
  assert.match(script, /matchMedia\(["']\(prefers-reduced-motion:\s*reduce\)["']\)/, "must check prefers-reduced-motion before opting into the reveal animation");
  assert.match(script, /classList\.add\(["']pre-reveal["']\)/, "must add the hidden class itself rather than relying on it being present in markup");
});
