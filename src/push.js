import { sb, currentUser } from "./sync.js";
import { showToast } from "./toast.js";
import { L } from "./i18n.js";

// Public VAPID key -- not a secret, same treatment as SUPABASE_ANON_KEY and
// GOOGLE_SHEETS_CLIENT_ID elsewhere in this codebase. The matching private
// key lives only in Supabase Vault, read by the send-bill-reminders edge
// function; it is never sent to, or reachable from, the client.
const VAPID_PUBLIC_KEY = "BEkZUDphQYsXqsaKs-fZE97REAmIr6THcABQZVzXanArvszMhtVjR7-fgYHN3qDbgFisM9RtJ0LuLZwSUobxOXI";

// Local record of "the user turned this on" -- deliberately separate from
// asking the browser (Notification.permission / pushManager.getSubscription())
// on every Settings render. Notification.permission alone can't tell
// "never asked" apart from "asked, granted, but the user later disabled it
// in Settings" without a round trip; this flag is only ever set after a
// subscribe() + Supabase upsert both actually succeed, and cleared on
// unsubscribe or a detected failure, so it's a reasonably trustworthy
// "is this actually wired up" signal without an async check on every render.
const ENABLED_KEY = "expense_tracker_push_enabled_v1";

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// "unsupported" | "denied" | "enabled" | "off" -- what Settings actually
// renders. Distinct from raw Notification.permission because "granted"
// alone doesn't mean *this app's* subscription is still active (the user
// could have toggled reminders off in-app without revoking the OS-level
// permission, which stays "granted" either way).
export function pushReminderState() {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted" && localStorage.getItem(ENABLED_KEY) === "1") return "enabled";
  return "off";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Must be called from a real user gesture (a click handler), never on
// page load -- both because most browsers require it for
// Notification.requestPermission() to do anything but auto-deny, and
// because asking on load is exactly the kind of nagging this is supposed
// to avoid.
export async function enableBillReminders() {
  const l = L();
  if (!isPushSupported()) { showToast(l.toastPushUnsupported); return; }
  if (!currentUser) { showToast(l.toastPushNeedsSignIn); return; }
  if (Notification.permission === "denied") { showToast(l.toastPushDenied); return; }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return; // silent -- the user said no, that's the end of it, no nagging
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const json = subscription.toJSON();
    const { error } = await sb.from("push_subscriptions").upsert(
      { user_id: currentUser.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, updated_at: new Date().toISOString() },
      { onConflict: "endpoint" }
    );
    if (error) throw error;
    localStorage.setItem(ENABLED_KEY, "1");
    showToast(l.toastPushEnabled);
  } catch (e) {
    showToast(l.toastPushError);
  }
}

export async function disableBillReminders() {
  const l = L();
  localStorage.removeItem(ENABLED_KEY);
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (sb && currentUser) await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    showToast(l.toastPushDisabled);
  } catch (e) {
    // Local flag is already cleared either way -- Settings won't offer to
    // turn it back "off" again, and a stale server-side row with no
    // matching browser subscription just fails silently on next send
    // (the edge function prunes it then, same as any other expired one).
    showToast(l.toastPushDisabled);
  }
}
