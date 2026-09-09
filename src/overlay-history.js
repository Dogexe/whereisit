const overlayStack = [];

window.addEventListener("popstate", () => {
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
  history.back();
  return true;
}
