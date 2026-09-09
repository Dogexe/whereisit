import { $, escapeHtml } from "./utils.js";
import { L } from "./i18n.js";

let toastTimer = null;
export function showToast(msg, undoFn) {
  const el = $("toast");
  const live = $("toastLive");
  const announcement = msg + (undoFn ? " " + L().undoBtn : "");
  el.innerHTML = "<span>" + escapeHtml(msg) + "</span>"
    + (undoFn ? '<button type="button" class="toast-undo-btn" id="toastUndoBtn">' + escapeHtml(L().undoBtn) + "</button>" : "");
  el.hidden = false;
  live.textContent = "";
  setTimeout(() => { live.textContent = announcement; }, 0);
  clearTimeout(toastTimer);
  if (undoFn) {
    $("toastUndoBtn").addEventListener("click", () => {
      clearTimeout(toastTimer);
      el.hidden = true;
      live.textContent = "";
      undoFn();
    });
  }
  toastTimer = setTimeout(() => { el.hidden = true; live.textContent = ""; }, undoFn ? 4000 : 2200);
}
