const overlayStack = [];

// popstate is asynchronous: history.back() returns immediately and the event
// arrives on a later task, so a release cannot guard with try/finally. A
// module-level counter (not a boolean) records how many pops release itself
// caused, so two releases queued in one task each consume exactly one event.
let suppressedPops = 0;

window.addEventListener("popstate", () => {
  if (suppressedPops > 0) { suppressedPops--; return; }
  const entry = overlayStack.pop();
  if (!entry) return;
  entry.onPop();
});

export function pushOverlayHistory(key, onPop) {
  if (overlayStack.some((entry) => entry.key === key)) return false;
  history.pushState({ overlay: key }, "");
  overlayStack.push({ key, onPop });
  return true;
}

export function releaseOverlayHistory(key) {
  const entry = overlayStack[overlayStack.length - 1];
  if (!entry || entry.key !== key) return false;
  overlayStack.pop();
  suppressedPops++;
  history.back();
  return true;
}
